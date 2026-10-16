using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace OdiaLens;

/// <summary>
/// The see-through frame, in the Puri/Konark look of the browser and Mac lenses: a
/// Nilachakra-indigo bar with the Konark wheel (drag to move; sizes, read again,
/// close), a Pattachitra border (red, yellow, black hairline) with diamond corner
/// marks; every edge and corner resizes. The window is larger than the frame by a
/// margin that holds the resize grips. Inside the frame nothing is drawn, so clicks
/// go to the app below (a layered window passes clicks on fully clear pixels), and
/// the frame is left out of every capture.
/// </summary>
public sealed class FrameWindow : Window
{
    public const double Margin0 = 10, BarHeight = 30, BarGap = 8, Border0 = 3, BarWidth = 330;
    public static readonly (string Name, Size Size)[] Sizes = { ("Word", new Size(190, 56)), ("Line", new Size(560, 70)), ("Para", new Size(560, 240)) };
    private static readonly Size Minimum = new(70, 30);

    /// <summary>The frame moved or changed size; settled: it has rested 0.35 s (read it now).</summary>
    public event Action? Moved, Settled, ReadAgain, CloseAsked;

    private readonly Canvas canvas = new();
    private readonly Rectangle outer = new(), ring = new(), band = new();
    private readonly List<Rectangle> grips = new();
    private readonly List<Polygon> diamonds = new();
    private readonly Border bar = new();
    private readonly RotateTransform turn = new();
    private readonly DispatcherTimer settle = new() { Interval = TimeSpan.FromMilliseconds(350) };
    private readonly DispatcherTimer spin = new() { Interval = TimeSpan.FromMilliseconds(33) };
    private readonly List<(TextBlock Text, Border Box, int Index)> sizeButtons = new();
    private Size inside = Sizes[1].Size;

    public FrameWindow()
    {
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = null;
        Topmost = true;
        ShowInTaskbar = false;
        ShowActivated = false;
        ResizeMode = ResizeMode.NoResize;
        Content = canvas;
        BuildFrame();
        BuildBar();
        Layout();
        settle.Tick += (_, _) => { settle.Stop(); Settled?.Invoke(); };
        spin.Tick += (_, _) => turn.Angle = (turn.Angle + 7.5) % 360;
        LocationChanged += (_, _) => Changed();
        SourceInitialized += (_, _) => Native.SetWindowDisplayAffinity(new WindowInteropHelper(this).Handle, Native.WDA_EXCLUDEFROMCAPTURE);
    }

    /// <summary>The wheel turns and the border goes yellow while the frame is read.</summary>
    public bool Reading
    {
        set
        {
            band.Stroke = Theme.Brush(value ? Theme.Haritala : Theme.Hingula);
            if (value) spin.Start(); else spin.Stop();
        }
    }

    /// <summary>The area read, in physical screen pixels (inside the border).</summary>
    public System.Drawing.Rectangle ReadingRect()
    {
        var tl = PointToScreen(new Point(Margin0 + Border0, Margin0 + BarHeight + BarGap + Border0));
        var br = PointToScreen(new Point(Margin0 + inside.Width - Border0, Margin0 + BarHeight + BarGap + inside.Height - Border0));
        return new System.Drawing.Rectangle((int)tl.X, (int)tl.Y, (int)Math.Max(1, br.X - tl.X), (int)Math.Max(1, br.Y - tl.Y));
    }

    /// <summary>The frame's bottom edge in DIPs (the results panel goes under it).</summary>
    public Rect FrameRectDip => new(Left + Margin0, Top + Margin0 + BarHeight + BarGap, inside.Width, inside.Height);

    public void SetInsideSize(Size size)
    {
        inside = new Size(Math.Max(Minimum.Width, size.Width), Math.Max(Minimum.Height, size.Height));
        Layout();
        Changed();
    }

    private void Changed()
    {
        Moved?.Invoke();
        settle.Stop();
        settle.Start();
    }

    private double FrameTop => Margin0 + BarHeight + BarGap;

    private void BuildFrame()
    {
        outer.Stroke = Theme.Brush(Theme.Kajal);
        outer.StrokeThickness = 1;
        ring.Stroke = Theme.Brush(Theme.Haritala);
        ring.StrokeThickness = 2;
        band.Stroke = Theme.Brush(Theme.Hingula);
        band.StrokeThickness = Border0;
        foreach (var r in new[] { outer, ring, band }) canvas.Children.Add(r);
        // Resize grips: a trace of colour so that Windows gives them the mouse.
        string[] edges = { "w", "e", "n", "s", "nw", "ne", "sw", "se" };
        foreach (var edge in edges)
        {
            var g = new Rectangle { Fill = Theme.Brush(Colors.Black, 4), Tag = edge, Cursor = CursorFor(edge) };
            g.MouseLeftButtonDown += GripDown;
            g.MouseMove += GripMove;
            g.MouseLeftButtonUp += GripUp;
            grips.Add(g);
            canvas.Children.Add(g);
        }
        for (int i = 0; i < 4; i++)
        {
            var d = new Polygon { Fill = Theme.Brush(Theme.Haritala), Stroke = Theme.Brush(Theme.Kajal), StrokeThickness = 1.5, IsHitTestVisible = false };
            diamonds.Add(d);
            canvas.Children.Add(d);
        }
    }

