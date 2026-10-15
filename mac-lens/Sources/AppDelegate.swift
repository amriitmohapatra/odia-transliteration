import Cocoa

/// Owns the frame, the results panel and the menu bar item, and runs a reading
/// whenever the frame stops moving.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, FrameWindowDelegate {
    private var statusItem: NSStatusItem?
    private var frameWindow: FrameWindow!
    private var results: ResultsPanel!
    private var reading = false
    private var readAgain = false
    /// Point mode (V4.8): the word under the pointer in any app, read through Accessibility.
    private var card: CardPanel!
    private var pointMode = false
    private var pointItem: NSMenuItem?
    private var monitor: Any?
    private var lastPoint = CGPoint(x: -1, y: -1)

    func applicationDidFinishLaunching(_ notification: Notification) {
        results = ResultsPanel()
        card = CardPanel()
        frameWindow = FrameWindow(size: FrameWindow.sizes[1].size)
        frameWindow.lensDelegate = self
        frameWindow.center()
        placeResults()
        frameWindow.orderFrontRegardless()
        results.orderFrontRegardless()
        makeMenu()
        Capture.askForPermissionOnce()
        frameWindow.settleSoon()
    }

    // MARK: Menu bar item

    private func makeMenu() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "\u{0B13}" // the Odia letter o
        item.button?.toolTip = "Odia Lens"
        let menu = NSMenu()
        add(menu, "Show or hide the lens", #selector(toggleLens), "l")
        menu.addItem(.separator())
        for (index, size) in FrameWindow.sizes.enumerated() {
            let entry = add(menu, "Frame size: \(size.name)", #selector(chooseSize(_:)), "\(index + 1)")
            entry.tag = index
        }
        add(menu, "Read again", #selector(readNow), "r")
        menu.addItem(.separator())
        pointItem = add(menu, "Point at words in any app", #selector(togglePointMode), "p")
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit Odia Lens", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
        item.menu = menu
        statusItem = item
    }

    @discardableResult
    private func add(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: action, keyEquivalent: key)
        entry.target = self
        menu.addItem(entry)
        return entry
    }

    @objc private func toggleLens() {
        if frameWindow.isVisible {
            frameWindow.orderOut(nil)
            results.orderOut(nil)
        } else {
            frameWindow.orderFrontRegardless()
            results.orderFrontRegardless()
            frameWindow.settleSoon()
        }
    }

    @objc private func chooseSize(_ sender: NSMenuItem) {
        frameWindow.setInsideSize(FrameWindow.sizes[sender.tag].size)
    }

    @objc private func readNow() {
        read()
    }

    // MARK: Point mode (V4.8)

    @objc private func togglePointMode() {
        if pointMode {
            stopPointMode()
            return
        }
        // macOS asks the owner once (System Settings > Privacy & Security > Accessibility).
        guard PointReader.trusted(prompt: true) else {
            results.orderFrontRegardless()
            results.show(error: "Point mode needs Accessibility: allow Odia Lens in System Settings > Privacy & Security > Accessibility, then choose \u{201C}Point at words in any app\u{201D} again.")
            return
        }
        pointMode = true
        pointItem?.state = .on
        monitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] _ in
            DispatchQueue.main.async { self?.pointerMoved() }
        }
    }

    private func stopPointMode() {
        pointMode = false
        pointItem?.state = .off
        if let m = monitor { NSEvent.removeMonitor(m) }
        monitor = nil
        NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(pointerRested), object: nil)
        card.orderOut(nil)
    }

    /// Read the word when the pointer rests for a moment (as the browser lens does).
    private func pointerMoved() {
        NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(pointerRested), object: nil)
        perform(#selector(pointerRested), with: nil, afterDelay: 0.35)
    }

    @objc private func pointerRested() {
        guard pointMode else { return }
        let point = PointReader.pointerPoint()
        if abs(point.x - lastPoint.x) < 1 && abs(point.y - lastPoint.y) < 1 && card.isVisible { return }
        lastPoint = point
        guard let hit = PointReader.textAt(point), hit.text.unicodeScalars.contains(where: { (0x0B00...0x0B7F).contains($0.value) }) else {
            card.orderOut(nil)
            return
        }
        card.show(text: hit.text, offset: hit.offset, near: NSEvent.mouseLocation)
    }

    // MARK: FrameWindowDelegate

    func frameDidMove(_ frame: FrameWindow) {
        placeResults()
    }

    func frameDidSettle(_ frame: FrameWindow) {
        read()
    }

    func frameWantsRead(_ frame: FrameWindow) {
        read()
    }

    func frameWantsClose(_ frame: FrameWindow) {
        toggleLens()
    }

    // MARK: Reading

    /// The results panel sits under the frame (above it near the bottom of the screen).
    private func placeResults() {
        let f = frameWindow.inside
        var r = results.frame
        r.size.width = max(f.width, 380)
        r.origin.x = f.minX
        r.origin.y = f.minY - r.height - 12
        if let screen = frameWindow.screen, r.minY < screen.visibleFrame.minY {
            // No room below: above the frame and its bar.
            r.origin.y = f.maxY + FrameWindow.barGap + FrameWindow.barHeight + 8
        }
        results.setFrame(r, display: true)
    }

    private func read() {
        guard frameWindow.isVisible else { return }
        if reading {
            readAgain = true
            return
        }
        let rect = frameWindow.readingRect
        guard let screen = frameWindow.screen ?? NSScreen.main, let target = Capture.Target(rect: rect, screen: screen) else {
            results.show(error: "Could not find the display under the frame.")
            return
        }
        reading = true
        frameWindow.isReading = true
        let own = [CGWindowID(frameWindow.windowNumber), CGWindowID(results.windowNumber)]
        let started = Date()
        Task { @MainActor in
            do {
                let image = try await Capture.image(of: target, excluding: own)
                let result = try await OCR.read(image, oneLine: rect.height < 90)
                let ms = Int(Date().timeIntervalSince(started) * 1000)
                self.results.show(lines: result.lines, ms: ms, engine: result.engine)
            } catch {
                self.results.show(error: error.localizedDescription)
            }
            self.reading = false
            self.frameWindow.isReading = false
            if self.readAgain {
                self.readAgain = false
                self.read()
            }
        }
    }
}
