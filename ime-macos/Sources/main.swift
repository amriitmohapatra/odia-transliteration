// Entry point for the Odia Phonetic input method.
//
// An IMK input method is an ordinary .app bundle that runs headless (LSBackgroundOnly)
// and registers a Mach connection the system talks to. The IMKServer must be retained
// for the lifetime of the process — if it is deallocated the input method goes silent
// with no error, which is a genuinely confusing failure mode.

import Cocoa
import InputMethodKit

let bundle = Bundle.main

guard let bundleID = bundle.bundleIdentifier else {
    NSLog("[OdiaPhonetic] fatal: no bundle identifier")
    exit(1)
}

guard let connectionName = bundle.infoDictionary?["InputMethodConnectionName"] as? String else {
    NSLog("[OdiaPhonetic] fatal: Info.plist is missing InputMethodConnectionName")
    exit(1)
}

// Retained deliberately — see note above.
let server = IMKServer(name: connectionName, bundleIdentifier: bundleID)

NSLog("[OdiaPhonetic] server started: connection=%@ bundle=%@", connectionName, bundleID)

_ = server
NSApplication.shared.run()
