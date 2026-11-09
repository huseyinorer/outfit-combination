using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace OutfitCombination.Api.Services;

public sealed record InstallationAccessToken(string AccessToken, DateTimeOffset ExpiresAt);
public sealed record UserAccessToken(string AccessToken, DateTimeOffset ExpiresAt);

public sealed class InstallationTokenService
{
    public const string ContextItemKey = "OutfitCombination.InstallationId";
    public const string UserContextItemKey = "OutfitCombination.UserId";
    public const string UserTierContextItemKey = "OutfitCombination.UserTier";

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
        return new InstallationAccessToken(Sign(payload), expiresAt);
    }

    public UserAccessToken IssueUser(Guid userId, string installationId)
    {
        if (userId == Guid.Empty) throw new ArgumentException("Geçersiz kullanıcı kimliği.", nameof(userId));
        if (!Guid.TryParse(installationId, out _))
            throw new ArgumentException("Geçersiz kurulum kimliği.", nameof(installationId));

        var expiresAt = timeProvider.GetUtcNow().AddDays(tokenLifetimeDays);
        var payload = JsonSerializer.SerializeToUtf8Bytes(
            new UserTokenPayload(2, userId, installationId, expiresAt.ToUnixTimeSeconds()));
        return new UserAccessToken(Sign(payload), expiresAt);
    }

    public bool TryValidate(string token, out string installationId)
    {
        installationId = string.Empty;
        if (string.IsNullOrWhiteSpace(token)) return false;

        var parts = token.Split('.');
        if (parts.Length != 2) return false;

        try
        {
            if (!TryDecodeCanonical(parts[0], out var payloadBytes)
                || !TryDecodeCanonical(parts[1], out var providedSignature)) return false;
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

    public bool TryValidateUser(string token, out Guid userId, out string installationId)
    {
        userId = Guid.Empty;
        installationId = string.Empty;
        if (!TryReadPayload(token, out var payloadBytes)) return false;

        try
        {
            var payload = JsonSerializer.Deserialize<UserTokenPayload>(payloadBytes);
            if (payload is null
                || payload.Version != 2
                || payload.UserId == Guid.Empty
                || !Guid.TryParse(payload.InstallationId, out _)
                || payload.ExpiresAt <= timeProvider.GetUtcNow().ToUnixTimeSeconds()) return false;
            userId = payload.UserId;
            installationId = payload.InstallationId;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private string Sign(byte[] payload)
    {
        var signature = HMACSHA256.HashData(signingKey, payload);
        return $"{WebEncoders.Base64UrlEncode(payload)}.{WebEncoders.Base64UrlEncode(signature)}";
    }

    private bool TryReadPayload(string token, out byte[] payloadBytes)
    {
        payloadBytes = [];
        if (string.IsNullOrWhiteSpace(token)) return false;
        var parts = token.Split('.');
        if (parts.Length != 2) return false;
        try
        {
            if (!TryDecodeCanonical(parts[0], out payloadBytes)
                || !TryDecodeCanonical(parts[1], out var providedSignature)) return false;
            var expectedSignature = HMACSHA256.HashData(signingKey, payloadBytes);
            return CryptographicOperations.FixedTimeEquals(expectedSignature, providedSignature);
        }
        catch (FormatException)
        {
            payloadBytes = [];
            return false;
        }
    }

    private static bool TryDecodeCanonical(string value, out byte[] bytes)
    {
        bytes = [];
        try
        {
            bytes = WebEncoders.Base64UrlDecode(value);
            if (string.Equals(WebEncoders.Base64UrlEncode(bytes), value, StringComparison.Ordinal)) return true;
            bytes = [];
            return false;
        }
        catch (FormatException)
        {
            bytes = [];
            return false;
        }
    }

    private sealed record TokenPayload(int Version, string InstallationId, long ExpiresAt);
    private sealed record UserTokenPayload(int Version, Guid UserId, string InstallationId, long ExpiresAt);
}
