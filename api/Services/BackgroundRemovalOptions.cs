namespace OutfitCombination.Api.Services;

public sealed class BackgroundRemovalOptions
{
    public string ApiKey { get; set; } = "";
    public string Endpoint { get; set; } = "https://api.remove.bg/v1.0/removebg";
    public string Provider { get; set; } = "remove.bg";
    public int MaxUploadBytes { get; set; } = 12 * 1024 * 1024;

    public bool Enabled => !string.IsNullOrWhiteSpace(ApiKey);
}

public sealed class BackgroundRemovalException(string message, Exception? inner = null) : Exception(message, inner);
