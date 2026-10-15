import Cocoa
import ScreenCaptureKit

enum CaptureError: LocalizedError {
    case noPermission
    case noDisplay

    var errorDescription: String? {
        switch self {
        case .noPermission:
            return "No permission to read the screen. System Settings > Privacy & Security > Screen & System Audio Recording: turn on Odia Lens, then quit and open it again."
        case .noDisplay:
            return "Could not find the display under the frame."
        }
    }
}

/// The pixels under the frame, without the lens's own windows (ScreenCaptureKit, macOS 14+).
enum Capture {
    /// macOS asks the user once; the answer is kept for this build of the app.
    static func askForPermissionOnce() {
        if !CGPreflightScreenCaptureAccess() {
            _ = CGRequestScreenCaptureAccess()
        }
    }

    /// Where to capture, worked out on the main thread (NSScreen belongs to it).
    struct Target {
        let displayID: CGDirectDisplayID
        /// The area in the display's own coordinates: points, origin at its top left.
        let sourceRect: CGRect
        let scale: CGFloat

        /// `rect` is in screen coordinates (origin at the bottom left of the main display).
        @MainActor
        init?(rect: NSRect, screen: NSScreen) {
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return nil }
            displayID = number.uint32Value
            let frame = screen.frame
            sourceRect = CGRect(x: rect.minX - frame.minX, y: frame.maxY - rect.maxY, width: rect.width, height: rect.height)
            scale = screen.backingScaleFactor
        }
    }

    static func image(of target: Target, excluding windowIDs: [CGWindowID]) async throws -> CGImage {
        guard CGPreflightScreenCaptureAccess() else { throw CaptureError.noPermission }
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == target.displayID }) else {
            throw CaptureError.noDisplay
        }
        let own = content.windows.filter { windowIDs.contains($0.windowID) }
        let filter = SCContentFilter(display: display, excludingWindows: own)
        let config = SCStreamConfiguration()
        let rect = target.sourceRect
        config.sourceRect = rect
        let scale = target.scale
        config.width = max(1, Int(rect.width * scale))
        config.height = max(1, Int(rect.height * scale))
        config.showsCursor = false
        return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
    }
}
