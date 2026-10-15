import Cocoa

@MainActor
protocol FrameWindowDelegate: AnyObject {
    /// The frame is moving or changing size (the results panel follows it).
    func frameDidMove(_ frame: FrameWindow)
    /// The frame has stopped for a moment: read what is under it.
    func frameDidSettle(_ frame: FrameWindow)
    /// The reader pressed the read-again button on the bar.
    func frameWantsRead(_ frame: FrameWindow)
    /// The reader pressed the close button on the bar.
    func frameWantsClose(_ frame: FrameWindow)
}

/// The see-through frame, in the same Puri/Konark look as the browser lens
/// (lens/src/frame.ts): a Nilachakra-indigo bar with the Konark wheel above a
/// Pattachitra border (hingula red, haritala yellow, lamp-black hairline) with
/// diamond corner marks. Every edge and corner resizes it; the bar moves it.
///
/// The window is larger than the frame by a margin on each side: the margin
/// holds the resize zones and the corner marks. The inside of the frame is not
/// drawn at all, so the screen shows through and clicks go to the app below.
/// The capture leaves out this window (Capture.swift), so nothing drawn here is
/// ever read.
final class FrameWindow: NSPanel, NSWindowDelegate {
    static let barHeight: CGFloat = 30
    static let barGap: CGFloat = 8
    static let margin: CGFloat = 10
    static let border: CGFloat = 3
    /// Sizes of the frame (inside its outer edge), in points.
    static let sizes: [(name: String, size: NSSize)] = [
        ("Word", NSSize(width: 190, height: 56)),
        ("Line", NSSize(width: 560, height: 70)),
        ("Para", NSSize(width: 560, height: 240)),
    ]
    static let minimum = NSSize(width: 70, height: 30)

    weak var lensDelegate: FrameWindowDelegate?

    /// The frame in screen coordinates (its outer edge, border included).
    private(set) var inside: NSRect
    private var frameView: FrameView!

