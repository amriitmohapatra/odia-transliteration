import Cocoa

struct OCRWord {
    let text: String
    let conf: Double
    let box: CGRect
}

struct OCRLine {
    var words: [OCRWord]

    /// For the results page: { words: [{ text, conf, box: { x0, y0, x1, y1 } }] }.
    var json: [String: Any] {
        ["words": words.map { w in
            ["text": w.text, "conf": w.conf,
             "box": ["x0": Double(w.box.minX), "y0": Double(w.box.minY), "x1": Double(w.box.maxX), "y1": Double(w.box.maxY)]] as [String: Any]
        }]
    }
}

struct OCRResult {
    let lines: [OCRLine]
    let engine: String
}

enum OCRError: LocalizedError {
    case noTesseract
    case noModel
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .noTesseract:
            return "The tesseract program is not installed. In Terminal: brew install tesseract"
        case .noModel:
            return "The Odia model (ori.traineddata) is missing from the app. Build it again with ./build.sh"
        case .failed(let why):
            return "tesseract failed: \(why)"
        }
    }
}

/// Reads Odia with the `tesseract` program (Homebrew) and the Odia model packed in the app.
/// One function, so another engine (the extension's WebAssembly one) can be tried later.
enum OCR {
    static let places = ["/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"]
    static var program: String? { places.first { FileManager.default.isExecutableFile(atPath: $0) } }
    static var tessdata: URL { Bundle.main.resourceURL!.appendingPathComponent("tessdata") }
    private static var versionText: String?

    /// `oneLine`: the frame holds one line (single-line mode reads it better).
    static func read(_ image: CGImage, oneLine: Bool) async throws -> OCRResult {
        guard let exe = program else { throw OCRError.noTesseract }
        guard FileManager.default.fileExists(atPath: tessdata.appendingPathComponent("ori.traineddata").path) else {
            throw OCRError.noModel
        }
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("odia-lens-\(UUID().uuidString)")
        let png = base.appendingPathExtension("png")
        let tsv = base.appendingPathExtension("tsv")
        defer {
            try? FileManager.default.removeItem(at: png)
            try? FileManager.default.removeItem(at: tsv)
        }
        let rep = NSBitmapImageRep(cgImage: enlarged(image))
        guard let data = rep.representation(using: .png, properties: [:]) else { throw OCRError.failed("could not make a PNG") }
        try data.write(to: png)
        // Output goes to a file, not a pipe: a long result cannot block the program.
        _ = try await run(exe, [png.path, base.path, "--tessdata-dir", tessdata.path, "-l", "ori", "--psm", oneLine ? "13" : "6", "tsv"])
        let text = try String(contentsOf: tsv, encoding: .utf8)
        if versionText == nil {
            let v = (try? await run(exe, ["--version"])) ?? ""
            versionText = v.split(separator: "\n").first.map(String.init) ?? "tesseract"
        }
        return OCRResult(lines: parse(tsv: text), engine: versionText ?? "tesseract")
    }

    /// Small print reads better larger: images under 1,200 pixels wide are doubled.
    static func enlarged(_ image: CGImage) -> CGImage {
        guard image.width < 1200 else { return image }
        let w = image.width * 2
        let h = image.height * 2
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return image }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage() ?? image
    }

    /// Tesseract's TSV: level page block paragraph line word left top width height conf text.
    static func parse(tsv: String) -> [OCRLine] {
        var order: [String] = []
        var lines: [String: OCRLine] = [:]
        for row in tsv.split(separator: "\n").dropFirst() {
            let c = row.split(separator: "\t", omittingEmptySubsequences: false)
            guard c.count >= 12, c[0] == "5",
                  let left = Double(c[6]), let top = Double(c[7]), let width = Double(c[8]), let height = Double(c[9]),
                  let conf = Double(c[10]), conf >= 0 else { continue }
            let text = c[11...].joined(separator: "\t").trimmingCharacters(in: .whitespaces)
            if text.isEmpty { continue }
            let key = "\(c[2])-\(c[3])-\(c[4])"
            if lines[key] == nil {
                order.append(key)
                lines[key] = OCRLine(words: [])
            }
            lines[key]?.words.append(OCRWord(text: text, conf: conf, box: CGRect(x: left, y: top, width: width, height: height)))
        }
        return order.compactMap { lines[$0] }
    }

    @discardableResult
    static func run(_ exe: String, _ arguments: [String]) async throws -> String {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<String, Error>) in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: exe)
            process.arguments = arguments
            let out = Pipe()
            let err = Pipe()
            process.standardOutput = out
            process.standardError = err
            process.terminationHandler = { p in
                let o = out.fileHandleForReading.readDataToEndOfFile()
                let e = err.fileHandleForReading.readDataToEndOfFile()
                if p.terminationStatus == 0 {
                    done.resume(returning: String(decoding: o, as: UTF8.self))
                } else {
                    done.resume(throwing: OCRError.failed(String(decoding: e, as: UTF8.self)))
                }
            }
            do {
                try process.run()
            } catch {
                done.resume(throwing: error)
            }
        }
    }
}
