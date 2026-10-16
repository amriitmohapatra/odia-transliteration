import Cocoa
import ApplicationServices

/// The text under the pointer in any Mac app, through the macOS Accessibility
/// interface: the same way the system's own Look Up finds a word (V4.8). Exact
/// text, no OCR. Works where the app exposes its text this way (Notes, Pages,
/// TextEdit, Mail, Safari, Chrome, Preview text, most of Word and PowerPoint);
/// elsewhere it gives nil and the lens's OCR frame is the way to read.
enum PointReader {
    /// Characters taken on each side of the pointer: enough for the word and the one before it.
    static let around = 60

    struct Hit {
        /// Text around the pointer.
        let text: String
        /// The pointer's character in `text` (UTF-16 units, as the page's JavaScript counts).
        let offset: Int
        /// That character's box, in Accessibility coordinates (top-left origin of the main screen), if the app gives it.
        let bounds: CGRect?
    }

    /// Whether the app may use Accessibility; with `prompt`, macOS shows its request once.
    static func trusted(prompt: Bool) -> Bool {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([key: prompt] as CFDictionary)
    }

    /// The point under the mouse in Accessibility coordinates (top-left origin of the main screen).
    static func pointerPoint() -> CGPoint {
        let mouse = NSEvent.mouseLocation // bottom-left origin
        let mainHeight = NSScreen.screens.first?.frame.height ?? 0
        return CGPoint(x: mouse.x, y: mainHeight - mouse.y)
    }

    /// The text around a point, or nil (no text there, the app does not tell, or it is the lens itself).
    static func textAt(_ point: CGPoint) -> Hit? {
        let system = AXUIElementCreateSystemWide()
        var found: AXUIElement?
        guard AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &found) == .success,
              let element = found else { return nil }
        var pid: pid_t = 0
        if AXUIElementGetPid(element, &pid) == .success, pid == getpid() { return nil }

        var at = point
        guard let pointValue = AXValueCreate(.cgPoint, &at),
              let rangeValue = parameterized(element, kAXRangeForPositionParameterizedAttribute, pointValue),
              let range = cfRange(rangeValue) else { return nil }

        var total = Int.max
        var countRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXNumberOfCharactersAttribute as CFString, &countRef) == .success,
           let count = countRef as? Int {
            total = count
        }
        let start = max(0, range.location - around)
        let end = min(total, range.location + max(1, range.length) + around)
        guard end > start else { return nil }
        var wide = CFRange(location: start, length: end - start)
        guard let wideValue = AXValueCreate(.cfRange, &wide),
              let stringRef = parameterized(element, kAXStringForRangeParameterizedAttribute, wideValue),
              let text = stringRef as? String, !text.isEmpty else { return nil }

        var one = CFRange(location: range.location, length: max(1, range.length))
        var bounds: CGRect?
        if let oneValue = AXValueCreate(.cfRange, &one),
           let boundsRef = parameterized(element, kAXBoundsForRangeParameterizedAttribute, oneValue),
           CFGetTypeID(boundsRef) == AXValueGetTypeID() {
            var rect = CGRect.zero
            if AXValueGetValue(boundsRef as! AXValue, .cgRect, &rect) { bounds = rect }
        }
        return Hit(text: text, offset: range.location - start, bounds: bounds)
    }

    private static func parameterized(_ element: AXUIElement, _ attribute: String, _ parameter: AXValue) -> CFTypeRef? {
        var result: CFTypeRef?
        guard AXUIElementCopyParameterizedAttributeValue(element, attribute as CFString, parameter, &result) == .success else { return nil }
        return result
    }

    private static func cfRange(_ value: CFTypeRef) -> CFRange? {
        guard CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
        var range = CFRange()
        return AXValueGetValue(value as! AXValue, .cfRange, &range) ? range : nil
    }
}
