using System.Drawing;
using System.Drawing.Imaging;

namespace OdiaLens;

/// <summary>
/// The screen pixels inside the frame. The lens's own windows ask Windows to leave
/// them out of captures (Native.WDA_EXCLUDEFROMCAPTURE), so the frame's border and
/// the panels are never read.
/// </summary>
public static class Capture
{
    /// <summary>A rectangle of the screen, in physical pixels.</summary>
    public static Bitmap Grab(Rectangle physical)
    {
        var bmp = new Bitmap(System.Math.Max(1, physical.Width), System.Math.Max(1, physical.Height), PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(bmp);
        g.CopyFromScreen(physical.X, physical.Y, 0, 0, physical.Size, CopyPixelOperation.SourceCopy);
        return bmp;
    }
}
