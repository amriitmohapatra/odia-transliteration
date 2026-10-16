// Odia Lens for Mac (owner testing only): a see-through frame over any app.
// Move or resize the frame; the Odia under it is read (tesseract, model ori)
// and the results panel shows each line and word with its meaning.

import Cocoa

// Top-level code runs on the main thread, but newer Swift compilers do not treat it as
// main-actor code, and AppDelegate is @MainActor. assumeIsolated states the fact (and
// traps if it were ever false). app.run() never returns, so `lens` stays alive.
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let lens = AppDelegate()
    app.delegate = lens
    app.setActivationPolicy(.accessory) // no Dock icon; the menu bar item is the app
    app.run()
}
