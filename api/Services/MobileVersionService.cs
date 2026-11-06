using System.Text.Json;

namespace OutfitCombination.Api.Services;

public sealed class MobileVersionService
{
    private readonly Lazy<string> _latestVersion = new(ReadVersion);

    public string LatestVersion => _latestVersion.Value;

    private static string ReadVersion()
    {
        var versionFile = Path.Combine(AppContext.BaseDirectory, "mobile-app-version.json");
        using var document = JsonDocument.Parse(File.ReadAllText(versionFile));
        var version = document.RootElement.GetProperty("version").GetString();
        if (string.IsNullOrWhiteSpace(version))
            throw new InvalidOperationException("Mobil uygulama sürümü okunamadı.");
        return version;
    }
}
