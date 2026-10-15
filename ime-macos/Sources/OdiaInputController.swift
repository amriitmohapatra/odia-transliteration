// The input controller (V5, Stage C): the real engine through EngineBridge.swift.
//
// This file only translates: an NSEvent becomes a key for js/composer.ts, and the
// composer's answer (text to commit, the underlined word, the candidate list) is
// applied to the app. All decisions are in TypeScript, under unit tests
// (ime-macos/test/). Odia is never typed here: it all comes from the engine.

import Cocoa
import InputMethodKit

@objc(OdiaInputController)
final class OdiaInputController: IMKInputController {

    /// The last answer of the composer: what is shown now.
    private var current = Step.pass

    // MARK: - Event handling

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        guard let event, event.type == .keyDown else { return false }
        guard let client = sender as? IMKTextInput else { return false }

        // Shortcuts belong to the app: commit the word first, then let it through.
        if event.modifierFlags.contains(.command) || event.modifierFlags.contains(.control) {
            commitPending(into: client)
            return false
        }

        let step: Step
        switch event.keyCode {
        case 51: step = EngineBridge.shared.key("backspace")
        case 53: step = EngineBridge.shared.key("escape")
        case 36, 76: step = EngineBridge.shared.key("enter")
        case 49: step = EngineBridge.shared.key("space")
        case 126: step = EngineBridge.shared.key("up")
        case 125: step = EngineBridge.shared.key("down")
        case 48: step = EngineBridge.shared.key("tab")
        default:
            guard let chars = event.characters, chars.count == 1 else {
                commitPending(into: client)
                return false
            }
            step = EngineBridge.shared.key("char", chars)
        }
        apply(step, to: client)
        return step.handled
    }

    // MARK: - Applying the composer's answer

    private func apply(_ step: Step, to client: IMKTextInput) {
        let none = NSRange(location: NSNotFound, length: 0)
        if !step.commit.isEmpty {
            client.insertText(step.commit, replacementRange: none)
            EngineBridge.shared.saveLearned()
        }
        let marked = step.view.marked
        if !marked.isEmpty || !current.view.marked.isEmpty || !step.commit.isEmpty {
            client.setMarkedText(
                NSAttributedString(string: marked, attributes: [.underlineStyle: NSUnderlineStyle.single.rawValue]),
                selectionRange: NSRange(location: (marked as NSString).length, length: 0),
                replacementRange: none
            )
        }
        current = step
        showCandidates()
    }

    private func showCandidates() {
        guard let window = candidatesWindow else { return }
        if current.view.candidates.count > 1 {
            window.update()
            window.show(kIMKLocateCandidatesBelowHint)
            let id = window.candidateIdentifier(atLineNumber: current.view.selected)
            window.selectCandidate(withIdentifier: id)
        } else {
            window.hide()
        }
    }

    private func commitPending(into client: IMKTextInput) {
        let text = EngineBridge.shared.flush()
        if !text.isEmpty {
            client.insertText(text, replacementRange: NSRange(location: NSNotFound, length: 0))
            EngineBridge.shared.saveLearned()
        }
        current = .pass
        candidatesWindow?.hide()
    }

    // MARK: - Candidate window (IMKCandidates)

    override func candidates(_ sender: Any!) -> [Any]! {
        current.view.candidates
    }

    /// A click in the candidate window: take that word, as its number key would.
    override func candidateSelected(_ candidateString: NSAttributedString!) {
        guard let client = client() as? IMKTextInput,
              let word = candidateString?.string,
              let index = current.view.candidates.firstIndex(of: word) else { return }
        apply(EngineBridge.shared.key("char", String(index + 1)), to: client)
    }

    // MARK: - Focus changes

    override func commitComposition(_ sender: Any!) {
        guard let client = sender as? IMKTextInput else { return }
        commitPending(into: client)
    }

    override func composedString(_ sender: Any!) -> Any! {
        current.view.marked
    }

    override func deactivateServer(_ sender: Any!) {
        if let client = sender as? IMKTextInput { commitPending(into: client) }
        super.deactivateServer(sender)
    }
}
