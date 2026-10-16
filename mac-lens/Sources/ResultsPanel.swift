import Cocoa
import WebKit

/// The panel under the frame: a web page (lens/src/mac.ts, built into the app)
/// that turns the words read into lines, words and meanings.
final class ResultsPanel: NSPanel, WKScriptMessageHandler {
    private let web: WKWebView
    private var ready = false
    private var waiting: String?

    init() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleFiles(), forURLScheme: "odialens")
        let rect = NSRect(x: 0, y: 0, width: 560, height: 280)
        web = WKWebView(frame: rect, configuration: config)
        super.init(contentRect: rect, styleMask: [.titled, .resizable, .utilityWindow, .nonactivatingPanel],
                   backing: .buffered, defer: false)
        title = "Odia Lens"
        level = .floating
        isFloatingPanel = true
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = web
        config.userContentController.add(self, name: "lens")
        web.load(URLRequest(url: URL(string: "odialens://app/index.html")!))
    }

    required init?(coder: NSCoder) {
        fatalError("ResultsPanel is made in code only")
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "ready" || type == "error" {
            ready = true
            if let script = waiting {
                waiting = nil
                web.evaluateJavaScript(script, completionHandler: nil)
            }
        }
    }

    func show(lines: [OCRLine], ms: Int, engine: String) {
        send(["lines": lines.map { $0.json }, "info": ["ms": ms, "engine": engine]])
    }

    func show(error: String) {
        send(["lines": [Any](), "info": ["error": error]])
    }

    private func send(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = "(() => { const p = \(json); window.odiaMac.show(p.lines, p.info); })()"
        if ready {
            web.evaluateJavaScript(script, completionHandler: nil)
        } else {
            waiting = script // the latest reading only
        }
    }
}

/// Serves the page and its dictionary files from the app bundle (Resources/web)
/// under odialens://app/, so the page can fetch them like a web site would.
final class BundleFiles: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL!.appendingPathComponent("web").standardizedFileURL
    private let types = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "json": "application/json",
        "css": "text/css",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        while path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty { path = "index.html" }
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            let missing = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            task.didReceive(missing)
            task.didReceive(Data())
            task.didFinish()
            return
        }
        let type = types[file.pathExtension] ?? "application/octet-stream"
        let headers = ["Content-Type": type, "Content-Length": String(data.count)]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