    init(size: NSSize) {
        inside = NSRect(origin: .zero, size: size)
        super.init(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        isFloatingPanel = true
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        delegate = self
        frameView = FrameView(frame: .zero)
        frameView.autoresizingMask = [.width, .height]
        contentView = frameView
        place(inside)
    }

    required init?(coder: NSCoder) {
        fatalError("FrameWindow is made in code only")
    }

    override var canBecomeKey: Bool { true }

    /// The area that is read: the inside of the border, in screen coordinates.
    var readingRect: NSRect {
        inside.insetBy(dx: FrameWindow.border, dy: FrameWindow.border)
    }

    /// The index in `sizes` of the current size, if it is one of them.
    var sizeIndex: Int? {
        FrameWindow.sizes.firstIndex { abs($0.size.width - inside.width) < 1 && abs($0.size.height - inside.height) < 1 }
    }

    /// Show that a reading is under way (the wheel turns, the border goes yellow).
    var isReading: Bool = false {
        didSet { frameView.setReading(isReading) }
    }

    /// Put the frame at `rect` (screen coordinates) and size the window around it.
    func place(_ rect: NSRect) {
        var r = rect
        r.size.width = max(FrameWindow.minimum.width, r.width)
        r.size.height = max(FrameWindow.minimum.height, r.height)
        inside = r
        let m = FrameWindow.margin
        let width = max(r.width + 2 * m, FrameView.barWidth + m)
        let height = r.height + 2 * m + FrameWindow.barGap + FrameWindow.barHeight
        setFrame(NSRect(x: r.minX - m, y: r.minY - m, width: width, height: height), display: true)
        frameView.needsDisplay = true
        frameView.window?.invalidateCursorRects(for: frameView)
    }

    /// Set the size of the frame, keeping its top-left corner where it is.
    func setInsideSize(_ size: NSSize) {
        place(NSRect(x: inside.minX, y: inside.maxY - size.height, width: size.width, height: size.height))
        settleSoon()
    }

    /// Put the frame in the middle of the screen.
    override func center() {
        guard let screen = screen ?? NSScreen.main else { return }
        let v = screen.visibleFrame
        place(NSRect(x: v.midX - inside.width / 2, y: v.midY - inside.height / 2, width: inside.width, height: inside.height))
    }

    func windowDidMove(_ notification: Notification) {
        // The bar was dragged: the frame moved with the window.
        let m = FrameWindow.margin
        inside.origin = NSPoint(x: frame.minX + m, y: frame.minY + m)
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

    fileprivate func pressed(_ button: FrameView.Button) {
        switch button {
        case .size(let index): setInsideSize(FrameWindow.sizes[index].size)
        case .readAgain: lensDelegate?.frameWantsRead(self)
        case .close: lensDelegate?.frameWantsClose(self)
        }
    }

    /// While an edge or corner is dragged: no reading until it is let go.
    fileprivate func resizeEnded() {
        lensDelegate?.frameDidMove(self)
        settleSoon()
    }
}

/// The theme (lens/src/frame.ts uses the same values).
private enum Konark {
    static func rgb(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
    }
    static let nila = rgb(0x1e2f5c)
    static let nilaDeep = rgb(0x15213f)
    static let hingula = rgb(0xb7321e)
    static let haritala = rgb(0xe8b23a)
    static let shankha = rgb(0xfbf6ea)
    static let kajal = rgb(0x1c1712)
}

/// Draws the bar, the border and the corner marks; moves and resizes the frame.
final class FrameView: NSView {
    enum Button: Equatable {
        case size(Int)
        case readAgain
        case close
    }

    private enum Grab {
        case none
        case edges(left: Bool, right: Bool, bottom: Bool, top: Bool)
        case button(Button)
    }

    /// The bar's width (points): wheel and name, three sizes, read again, close.
    static let barWidth: CGFloat = 330
    private static let hit: CGFloat = 7 // half the width of an edge's resize zone
    private static let cornerHit: CGFloat = 12

    private var grab = Grab.none
    private var startMouse = NSPoint.zero
    private var startInside = NSRect.zero
    private var hover: Button?
    private var reading = false
    private var angle: CGFloat = 0

    override var isFlipped: Bool { false }

    private var lens: FrameWindow? { window as? FrameWindow }

    /// The frame in this view's coordinates.
    private var frameRect: NSRect {
        guard let lens = lens else { return .zero }
        let m = FrameWindow.margin
        return NSRect(x: m, y: m, width: lens.inside.width, height: lens.inside.height)
    }

    private var barRect: NSRect {
        NSRect(x: FrameWindow.margin - 4, y: bounds.height - FrameWindow.barHeight, width: FrameView.barWidth, height: FrameWindow.barHeight)
    }

    /// The bar's buttons and where they are.
    private var buttons: [(Button, String, NSRect)] {
        let bar = barRect
        var x = bar.minX + 112
        var out: [(Button, String, NSRect)] = []
        let y = bar.minY + 4
        let h = bar.height - 8
        for (index, size) in FrameWindow.sizes.enumerated() {
            let w: CGFloat = size.name == "Word" ? 50 : 44
            out.append((.size(index), size.name, NSRect(x: x, y: y, width: w, height: h)))
            x += w
        }
        x += 12
        out.append((.readAgain, "\u{21BB}", NSRect(x: x, y: y, width: 32, height: h)))
        x += 32
        out.append((.close, "\u{2715}", NSRect(x: x, y: y, width: 32, height: h)))
        return out
    }

    func setReading(_ on: Bool) {
        reading = on
        needsDisplay = true
        if on && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { turn() }
    }

    /// Turn the wheel while reading (a delayed call on the main thread, 30 times a second).
    @objc private func turn() {
        NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(turn), object: nil)
        guard reading else { return }
        angle -= .pi / 24
        setNeedsDisplay(barRect)
        perform(#selector(turn), with: nil, afterDelay: 1.0 / 30)
    }

    // MARK: Drawing

    override func draw(_ dirtyRect: NSRect) {
        let f = frameRect
        // A trace of colour in the margin ring: clicks on fully clear pixels of a
        // borderless window go to the window below, and the edges must catch them.
        NSColor(white: 0, alpha: 0.02).setFill()
        let ring = NSBezierPath(rect: f.insetBy(dx: -FrameView.hit - 2, dy: -FrameView.hit - 2))
        ring.append(NSBezierPath(rect: f.insetBy(dx: FrameView.hit, dy: FrameView.hit)))
        ring.windingRule = .evenOdd
        ring.fill()

        // The Pattachitra border: black hairline, yellow ring, red band.
        stroke(f.insetBy(dx: -2.5, dy: -2.5), Konark.kajal, 1)
        stroke(f.insetBy(dx: -1, dy: -1), Konark.haritala, 2)
        stroke(f.insetBy(dx: FrameWindow.border / 2, dy: FrameWindow.border / 2), reading ? Konark.haritala : Konark.hingula, FrameWindow.border)

        // Diamond corner marks, just outside the reading area.
        for p in [NSPoint(x: f.minX, y: f.minY), NSPoint(x: f.maxX, y: f.minY), NSPoint(x: f.minX, y: f.maxY), NSPoint(x: f.maxX, y: f.maxY)] {
            let d = NSBezierPath()
            d.move(to: NSPoint(x: p.x, y: p.y + 6))
            d.line(to: NSPoint(x: p.x + 6, y: p.y))
            d.line(to: NSPoint(x: p.x, y: p.y - 6))
            d.line(to: NSPoint(x: p.x - 6, y: p.y))
            d.close()
            Konark.haritala.setFill()
            d.fill()
            Konark.kajal.setStroke()
            d.lineWidth = 1.5
            d.stroke()
        }

        drawBar()
    }

    private func stroke(_ rect: NSRect, _ color: NSColor, _ width: CGFloat) {
        let path = NSBezierPath(rect: rect)
        path.lineWidth = width
        color.setStroke()
        path.stroke()
    }

    private func drawBar() {
        let bar = barRect
        let shape = NSBezierPath(roundedRect: bar.insetBy(dx: 0.5, dy: 0.5), xRadius: 9, yRadius: 9)
        Konark.nila.setFill()
        shape.fill()
        Konark.nilaDeep.setStroke()
        shape.lineWidth = 1
        shape.stroke()

        drawWheel(center: NSPoint(x: bar.minX + 17, y: bar.midY), radius: 10)
        let brand = NSFont(name: "Palatino-BoldItalic", size: 13.5) ?? NSFont.boldSystemFont(ofSize: 13)
        ("Odia Lens" as NSString).draw(
            at: NSPoint(x: bar.minX + 33, y: bar.midY - 8),
            withAttributes: [.font: brand, .foregroundColor: Konark.shankha]
        )

        // The sizes sit in a darker well.
        let sizeRects = buttons.compactMap { (entry) -> NSRect? in
            if case .size = entry.0 { return entry.2 }
            return nil
        }
        if let first = sizeRects.first, let last = sizeRects.last {
            NSColor(white: 0, alpha: 0.22).setFill()
            NSBezierPath(roundedRect: first.union(last).insetBy(dx: -2, dy: -1), xRadius: 7, yRadius: 7).fill()
        }
        let current = lens?.sizeIndex
        for (button, label, rect) in buttons {
            var color = Konark.shankha
            var font = NSFont.systemFont(ofSize: 12)
            if case .size(let index) = button, index == current {
                Konark.haritala.setFill()
                NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6).fill()
                color = Konark.kajal
                font = NSFont.systemFont(ofSize: 12, weight: .semibold)
            } else if hover == button {
                Konark.haritala.withAlphaComponent(0.2).setFill()
                NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6).fill()
            }
            let text = label as NSString
            let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
            let size = text.size(withAttributes: attributes)
            text.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2), withAttributes: attributes)
        }
        // A thin line between the sizes and the other two buttons.
        if let last = sizeRects.last {
            Konark.shankha.withAlphaComponent(0.2).setFill()
            NSRect(x: last.maxX + 6, y: bar.minY + 7, width: 1, height: bar.height - 14).fill()
        }
    }

    /// The Konark wheel: rim, inner ring, eight broad spokes, eight thin ones, hub.
    private func drawWheel(center c: NSPoint, radius r: CGFloat) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.saveGState()
        context.translateBy(x: c.x, y: c.y)
        context.rotate(by: angle)
        Konark.haritala.setStroke()
        Konark.haritala.setFill()
        let rim = NSBezierPath(ovalIn: NSRect(x: -r, y: -r, width: 2 * r, height: 2 * r).insetBy(dx: 1, dy: 1))
        rim.lineWidth = 1.8
        rim.stroke()
        let ring = NSBezierPath(ovalIn: NSRect(x: -r * 0.74, y: -r * 0.74, width: r * 1.48, height: r * 1.48))
        ring.lineWidth = 0.7
        ring.stroke()
        for i in 0..<16 {
            let a = CGFloat(i) * .pi / 8
            let spoke = NSBezierPath()
            spoke.move(to: NSPoint(x: cos(a) * r * 0.22, y: sin(a) * r * 0.22))
            spoke.line(to: NSPoint(x: cos(a) * r * 0.74, y: sin(a) * r * 0.74))
            spoke.lineWidth = i % 2 == 0 ? 1.5 : 0.6
            spoke.lineCapStyle = .round
            spoke.stroke()
        }
        NSBezierPath(ovalIn: NSRect(x: -r * 0.22, y: -r * 0.22, width: r * 0.44, height: r * 0.44)).fill()
        context.restoreGState()
    }

    // MARK: Mouse

    private func grabAt(_ p: NSPoint) -> Grab {
        if barRect.contains(p) {
            for (button, _, rect) in buttons where rect.contains(p) { return .button(button) }
            return .none
        }
        let f = frameRect
        let near = f.insetBy(dx: -FrameView.hit, dy: -FrameView.hit)
        guard near.contains(p) else { return .none }
        let c = FrameView.cornerHit
        let left = p.x < f.minX + (p.y < f.minY + c || p.y > f.maxY - c ? c : FrameView.hit)
        let right = p.x > f.maxX - (p.y < f.minY + c || p.y > f.maxY - c ? c : FrameView.hit)
        let bottom = p.y < f.minY + (p.x < f.minX + c || p.x > f.maxX - c ? c : FrameView.hit)
        let top = p.y > f.maxY - (p.x < f.minX + c || p.x > f.maxX - c ? c : FrameView.hit)
        if !(left || right || bottom || top) { return .none }
        return .edges(left: left, right: right, bottom: bottom, top: top)
    }

    override func mouseDown(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        grab = grabAt(p)
        switch grab {
        case .none:
            if barRect.contains(p) { window?.performDrag(with: event) }
        case .edges:
            startMouse = NSEvent.mouseLocation
            startInside = lens?.inside ?? .zero
        case .button:
            break
        }
    }

    override func mouseDragged(with event: NSEvent) {
        guard case let .edges(left, right, bottom, top) = grab, let lens = lens else { return }
        let now = NSEvent.mouseLocation
        let dx = now.x - startMouse.x
        let dy = now.y - startMouse.y
        let s = startInside
        let minimum = FrameWindow.minimum
        var r = s
        if right { r.size.width = max(minimum.width, s.width + dx) }
        if left {
            r.size.width = max(minimum.width, s.width - dx)
            r.origin.x = s.maxX - r.width
        }
        if top { r.size.height = max(minimum.height, s.height + dy) }
        if bottom {
            r.size.height = max(minimum.height, s.height - dy)
            r.origin.y = s.maxY - r.height
        }
        lens.place(r)
    }

    override func mouseUp(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        switch grab {
        case .edges:
            lens?.resizeEnded()
        case .button(let button):
            if case .button(let under) = grabAt(p), under == button { lens?.pressed(button) }
        case .none:
            break
        }
        grab = .none
        needsDisplay = true
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(rect: barRect, options: [.mouseMoved, .mouseEnteredAndExited, .activeAlways], owner: self))
    }

    override func mouseMoved(with event: NSEvent) {
        var now: Button?
        if case .button(let b) = grabAt(convert(event.locationInWindow, from: nil)) { now = b }
        if now != hover {
            hover = now
            setNeedsDisplay(barRect)
        }
    }

    override func mouseExited(with event: NSEvent) {
        hover = nil
        setNeedsDisplay(barRect)
    }

    override func resetCursorRects() {
        let f = frameRect
        let h = FrameView.hit
        let c = FrameView.cornerHit
        addCursorRect(barRect, cursor: .openHand)
        for (_, _, rect) in buttons { addCursorRect(rect, cursor: .pointingHand) }
        // Edges (between the corners).
        addCursorRect(NSRect(x: f.minX - h, y: f.minY + c, width: 2 * h, height: f.height - 2 * c), cursor: .resizeLeftRight)
        addCursorRect(NSRect(x: f.maxX - h, y: f.minY + c, width: 2 * h, height: f.height - 2 * c), cursor: .resizeLeftRight)
        addCursorRect(NSRect(x: f.minX + c, y: f.minY - h, width: f.width - 2 * c, height: 2 * h), cursor: .resizeUpDown)
        addCursorRect(NSRect(x: f.minX + c, y: f.maxY - h, width: f.width - 2 * c, height: 2 * h), cursor: .resizeUpDown)
        // Corners: macOS 14 has no public diagonal resize cursor; a crosshair marks them.
        for p in [NSPoint(x: f.minX, y: f.minY), NSPoint(x: f.maxX, y: f.minY), NSPoint(x: f.minX, y: f.maxY), NSPoint(x: f.maxX, y: f.maxY)] {
            addCursorRect(NSRect(x: p.x - c, y: p.y - c, width: 2 * c, height: 2 * c), cursor: .crosshair)
        }
    }
}