    private static Cursor CursorFor(string edge) => edge switch
    {
        "w" or "e" => Cursors.SizeWE,
        "n" or "s" => Cursors.SizeNS,
        "nw" or "se" => Cursors.SizeNWSE,
        _ => Cursors.SizeNESW,
    };

    private void BuildBar()
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        row.Children.Add(Wheel());
        row.Children.Add(new TextBlock
        {
            Text = "Odia Lens",
            FontFamily = new FontFamily("Palatino Linotype, Georgia"),
            FontStyle = FontStyles.Italic,
            FontWeight = FontWeights.SemiBold,
            FontSize = 14,
            Foreground = Theme.Brush(Theme.Shankha),
            Margin = new Thickness(7, 0, 10, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var well = new StackPanel { Orientation = Orientation.Horizontal };
        var wellBox = new Border { Background = Theme.Brush(Colors.Black, 56), CornerRadius = new CornerRadius(7), Padding = new Thickness(2), Child = well };
        for (int i = 0; i < Sizes.Length; i++)
        {
            int index = i;
            var (b, t) = BarButton(Sizes[i].Name, () => SetInsideSize(Sizes[index].Size));
            sizeButtons.Add((t, b, index));
            well.Children.Add(b);
        }
        row.Children.Add(wellBox);
        row.Children.Add(new Rectangle { Width = 1, Height = 16, Fill = Theme.Brush(Theme.Shankha, 50), Margin = new Thickness(8, 0, 4, 0) });
        row.Children.Add(BarButton("↻", () => ReadAgain?.Invoke()).Box);
        row.Children.Add(BarButton("✕", () => CloseAsked?.Invoke()).Box);
        bar.Child = row;
        bar.Background = Theme.Brush(Theme.Nila);
        bar.BorderBrush = Theme.Brush(Theme.NilaDeep);
        bar.BorderThickness = new Thickness(1);
        bar.CornerRadius = new CornerRadius(9);
        bar.Padding = new Thickness(6, 0, 4, 0);
        bar.Height = BarHeight;
        bar.Width = BarWidth;
        bar.Cursor = Cursors.SizeAll;
        bar.MouseLeftButtonDown += (_, e) =>
        {
            if (e.Handled) return;
            DragMove();
        };
        canvas.Children.Add(bar);
    }

    private (Border Box, TextBlock Text) BarButton(string label, Action action)
    {
        var text = new TextBlock { Text = label, Foreground = Theme.Brush(Theme.Shankha), FontSize = 12, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
        var box = new Border { Child = text, Padding = new Thickness(9, 3, 9, 3), CornerRadius = new CornerRadius(6), Cursor = Cursors.Hand, Background = Brushes.Transparent };
        box.MouseEnter += (_, _) => { if (text.FontWeight != FontWeights.SemiBold) box.Background = Theme.Brush(Theme.Haritala, 50); };
        box.MouseLeave += (_, _) => { if (text.FontWeight != FontWeights.SemiBold) box.Background = Brushes.Transparent; };
        box.MouseLeftButtonDown += (_, e) => e.Handled = true; // not a drag
        box.MouseLeftButtonUp += (_, e) => { e.Handled = true; action(); };
        return (box, text);
    }

    /// <summary>The Konark wheel: rim, inner ring, eight broad and eight thin spokes, hub.</summary>
    private UIElement Wheel()
    {
        var c = new Canvas { Width = 22, Height = 22, RenderTransform = turn, RenderTransformOrigin = new Point(0.5, 0.5) };
        var stroke = Theme.Brush(Theme.Haritala);
        c.Children.Add(new Ellipse { Width = 20, Height = 20, Stroke = stroke, StrokeThickness = 1.8, Margin = new Thickness(1) });
        c.Children.Add(new Ellipse { Width = 15, Height = 15, Stroke = stroke, StrokeThickness = 0.7, Margin = new Thickness(3.5) });
        for (int i = 0; i < 16; i++)
        {
            double a = i * Math.PI / 8;
            c.Children.Add(new Line
            {
                X1 = 11 + Math.Cos(a) * 2.4, Y1 = 11 + Math.Sin(a) * 2.4,
                X2 = 11 + Math.Cos(a) * 7.6, Y2 = 11 + Math.Sin(a) * 7.6,
                Stroke = stroke, StrokeThickness = i % 2 == 0 ? 1.5 : 0.6,
            });
        }
        c.Children.Add(new Ellipse { Width = 5, Height = 5, Fill = stroke, Margin = new Thickness(8.5) });
        return c;
    }

    private void Layout()
    {
        double w = inside.Width, h = inside.Height, m = Margin0, top = FrameTop;
        Width = Math.Max(w + 2 * m, BarWidth + m);
        Height = h + top + m;
        Place(outer, m - 2.5, top - 2.5, w + 5, h + 5);
        Place(ring, m - 2, top - 2, w + 4, h + 4);
        Place(band, m, top, w, h);
        const double hit = 7, c = 12;
        foreach (var g in grips)
        {
            switch ((string)g.Tag)
            {
                case "w": Place(g, m - hit, top + c, 2 * hit, h - 2 * c); break;
                case "e": Place(g, m + w - hit, top + c, 2 * hit, h - 2 * c); break;
                case "n": Place(g, m + c, top - hit, w - 2 * c, 2 * hit); break;
                case "s": Place(g, m + c, top + h - hit, w - 2 * c, 2 * hit); break;
                case "nw": Place(g, m - c, top - c, 2 * c, 2 * c); break;
                case "ne": Place(g, m + w - c, top - c, 2 * c, 2 * c); break;
                case "sw": Place(g, m - c, top + h - c, 2 * c, 2 * c); break;
                default: Place(g, m + w - c, top + h - c, 2 * c, 2 * c); break;
            }
        }
        var corners = new[] { new Point(m, top), new Point(m + w, top), new Point(m, top + h), new Point(m + w, top + h) };
        for (int i = 0; i < 4; i++)
        {
            var p = corners[i];
            diamonds[i].Points = new PointCollection { new(p.X, p.Y - 6), new(p.X + 6, p.Y), new(p.X, p.Y + 6), new(p.X - 6, p.Y) };
        }
        Canvas.SetLeft(bar, m - 4);
        Canvas.SetTop(bar, 0);
        foreach (var (text, box, index) in sizeButtons)
        {
            bool current = Math.Abs(Sizes[index].Size.Width - w) < 1 && Math.Abs(Sizes[index].Size.Height - h) < 1;
            box.Background = current ? Theme.Brush(Theme.Haritala) : Brushes.Transparent;
            text.Foreground = Theme.Brush(current ? Theme.Kajal : Theme.Shankha);
            text.FontWeight = current ? FontWeights.SemiBold : FontWeights.Normal;
        }
    }

    private static void Place(FrameworkElement e, double x, double y, double w, double h)
    {
        Canvas.SetLeft(e, x);
        Canvas.SetTop(e, y);
        e.Width = Math.Max(0, w);
        e.Height = Math.Max(0, h);
    }

    // Resizing from a grip: the opposite edge stays where it is.
    private Point dragStart;
    private Rect startRect;
    private string? dragging;

    private void GripDown(object sender, MouseButtonEventArgs e)
    {
        var g = (Rectangle)sender;
        dragging = (string)g.Tag;
        dragStart = PointToScreenDip(e.GetPosition(this));
        startRect = new Rect(Left + Margin0, Top + FrameTop, inside.Width, inside.Height);
        g.CaptureMouse();
        e.Handled = true;
    }

    private void GripMove(object sender, MouseEventArgs e)
    {
        if (dragging == null) return;
        var now = PointToScreenDip(e.GetPosition(this));
        double dx = now.X - dragStart.X, dy = now.Y - dragStart.Y;
        Rect r = startRect;
        if (dragging.Contains('e')) r.Width = Math.Max(Minimum.Width, startRect.Width + dx);
        if (dragging.Contains('s')) r.Height = Math.Max(Minimum.Height, startRect.Height + dy);
        if (dragging.Contains('w'))
        {
            r.Width = Math.Max(Minimum.Width, startRect.Width - dx);
            r.X = startRect.Right - r.Width;
        }
        if (dragging.Contains('n'))
        {
            r.Height = Math.Max(Minimum.Height, startRect.Height - dy);
            r.Y = startRect.Bottom - r.Height;
        }
        inside = r.Size;
        Left = r.X - Margin0;
        Top = r.Y - FrameTop;
        Layout();
        Moved?.Invoke();
    }

    private void GripUp(object sender, MouseButtonEventArgs e)
    {
        if (dragging == null) return;
        dragging = null;
        ((Rectangle)sender).ReleaseMouseCapture();
        Changed();
    }

    /// <summary>A point in this window → screen DIPs (the window's own coordinates move while resizing).</summary>
    private Point PointToScreenDip(Point p) => new(Left + p.X, Top + p.Y);
}
