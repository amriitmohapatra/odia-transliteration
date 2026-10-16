using System;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace OdiaLens;

/// <summary>
/// A window with the shared page (lens/src/mac.ts, built by `node lens/build.mjs --mac`),
/// served by WebView2 from the app's web folder. The page posts {type: ...} messages;
/// the app calls window.odiaMac.show(...) or window.odiaMac.word(...).
/// </summary>
public class WebPanel : Window
{
    protected readonly WebView2 Web = new();
    private bool ready;
    private string? waiting;

    /// <summary>A message from the page (ready, error, shown, card).</summary>
    public event Action<JsonElement>? Message;

    public WebPanel(bool card)
    {
        Content = Web;
        Topmost = true;
        ShowActivated = false;
        ShowInTaskbar = false;
        SourceInitialized += (_, _) =>
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            Native.SetWindowDisplayAffinity(hwnd, Native.WDA_EXCLUDEFROMCAPTURE);
            if (card) Native.NoActivate(hwnd);
        };
        Loaded += async (_, _) =>
        {
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OdiaLens", "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, data);
            await Web.EnsureCoreWebView2Async(env);
            var core = Web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.SetVirtualHostNameToFolderMapping("odialens.app", Path.Combine(AppContext.BaseDirectory, "web"), CoreWebView2HostResourceAccessKind.Allow);
            core.WebMessageReceived += (_, e) => Received(e.WebMessageAsJson);
            core.Navigate("https://odialens.app/index.html" + (card ? "#card" : ""));
        };
    }

    private void Received(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var message = doc.RootElement.Clone();
        string type = message.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
        if ((type == "ready" || type == "error") && !ready)
        {
            ready = true;
            if (waiting != null)
            {
                _ = Web.ExecuteScriptAsync(waiting);
                waiting = null;
            }
        }
        Message?.Invoke(message);
    }

    /// <summary>Run a script in the page once it has loaded its dictionary (the latest one only).</summary>
    protected void Run(string script)
    {
        if (ready) _ = Web.ExecuteScriptAsync(script);
        else waiting = script;
    }
}

/// <summary>The panel under the frame: each line as read, its words and meanings.</summary>
public sealed class ResultsPanel : WebPanel
{
    private static readonly JsonSerializerOptions Camel = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public ResultsPanel() : base(card: false)
    {
        Title = "Odia Lens";
        Width = 560;
        Height = 300;
        WindowStyle = WindowStyle.ToolWindow;
    }

    public void ShowLines(object lines, long ms, string engine) =>
        Run($"window.odiaMac.show({JsonSerializer.Serialize(lines, Camel)}, {JsonSerializer.Serialize(new { ms, engine })})");

    public void ShowError(string error) =>
        Run($"window.odiaMac.show([], {JsonSerializer.Serialize(new { error })})");
}

/// <summary>Point mode's card beside the pointer: the page in card mode, one word.</summary>
public sealed class CardPanel : WebPanel
{
    private System.Windows.Point anchor;

    public CardPanel() : base(card: true)
    {
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        Width = 340;
        Height = 160;
        Message += m =>
        {
            if (!m.TryGetProperty("type", out var t) || t.GetString() != "card") return;
            if (m.TryGetProperty("found", out var f) && f.GetBoolean() && m.TryGetProperty("height", out var h))
            {
                Height = Math.Min(420, h.GetDouble());
                Place();
                if (!IsVisible) Show();
            }
            else Hide();
        };
    }

    /// <summary>The word at `offset` in `text`, shown near a point in DIPs.</summary>
    public void ShowWord(string text, int offset, System.Windows.Point nearDip)
    {
        anchor = nearDip;
        Run($"window.odiaMac.word({JsonSerializer.Serialize(text)}, {offset})");
    }

    private void Place()
    {
        var area = SystemParameters.WorkArea;
        double left = anchor.X + 14, top = anchor.Y + 22;
        if (top + Height > area.Bottom) top = anchor.Y - Height - 14;
        Left = Math.Min(Math.Max(area.Left + 4, left), area.Right - Width - 4);
        Top = Math.Max(area.Top + 4, top);
    }
}
