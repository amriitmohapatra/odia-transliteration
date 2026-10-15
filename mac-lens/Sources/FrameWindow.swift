import Cocoa

@MainActor
protocol FrameWindowDelegate: AnyObject {
    /// The frame is moving or changing size (the results panel follows it).
    func frameDidMove(_ frame: FrameWindow)
    /// The frame has stopped for a moment: read what is under it.
    func frameDidSettle(_ frame: FrameWindow)
}

/// The see-through frame: an orange bar to drag it by, a border, and a corner
/// to resize it. The inside is not drawn at all, so the screen shows through.
final class FrameWindow: NSPanel, NSWindowDelegate {
    static let barHeight: CGFloat = 22
    static let border: CGFloat = 3
    /// Sizes of the inside of the frame, in points.
    static let sizes: [(name: String, size: NSSize)] = [
        ("Word", NSSize(width: 190, height: 56)),
        ("Line", NSSize(width: 560, height: 70)),
        ("Paragraph", NSSize(width: 560, height: 240)),
    ]

    weak var lensDelegate: FrameWindowDelegate?

    init(size: NSSize) {
        let rect = NSRect(x: 0, y: 0, width: size.width, height: size.height + FrameWindow.barHeight)
        super.init(contentRect: rect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        isFloatingPanel = true
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        minSize = NSSize(width: 80, height: 30 + FrameWindow.barHeight)
        delegate = self
        let view = FrameView(frame: rect)
        view.autoresizingMask = [.width, .height]
        contentView = view
    }

    required init?(coder: NSCoder) {
        fatalError("FrameWindow is made in code only")
    }

    override var canBecomeKey: Bool { true }

    /// The inside of the frame (under the bar, inside the border), in screen coordinates.
    var readingRect: NSRect {
        var r = frame
        r.size.height -= FrameWindow.barHeight // the bar is at the top; the origin is the bottom-left corner
        return r.insetBy(dx: FrameWindow.border, dy: FrameWindow.border)
    }

    /// Set the size of the inside, keeping the top-left corner where it is.
    func setInsideSize(_ size: NSSize) {
        var f = frame
        let top = f.maxY
        f.size = NSSize(width: size.width, height: size.height + FrameWindow.barHeight)
        f.origin.y = top - f.size.height
        setFrame(f, display: true)
        settleSoon()
    }

    func windowDidMove(_ notification: Notification) {
        lensDelegate?.frameDidMove(self)
        settleSoon()
    }

    func windowDidResize(_ notification: Notification) {
        lensDelegate?.frameDidMove(self)
        settleSoon()
    }

    /// Read when the frame has not moved for a third of a second (a delayed call on the main thread).
    func settleSoon() {
        NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(settled), object: nil)
        perform(#selector(settled), with: nil, afterDelay: 0.35)
    }

    @objc private func settled() {
        lensDelegate?.frameDidSettle(self)
    }
}

/// Draws the bar, the border and the resize corner; moves and resizes the window.
final class FrameView: NSView {
    private let corner: CGFloat = 16
    private var resizing = false
    private var dragStart = NSPoint.zero
    private var startFrame = NSRect.zero
    private let orange = NSColor(calibratedRed: 0.76, green: 0.25, blue: 0.05, alpha: 1)

    private var barRect: NSRect {
        NSRect(x: 0, y: bounds.height - FrameWindow.barHeight, width: bounds.width, height: FrameWindow.barHeight)
    }

    private var cornerRect: NSRect {
        NSRect(x: bounds.width - corner, y: 0, width: corner, height: corner)
    }

    override func draw(_ dirtyRect: NSRect) {
        orange.setFill()
        NSBezierPath(roundedRect: barRect, xRadius: 4, yRadius: 4).fill()
        let label = "Odia Lens \u{00B7} drag here \u{00B7} resize at the corner" as NSString
        label.draw(
            at: NSPoint(x: 8, y: barRect.minY + 4),
            withAttributes: [.font: NSFont.systemFont(ofSize: 11, weight: .medium), .foregroundColor: NSColor.white]
        )
        let inside = NSRect(x: 0, y: 0, width: bounds.width, height: bounds.height - FrameWindow.barHeight)
        let outline = NSBezierPath(rect: inside.insetBy(dx: FrameWindow.border / 2, dy: FrameWindow.border / 2))
        outline.lineWidth = FrameWindow.border
        orange.setStroke()
        outline.stroke()
        NSBezierPath(rect: cornerRect).fill()
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        resizing = cornerRect.contains(point)
        if !resizing {
            window?.performDrag(with: event)
            return
        }
        dragStart = NSEvent.mouseLocation
        startFrame = window?.frame ?? .zero
    }

    override func mouseDragged(with event: NSEvent) {
        guard resizing, let window = window else { return }
        let now = NSEvent.mouseLocation
        var f = startFrame
        f.size.width = max(window.minSize.width, startFrame.width + (now.x - dragStart.x))
        f.size.height = max(window.minSize.height, startFrame.height - (now.y - dragStart.y))
        f.origin.y = startFrame.maxY - f.size.height // the top stays put
        window.setFrame(f, display: true)
    }

    override func mouseUp(with event: NSEvent) {
        resizing = false
    }

    override func resetCursorRects() {
        addCursorRect(cornerRect, cursor: .crosshair)
        addCursorRect(barRect, cursor: .openHand)
    }
}
