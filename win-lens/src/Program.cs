using System;
using System.Threading;
using System.Windows;

namespace OdiaLens;

/// <summary>Odia Lens for Windows (V4.9): the see-through frame, the results panel and point mode, from the tray.</summary>
public static class Program
{
    [STAThread]
    public static void Main()
    {
        using var single = new Mutex(true, "OdiaLens.SingleInstance", out bool first);
        if (!first) return;
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        var lens = new LensApp(app);
        app.Startup += (_, _) => lens.Start();
        app.Run();
    }
}
