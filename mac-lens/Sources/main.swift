// Odia Lens for Mac (owner testing only): a see-through frame over any app.
// Move or resize the frame; the Odia under it is read (tesseract, model ori)
// and the results panel shows each line and word with its meaning.

import Cocoa

let app = NSApplication.shared
let lens = AppDelegate()
app.delegate = lens
app.setActivationPolicy(.accessory) // no Dock icon; the menu bar item is the app
app.run()
