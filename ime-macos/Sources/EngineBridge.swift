// The real engine inside the input method (V5, Stage C): JavaScriptCore runs
// Resources/engine.js (built from ime-macos/js/bridge.ts by ime-macos/build.mjs), the
// same TypeScript engine as the website, with the same data files.
//
// Swift reads the files and hands them over as strings; all key handling is in
// js/composer.ts (unit-tested). One JSContext, used only on the main thread.

import Foundation
import JavaScriptCore

/// What the composer returns for one key (js/composer.ts `Step`).
struct Step: Decodable {
    struct View: Decodable {
        let roman: String
        let marked: String
        let candidates: [String]
        let selected: Int
    }
    let handled: Bool
    let commit: String
    let view: View

    static let pass = Step(handled: false, commit: "", view: View(roman: "", marked: "", candidates: [], selected: 0))
}

final class EngineBridge {
    static let shared = EngineBridge()

    private let context: JSContext
    private var api: JSValue?
    /// Empty when the engine is ready; otherwise why it is not (logged once).
    private(set) var problem = ""

    private static let learnedKey = "learnedChoices"
    /// Files in Resources/data, by the names js/bridge.ts `Files` expects.
    private static let dataFiles = [
        "unified.toml", "itrans.toml", "lexicon-web.tsv", "sanskrit-lexicon-web.tsv",
        "unigrams-web.tsv", "sanskrit-unigrams-web.tsv", "bigrams-web.tsv", "typed.tsv",
        "nextword.tsv", "preferences.tsv", "labels.tsv", "converter.bin.b64",
    ]

    private init() {
        context = JSContext()!
        context.exceptionHandler = { _, exception in
            NSLog("[OdiaPhonetic] JavaScript error: %@", exception?.toString() ?? "unknown")
        }
        load()
    }

    private func load() {
        guard let resources = Bundle.main.resourceURL,
              let script = try? String(contentsOf: resources.appendingPathComponent("engine.js"), encoding: .utf8) else {
            problem = "engine.js is missing from the app bundle"
            NSLog("[OdiaPhonetic] %@", problem)
            return
        }
        context.evaluateScript(script, withSourceURL: URL(string: "engine.js"))
        guard let ime = context.objectForKeyedSubscript("OdiaIME"), !ime.isUndefined else {
            problem = "engine.js did not define OdiaIME"
            NSLog("[OdiaPhonetic] %@", problem)
            return
        }
        var files: [String: String] = [:]
        let data = resources.appendingPathComponent("data")
        for name in Self.dataFiles {
            if let text = try? String(contentsOf: data.appendingPathComponent(name), encoding: .utf8) {
                files[name] = text
            }
        }
        let learned = UserDefaults.standard.string(forKey: Self.learnedKey) ?? ""
        let started = Date()
        let result = ime.invokeMethod("load", withArguments: [files, learned])?.toString() ?? "no answer"
        if result.isEmpty {
            api = ime
            NSLog("[OdiaPhonetic] engine ready in %.2f s", Date().timeIntervalSince(started))
        } else {
            problem = result
            NSLog("[OdiaPhonetic] engine failed: %@", result)
        }
    }

    /// One key. `kind` is char/space/enter/backspace/escape/up/down/tab.
    func key(_ kind: String, _ char: String = "") -> Step {
        guard let api,
              let json = api.invokeMethod("key", withArguments: [kind, char])?.toString(),
              let data = json.data(using: .utf8),
              let step = try? JSONDecoder().decode(Step.self, from: data) else { return .pass }
        return step
    }

    /// The word being composed, committed as Odia ('' when none).
    func flush() -> String {
        api?.invokeMethod("flush", withArguments: [])?.toString() ?? ""
    }

    /// Save the user's choices, so a word picked often comes first after a restart too.
    func saveLearned() {
        guard let json = api?.invokeMethod("learned", withArguments: [])?.toString() else { return }
        UserDefaults.standard.set(json, forKey: Self.learnedKey)
    }
}
