// Spike S4 input controller.
//
// PURPOSE: prove the OS integration works end to end — that an unsigned (ad-hoc signed)
// input method built with a free Apple ID can (a) appear in Input Sources, (b) actually
// receive keystrokes, and (c) commit Odia text into arbitrary apps on macOS 26.
//
// It deliberately does NOT contain the real engine. A tiny hardcoded table stands in for
// it. Once S4 passes, this controller keeps its structure and EngineBridge.swift swaps
// the table for JavaScriptCore running the real engine.js.

import Cocoa
import InputMethodKit

@objc(OdiaInputController)
final class OdiaInputController: IMKInputController {

    /// Roman text typed so far but not yet committed.
    private var composing = ""

    // Stand-in for the real engine. Note the nukta characters here are DECOMPOSED
    // (U+0B21 + U+0B3C), never the precomposed U+0B5C — the project-wide invariant.
    private static let stubTable: [String: String] = [
        "odia":     "\u{0B13}\u{0B21}\u{0B3C}\u{0B3F}\u{0B06}",       // ଓଡ଼ିଆ
        "odisha":   "\u{0B13}\u{0B21}\u{0B3C}\u{0B3F}\u{0B36}\u{0B3E}", // ଓଡ଼ିଶା
        "namaskar": "\u{0B28}\u{0B2E}\u{0B38}\u{0B4D}\u{0B15}\u{0B3E}\u{0B30}", // ନମସ୍କାର
        "bhala":    "\u{0B2D}\u{0B32}",                                 // ଭଲ
        "paani":    "\u{0B2A}\u{0B3E}\u{0B23}\u{0B3F}",                 // ପାଣି
    ]

    // MARK: - Event handling

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        guard let event, event.type == .keyDown else { return false }
        guard let client = sender as? IMKTextInput else { return false }

        // Let the host app handle anything with a command/control modifier.
        if event.modifierFlags.contains(.command) || event.modifierFlags.contains(.control) {
            commit(into: client)
            return false
        }

        switch event.keyCode {
        case 51: // delete
            guard !composing.isEmpty else { return false }
            composing.removeLast()
            updateMarkedText(in: client)
            return true

        case 53: // escape — abandon the composition, keep the roman text
            guard !composing.isEmpty else { return false }
            let raw = composing
            composing = ""
            client.insertText(raw, replacementRange: NSRange(location: NSNotFound, length: 0))
            return true

        case 36, 76: // return / enter — commit whatever is buffered
            guard !composing.isEmpty else { return false }
            commit(into: client)
            return true

        case 49: // space — transliterate, then a space
            guard !composing.isEmpty else { return false }
            commit(into: client, trailing: " ")
            return true

        default:
            guard let chars = event.characters, !chars.isEmpty else { return false }

            // Only buffer plain ASCII letters; everything else flushes and passes through.
            if chars.count == 1, let scalar = chars.unicodeScalars.first,
               CharacterSet.letters.contains(scalar), scalar.isASCII {
                composing += chars
                updateMarkedText(in: client)
                return true
            }

            commit(into: client)
            return false
        }
    }

    // MARK: - Composition

    private func updateMarkedText(in client: IMKTextInput) {
        let attributed = NSAttributedString(
            string: composing,
            attributes: [.underlineStyle: NSUnderlineStyle.single.rawValue]
        )
        client.setMarkedText(
            attributed,
            selectionRange: NSRange(location: composing.count, length: 0),
            replacementRange: NSRange(location: NSNotFound, length: 0)
        )
    }

    private func commit(into client: IMKTextInput, trailing: String = "") {
        guard !composing.isEmpty else {
            if !trailing.isEmpty {
                client.insertText(trailing, replacementRange: NSRange(location: NSNotFound, length: 0))
            }
            return
        }

        let odia = Self.stubTable[composing.lowercased()] ?? composing
        composing = ""
        client.insertText(odia + trailing, replacementRange: NSRange(location: NSNotFound, length: 0))
    }

    override func commitComposition(_ sender: Any!) {
        guard let client = sender as? IMKTextInput else { return }
        commit(into: client)
    }

    override func composedString(_ sender: Any!) -> Any! {
        composing
    }

    override func deactivateServer(_ sender: Any!) {
        if let client = sender as? IMKTextInput { commit(into: client) }
        super.deactivateServer(sender)
    }
}
