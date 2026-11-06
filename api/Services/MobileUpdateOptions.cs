namespace OutfitCombination.Api.Services;

public sealed class MobileUpdateOptions
{
    public string MinimumVersion { get; set; } = "1.0.0";
    public bool ForceLatest { get; set; } = true;
    public string AndroidDownloadUrl { get; set; } = string.Empty;
}
