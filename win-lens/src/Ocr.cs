using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace OdiaLens;

public sealed record Box(double X0, double Y0, double X1, double Y1);
public sealed record OcrWord(string Text, int Conf, Box Box);
public sealed record OcrLine(Box Box, List<OcrWord> Words);

/// <summary>
/// Reads Odia from a picture with the tesseract program (UB Mannheim build for
/// Windows, Apache-2.0) and the Odia model packed with the app (tessdata\ori.traineddata).
/// The same steps as the Mac lens (mac-lens/Sources/OCR.swift): TSV output, words with
/// boxes and confidence, small pictures doubled first.
/// </summary>
public static class Ocr
{
    /// <summary>The tesseract program: on the PATH, or where its installer puts it.</summary>
    public static string? FindTesseract()
    {
        var candidates = new List<string>();
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            if (dir.Length > 0) candidates.Add(Path.Combine(dir, "tesseract.exe"));
        }
        candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Tesseract-OCR", "tesseract.exe"));
        candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Tesseract-OCR", "tesseract.exe"));
        return candidates.FirstOrDefault(File.Exists);
    }

    /// <summary>Lines and words read in `image`; boxes in the image's pixels.</summary>
    public static async Task<(List<OcrLine> Lines, string Engine)> ReadAsync(Bitmap image, bool oneLine)
    {
        string exe = FindTesseract() ?? throw new InvalidOperationException(
            "The tesseract program was not found. Install it (github.com/UB-Mannheim/tesseract/wiki), then read again.");
        double scale = image.Height < 120 ? 2 : 1;
        string dir = Path.Combine(Path.GetTempPath(), "OdiaLens");
        Directory.CreateDirectory(dir);
        string png = Path.Combine(dir, "frame.png");
        string outBase = Path.Combine(dir, "frame");
        using (var big = Enlarged(image, scale)) big.Save(png, ImageFormat.Png);
        string tessdata = Path.Combine(AppContext.BaseDirectory, "tessdata");
        var info = new ProcessStartInfo(exe)
        {
            ArgumentList = { png, outBase, "--tessdata-dir", tessdata, "-l", "ori", "--psm", oneLine ? "13" : "6", "tsv" },
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
        };
        using var process = Process.Start(info) ?? throw new InvalidOperationException("tesseract did not start.");
        string errors = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new InvalidOperationException($"tesseract failed: {errors.Trim()}");
        var lines = Parse(await File.ReadAllTextAsync(outBase + ".tsv"), scale);
        return (lines, await VersionAsync(exe));
    }

    private static Bitmap Enlarged(Bitmap image, double scale)
    {
        int w = (int)Math.Round(image.Width * scale), h = (int)Math.Round(image.Height * scale);
        var big = new Bitmap(w, h, PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(big);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.DrawImage(image, 0, 0, w, h);
        return big;
    }

    /// <summary>Tesseract's TSV: level 5 rows are words; their block, paragraph and line numbers group them.</summary>
    public static List<OcrLine> Parse(string tsv, double scale)
    {
        var groups = new Dictionary<string, List<OcrWord>>();
        var order = new List<string>();
        foreach (var row in tsv.Split('\n').Skip(1))
        {
            var c = row.TrimEnd('\r').Split('\t');
            if (c.Length < 12 || c[0] != "5") continue;
            string text = c[11].Trim();
            if (text.Length == 0) continue;
            double x = D(c[6]) / scale, y = D(c[7]) / scale, w = D(c[8]) / scale, h = D(c[9]) / scale;
            int conf = (int)Math.Round(D(c[10]));
            string key = $"{c[2]}.{c[3]}.{c[4]}";
            if (!groups.TryGetValue(key, out var words))
            {
                groups[key] = words = new List<OcrWord>();
                order.Add(key);
            }
            words.Add(new OcrWord(text, conf, new Box(x, y, x + w, y + h)));
        }
        return order.Select(k =>
        {
            var ws = groups[k];
            return new OcrLine(new Box(ws.Min(w => w.Box.X0), ws.Min(w => w.Box.Y0), ws.Max(w => w.Box.X1), ws.Max(w => w.Box.Y1)), ws);
        }).ToList();
    }

    private static double D(string s) => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 0;

    private static string? version;

    private static async Task<string> VersionAsync(string exe)
    {
        if (version != null) return version;
        try
        {
            var info = new ProcessStartInfo(exe, "--version") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using var p = Process.Start(info)!;
            string all = await p.StandardOutput.ReadToEndAsync() + await p.StandardError.ReadToEndAsync();
            await p.WaitForExitAsync();
            version = all.Split('\n').FirstOrDefault(l => l.StartsWith("tesseract", StringComparison.OrdinalIgnoreCase))?.Trim() ?? "tesseract";
        }
        catch (Exception)
        {
            version = "tesseract";
        }
        return version;
    }
}
