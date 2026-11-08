using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace OutfitCombination.Api.Services;

public sealed class EmailOtpException(string message) : Exception(message);

public sealed class EmailOtpSender(
    HttpClient httpClient,
    IOptions<EmailAuthOptions> configuredOptions)
{
    private readonly EmailAuthOptions options = configuredOptions.Value;

    public bool IsEnabled => options.Enabled;
    public TimeSpan CodeLifetime => TimeSpan.FromMinutes(Math.Clamp(options.CodeLifetimeMinutes, 5, 30));
    public TimeSpan ResendCooldown => TimeSpan.FromSeconds(Math.Clamp(options.ResendCooldownSeconds, 30, 300));
    public int MaximumAttempts => Math.Clamp(options.MaximumAttempts, 3, 10);

    public async Task SendCodeAsync(
        string email,
        string code,
        string language,
        CancellationToken cancellationToken)
    {
        if (!options.Enabled) throw new InvalidOperationException("E-posta ile giriş yapılandırılmamış.");
        var english = string.Equals(language, "en", StringComparison.OrdinalIgnoreCase);
        var subject = english ? "Your Outfit Combination sign-in code" : "Outfit Combination giriş kodun";
        var heading = english ? "Your sign-in code" : "Giriş kodun";
        var expiry = english
            ? $"This code expires in {Math.Clamp(options.CodeLifetimeMinutes, 5, 30)} minutes. If you did not request it, you can ignore this email."
            : $"Bu kod {Math.Clamp(options.CodeLifetimeMinutes, 5, 30)} dakika içinde geçersiz olur. Bu isteği sen yapmadıysan e-postayı yok sayabilirsin.";

        using var request = new HttpRequestMessage(HttpMethod.Post, options.Endpoint.Trim());
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey.Trim());
        request.Content = JsonContent.Create(new
        {
            from = $"{options.FromName.Trim()} <{options.FromAddress.Trim()}>",
            to = new[] { email },
            subject,
            html = $"<div style=\"font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#25231f\"><h1>{heading}</h1><p style=\"font-size:32px;font-weight:800;letter-spacing:8px\">{code}</p><p>{expiry}</p></div>",
            text = $"{heading}: {code}\n\n{expiry}"
        });

        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new EmailOtpException("Doğrulama e-postası gönderilemedi.");
    }
}
