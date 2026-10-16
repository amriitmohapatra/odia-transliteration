using System.Windows.Media;

namespace OdiaLens;

/// <summary>The Puri/Konark palette shared with the browser lens (lens/src/frame.ts) and the Mac lens.</summary>
public static class Theme
{
    public static readonly Color Nila = Color.FromRgb(0x1e, 0x2f, 0x5c);
    public static readonly Color NilaDeep = Color.FromRgb(0x15, 0x21, 0x3f);
    public static readonly Color Hingula = Color.FromRgb(0xb7, 0x32, 0x1e);
    public static readonly Color Haritala = Color.FromRgb(0xe8, 0xb2, 0x3a);
    public static readonly Color Shankha = Color.FromRgb(0xfb, 0xf6, 0xea);
    public static readonly Color Kajal = Color.FromRgb(0x1c, 0x17, 0x12);

    public static SolidColorBrush Brush(Color c, byte alpha = 255)
    {
        var b = new SolidColorBrush(Color.FromArgb(alpha, c.R, c.G, c.B));
        b.Freeze();
        return b;
    }
}
