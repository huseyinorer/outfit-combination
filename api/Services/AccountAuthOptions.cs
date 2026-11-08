namespace OutfitCombination.Api.Services;

public sealed class AccountAuthOptions
{
    public string GoogleClientId { get; set; } = string.Empty;
    public string GoogleClientSecret { get; set; } = string.Empty;
    public string CallbackUrl { get; set; } = string.Empty;
    public string AppReturnScheme { get; set; } = "outfitcombination";
    public int AttemptLifetimeMinutes { get; set; } = 10;

    public bool GoogleEnabled =>
        !string.IsNullOrWhiteSpace(GoogleClientId)
        && !string.IsNullOrWhiteSpace(GoogleClientSecret)
        && Uri.TryCreate(CallbackUrl, UriKind.Absolute, out _);

    public bool Enabled => GoogleEnabled;

    public bool PartiallyConfigured =>
        !GoogleEnabled
        && (!string.IsNullOrWhiteSpace(GoogleClientId)
            || !string.IsNullOrWhiteSpace(GoogleClientSecret)
            || !string.IsNullOrWhiteSpace(CallbackUrl));
}
