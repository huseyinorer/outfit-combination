using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace OutfitCombination.Api.Services;

public sealed record InstallationAccessToken(string AccessToken, DateTimeOffset ExpiresAt);

public sealed class InstallationTokenService
{
    public const string ContextItemKey = "OutfitCombination.InstallationId";

    private readonly byte[] signingKey;
    private readonly TimeProvider timeProvider;
    private readonly int tokenLifetimeDays;

    public InstallationTokenService(
        IOptions<AppSecurityOptions> options,
        TimeProvider timeProvider,
        ILogger<InstallationTokenService> logger)
    {
        var configuredKey = options.Value.TokenSigningKey?.Trim() ?? string.Empty;
        if (Encoding.UTF8.GetByteCount(configuredKey) >= 32)
        {
            signingKey = SHA256.HashData(Encoding.UTF8.GetBytes(configuredKey));
        }
        else
        {
            signingKey = RandomNumberGenerator.GetBytes(32);
            logger.LogWarning(
                "AppSecurity:TokenSigningKey en az 32 bayt olarak ayarlanmadı. Bu süreç için geçici anahtar üretildi; sunucu yeniden başladığında mobil istemciler belirteçlerini yeniler.");
        }

        this.timeProvider = timeProvider;
        tokenLifetimeDays = Math.Clamp(options.Value.TokenLifetimeDays, 1, 90);
    }

    public InstallationAccessToken Issue(string installationId)
    {
        if (!Guid.TryParse(installationId, out _))
            throw new ArgumentException("Geçersiz kurulum kimliği.", nameof(installationId));

        var expiresAt = timeProvider.GetUtcNow().AddDays(tokenLifetimeDays);
        var payload = JsonSerializer.SerializeToUtf8Bytes(new TokenPayload(1, installationId, expiresAt.ToUnixTimeSeconds()));
        var signature = HMACSHA256.HashData(signingKey, payload);
        var token = $"{WebEncoders.Base64UrlEncode(payload)}.{WebEncoders.Base64UrlEncode(signature)}";
        return new InstallationAccessToken(token, expiresAt);
    }

    public bool TryValidate(string token, out string installationId)
    {
        installationId = string.Empty;
        if (string.IsNullOrWhiteSpace(token)) return false;

        var parts = token.Split('.');
        if (parts.Length != 2) return false;

        try
        {
            var payloadBytes = WebEncoders.Base64UrlDecode(parts[0]);
            var providedSignature = WebEncoders.Base64UrlDecode(parts[1]);
            var expectedSignature = HMACSHA256.HashData(signingKey, payloadBytes);
            if (!CryptographicOperations.FixedTimeEquals(expectedSignature, providedSignature)) return false;

            var payload = JsonSerializer.Deserialize<TokenPayload>(payloadBytes);
            if (payload is null || payload.Version != 1 || !Guid.TryParse(payload.InstallationId, out _)) return false;
            if (payload.ExpiresAt <= timeProvider.GetUtcNow().ToUnixTimeSeconds()) return false;

            installationId = payload.InstallationId;
            return true;
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            return false;
        }
    }

    private sealed record TokenPayload(int Version, string InstallationId, long ExpiresAt);
}
