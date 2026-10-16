import Cocoa
import WebKit

/// The small card next to the pointer in point mode (V4.8): the same page as the
/// results panel (lens/src/mac.ts), loaded as index.html#card, showing one word.
final class CardPanel: NSPanel, WKScriptMessageHandler {
    private let web: WKWebView
    private var ready = false
    private var waiting: String?
    private var anchor = CGPoint.zero

    init() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleFiles(), forURLScheme: "odialens")
        let rect = NSRect(x: 0, y: 0, width: 340, height: 160)
        web = WKWebView(frame: rect, configuration: config)
        super.init(contentRect: rect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        level = .floating
        isFloatingPanel = true
        hidesOnDeactivate = false
        hasShadow = true
        isOpaque = false
        backgroundColor = .clear
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        web.wantsLayer = true
        web.layer?.cornerRadius = 11
        web.layer?.masksToBounds = true
        contentView = web
        config.userContentController.add(self, name: "lens")
        web.load(URLRequest(url: URL(string: "odialens://app/index.html#card")!))
    }

    required init?(coder: NSCoder) {
        fatalError("CardPanel is made in code only")
    }

    override var canBecomeKey: Bool { false }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready", "error":
            ready = true
            if let script = waiting {
                waiting = nil
                web.evaluateJavaScript(script, completionHandler: nil)
            }
        case "card":
            if body["found"] as? Bool == true, let height = body["height"] as? Double {
                place(height: CGFloat(min(height, 420)))
                orderFrontRegardless()
            } else {
                orderOut(nil)
            }
        default:
            break
        }
    }

    /// Look up the word at `offset` in `text`; the card shows near `point` (screen coordinates, bottom-left origin).
    func show(text: String, offset: Int, near point: CGPoint) {
        anchor = point
        guard let data = try? JSONSerialization.data(withJSONObject: ["text": text, "offset": offset]),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = "(() => { const p = \(json); window.odiaMac.word(p.text, p.offset); })()"
        if ready {
            web.evaluateJavaScript(script, completionHandler: nil)
        } else {
            waiting = script
        }
    }

    /// Under the pointer, or above it near the bottom of the screen; kept on the screen.
    private func place(height: CGFloat) {
        var f = frame
        f.size.height = height
        f.origin.x = anchor.x + 14
        f.origin.y = anchor.y - height - 18
        if let screen = NSScreen.screens.first(where: { $0.frame.contains(anchor) }) ?? NSScreen.main {
            let v = screen.visibleFrame
            if f.minY < v.minY { f.origin.y = anchor.y + 24 }
            f.origin.x = min(max(v.minX + 4, f.origin.x), v.maxX - f.width - 4)
        }
        setFrame(f, display: true)
    }
}
