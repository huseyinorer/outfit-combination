namespace OutfitCombination.Api.Services;

public sealed class EmailAuthOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public string FromName { get; set; } = "Outfit Combination";
    public string Endpoint { get; set; } = "https://api.resend.com/emails";
    public int CodeLifetimeMinutes { get; set; } = 10;
    public int ResendCooldownSeconds { get; set; } = 60;
    public int MaximumAttempts { get; set; } = 5;

    public bool Enabled =>
        !string.IsNullOrWhiteSpace(ApiKey)
        && System.Net.Mail.MailAddress.TryCreate(FromAddress?.Trim(), out _)
        && Uri.TryCreate(Endpoint, UriKind.Absolute, out var endpoint)
        && endpoint.Scheme == Uri.UriSchemeHttps;

    public bool PartiallyConfigured =>
        !Enabled
        && (!string.IsNullOrWhiteSpace(ApiKey) || !string.IsNullOrWhiteSpace(FromAddress));
}
