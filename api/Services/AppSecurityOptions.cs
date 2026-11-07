namespace OutfitCombination.Api.Services;

public sealed class AppSecurityOptions
{
    public string TokenSigningKey { get; set; } = string.Empty;
    public int TokenLifetimeDays { get; set; } = 30;
    public int RegistrationPermitLimit { get; set; } = 10;
    public int AiPermitLimit { get; set; } = 30;
}
