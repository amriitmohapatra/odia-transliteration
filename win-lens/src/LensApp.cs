using System;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace OdiaLens;

/// <summary>
/// Owns the tray icon, the frame, the results panel and point mode. Reads the frame
/// when it stops moving; in point mode, reads the word under a resting pointer.
/// </summary>
public sealed class LensApp
{
    private readonly Application app;
    private readonly FrameWindow frame = new();
    private readonly ResultsPanel results = new();
    private readonly CardPanel card = new();
    private Forms.NotifyIcon? tray;
    private Forms.ToolStripMenuItem? pointItem;
    private bool reading, readAgain;

    // Point mode: the pointer is polled (no hooks); a 0.35 s rest reads the word.
    private readonly DispatcherTimer poll = new() { Interval = TimeSpan.FromMilliseconds(100) };
    private Native.POINT last;
    private DateTime lastMove = DateTime.UtcNow;
    private bool lookedUp = true, looking;

    public LensApp(Application app) => this.app = app;

    public void Start()
    {
        frame.Moved += PlaceResults;
        frame.Settled += Read;
        frame.ReadAgain += Read;
        frame.CloseAsked += ToggleLens;
        frame.Left = (SystemParameters.WorkArea.Width - frame.Width) / 2;
        frame.Top = SystemParameters.WorkArea.Height / 3;
        frame.Show();
        results.Show();
        PlaceResults();
        // The card's page loads while it is off the screen; it shows when a word is found.
        card.Left = -10000;
        card.Show();
        card.Message += m =>
        {
            if (m.TryGetProperty("type", out var t) && t.GetString() == "ready" && card.Left < -5000) card.Hide();
        };
        MakeTray();
        poll.Tick += (_, _) => Poll();
    }

    private void MakeTray()
    {
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Show or hide the lens", null, (_, _) => ToggleLens());
        menu.Items.Add(new Forms.ToolStripSeparator());
        foreach (var (name, size) in FrameWindow.Sizes) menu.Items.Add($"Frame size: {name}", null, (_, _) => frame.SetInsideSize(size));
        menu.Items.Add("Read again", null, (_, _) => Read());
        menu.Items.Add(new Forms.ToolStripSeparator());
        pointItem = new Forms.ToolStripMenuItem("Point at words in any app", null, (_, _) => TogglePointMode());
        menu.Items.Add(pointItem);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Quit Odia Lens", null, (_, _) => { tray!.Visible = false; app.Shutdown(); });
        tray = new Forms.NotifyIcon { Icon = TrayIcon(), Text = "Odia Lens", ContextMenuStrip = menu, Visible = true };
        tray.MouseClick += (_, e) => { if (e.Button == Forms.MouseButtons.Left) ToggleLens(); };
    }

    /// <summary>The Odia letter o, yellow on indigo.</summary>
    private static Icon TrayIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            using var bg = new SolidBrush(System.Drawing.Color.FromArgb(0x1e, 0x2f, 0x5c));
            g.FillEllipse(bg, 0, 0, 31, 31);
            using var fg = new SolidBrush(System.Drawing.Color.FromArgb(0xe8, 0xb2, 0x3a));
            using var font = new Font("Nirmala UI", 15, System.Drawing.FontStyle.Bold, GraphicsUnit.Pixel);
            var size = g.MeasureString("\u0B13", font);
            g.DrawString("\u0B13", font, fg, (32 - size.Width) / 2, (32 - size.Height) / 2);
        }
        IntPtr h = bmp.GetHicon();
        var icon = (Icon)Icon.FromHandle(h).Clone();
        Native.DestroyIcon(h);
        return icon;
    }

    private void ToggleLens()
    {
        if (frame.IsVisible)
        {
            frame.Hide();
            results.Hide();
        }
        else
        {
            frame.Show();
            results.Show();
            PlaceResults();
            Read();
        }
    }

    /// <summary>The results panel under the frame, or above it near the bottom of the screen.</summary>
    private void PlaceResults()
    {
        var f = frame.FrameRectDip;
        var area = SystemParameters.WorkArea;
        results.Width = Math.Max(f.Width, 380);
        results.Left = Math.Min(Math.Max(area.Left, f.Left), area.Right - results.Width);
        double below = f.Bottom + 12;
        results.Top = below + results.Height <= area.Bottom ? below : Math.Max(area.Top, f.Top - FrameWindow.BarHeight - FrameWindow.BarGap - results.Height - 8);
    }

    private async void Read()
    {
        if (!frame.IsVisible) return;
        if (reading)
        {
            readAgain = true;
            return;
        }
        reading = true;
        frame.Reading = true;
        var watch = Stopwatch.StartNew();
        try
        {
            var rect = frame.ReadingRect();
            using var image = Capture.Grab(rect);
            var (lines, engine) = await Ocr.ReadAsync(image, oneLine: rect.Height < 90);
            // Boxes in points inside the frame, as the page expects (the Mac lens does the same).
            var dpi = System.Windows.Media.VisualTreeHelper.GetDpi(frame);
            var shown = lines.Select(l => new
            {
                box = Scale(l.Box, dpi.DpiScaleX),
                words = l.Words.Select(w => new { text = w.Text, conf = w.Conf, box = Scale(w.Box, dpi.DpiScaleX) }),
            });
            results.ShowLines(shown, watch.ElapsedMilliseconds, engine);
        }
        catch (Exception error)
        {
            results.ShowError(error.Message);
        }
        reading = false;
        frame.Reading = false;
        if (readAgain)
        {
            readAgain = false;
            Read();
        }
    }

    private static object Scale(Box b, double s) => new { x0 = b.X0 / s, y0 = b.Y0 / s, x1 = b.X1 / s, y1 = b.Y1 / s };

    // ------------------------------- point mode -------------------------------

    private void TogglePointMode()
    {
        bool on = !poll.IsEnabled;
        if (on) poll.Start();
        else
        {
            poll.Stop();
            card.Hide();
        }
        if (pointItem != null) pointItem.Checked = on;
    }

    private void Poll()
    {
        Native.GetCursorPos(out var p);
        if (p.X != last.X || p.Y != last.Y)
        {
            last = p;
            lastMove = DateTime.UtcNow;
            lookedUp = false;
            return;
        }
        if (lookedUp || looking || DateTime.UtcNow - lastMove < TimeSpan.FromMilliseconds(350)) return;
        lookedUp = true;
        _ = LookUp(p);
    }

    private async Task LookUp(Native.POINT p)
    {
        looking = true;
        // UI Automation calls other apps: never on the window thread.
        var hit = await Task.Run(() => PointReader.TextAt(p.X, p.Y));
        looking = false;
        if (hit is not { } found || !found.Text.Any(c => c >= '\u0B00' && c <= '\u0B7F'))
        {
            card.Hide();
            return;
        }
        var dpi = System.Windows.Media.VisualTreeHelper.GetDpi(frame);
        card.ShowWord(found.Text, found.Offset, new System.Windows.Point(p.X / dpi.DpiScaleX, p.Y / dpi.DpiScaleY));
    }
}
