using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace OutfitCombination.Api.Services;

public sealed record GoogleProfile(
    string Subject,
    string Email,
    string DisplayName,
    string? PictureUrl);

public sealed class GoogleOAuthException(string message) : Exception(message);

public sealed class GoogleOAuthService(
    HttpClient httpClient,
    IOptions<AccountAuthOptions> options)
{
    private readonly AccountAuthOptions options = options.Value;

    public string BuildAuthorizationUrl(string state)
    {
        if (!options.Enabled) throw new InvalidOperationException("Google hesabı yapılandırılmamış.");
        return QueryHelpers.AddQueryString(
            "https://accounts.google.com/o/oauth2/v2/auth",
            new Dictionary<string, string?>
            {
                ["client_id"] = options.GoogleClientId.Trim(),
                ["redirect_uri"] = options.CallbackUrl.Trim(),
                ["response_type"] = "code",
                ["scope"] = "openid profile email",
                ["state"] = state,
                ["prompt"] = "select_account",
                ["access_type"] = "online"
            });
    }

    public async Task<GoogleProfile> ExchangeAsync(string code, CancellationToken cancellationToken)
    {
        if (!options.Enabled) throw new InvalidOperationException("Google hesabı yapılandırılmamış.");
        using var tokenResponse = await httpClient.PostAsync(
            "https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = options.GoogleClientId.Trim(),
                ["client_secret"] = options.GoogleClientSecret.Trim(),
                ["redirect_uri"] = options.CallbackUrl.Trim(),
                ["grant_type"] = "authorization_code"
            }),
            cancellationToken);
        if (!tokenResponse.IsSuccessStatusCode)
            throw new GoogleOAuthException("Google oturum kodu doğrulanamadı.");

        await using var tokenStream = await tokenResponse.Content.ReadAsStreamAsync(cancellationToken);
        using var tokenJson = await JsonDocument.ParseAsync(tokenStream, cancellationToken: cancellationToken);
        if (!tokenJson.RootElement.TryGetProperty("access_token", out var accessTokenElement)
            || string.IsNullOrWhiteSpace(accessTokenElement.GetString()))
            throw new GoogleOAuthException("Google geçerli bir erişim yanıtı döndürmedi.");

        using var userRequest = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
        userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessTokenElement.GetString());
        using var userResponse = await httpClient.SendAsync(userRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!userResponse.IsSuccessStatusCode)
            throw new GoogleOAuthException("Google kullanıcı bilgisi doğrulanamadı.");

        await using var userStream = await userResponse.Content.ReadAsStreamAsync(cancellationToken);
        using var userJson = await JsonDocument.ParseAsync(userStream, cancellationToken: cancellationToken);
        var root = userJson.RootElement;
        var subject = String(root, "sub");
        var email = String(root, "email");
        var verified = root.TryGetProperty("email_verified", out var verifiedElement) && verifiedElement.ValueKind == JsonValueKind.True;
        if (string.IsNullOrWhiteSpace(subject)
            || subject.Length > 255
            || string.IsNullOrWhiteSpace(email)
            || email.Length > 320
            || !verified)
            throw new GoogleOAuthException("Google hesabının doğrulanmış e-posta bilgisi alınamadı.");

        var name = String(root, "name");
        var picture = String(root, "picture");
        var displayName = string.IsNullOrWhiteSpace(name) ? email : name.Trim();
        if (displayName.Length > 200) displayName = displayName[..200];
        var safePicture = picture.Length <= 2048
            && Uri.TryCreate(picture, UriKind.Absolute, out var pictureUri)
            && pictureUri.Scheme == Uri.UriSchemeHttps
                ? picture
                : null;
        return new GoogleProfile(subject, email, displayName, safePicture);
    }

    private static string String(JsonElement root, string property) =>
        root.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;
}
