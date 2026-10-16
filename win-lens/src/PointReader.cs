using System;
using System.Windows.Automation;
using System.Windows.Automation.Text;

namespace OdiaLens;

/// <summary>
/// Point mode (V4.9, as V4.8 on the Mac): the text under the pointer in any Windows
/// app that exposes it through UI Automation's text pattern (Word, Notepad, WordPad,
/// Edge, Chrome, many PDF readers). Exact text, no OCR. Elsewhere it gives null and
/// the frame (OCR) is the way to read.
/// </summary>
public static class PointReader
{
    /// <summary>The line of text under a screen point (physical pixels) and the pointer's offset in it (UTF-16).</summary>
    public static (string Text, int Offset)? TextAt(int x, int y)
    {
        try
        {
            var point = new System.Windows.Point(x, y);
            AutomationElement? element = AutomationElement.FromPoint(point);
            if (element == null || element.Current.ProcessId == Environment.ProcessId) return null;
            // The text pattern is on the document, often a parent of the element under the point.
            TextPattern? text = null;
            for (int i = 0; i < 5 && element != null && text == null; i++)
            {
                if (element.TryGetCurrentPattern(TextPattern.Pattern, out object pattern)) text = (TextPattern)pattern;
                else element = TreeWalker.ControlViewWalker.GetParent(element);
            }
            if (text == null) return null;
            TextPatternRange at = text.RangeFromPoint(point);
            TextPatternRange line = at.Clone();
            line.ExpandToEnclosingUnit(TextUnit.Line);
            string whole = line.GetText(2000);
            TextPatternRange before = line.Clone();
            before.MoveEndpointByRange(TextPatternRangeEndpoint.End, at, TextPatternRangeEndpoint.Start);
            int offset = before.GetText(2000).Length;
            return whole.Length == 0 ? null : (whole, Math.Min(offset, whole.Length));
        }
        catch (Exception)
        {
            // An app that stops answering, or a window that closed: no card.
            return null;
        }
    }
}
