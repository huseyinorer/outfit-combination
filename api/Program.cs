using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using OutfitCombination.Api.Models;
using OutfitCombination.Api.Services;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var renderPort))
    builder.WebHost.UseUrls($"http://0.0.0.0:{renderPort}");

builder.Services.Configure<OpenAiOptions>(builder.Configuration.GetSection("OpenAI"));
builder.Services.Configure<MobileUpdateOptions>(builder.Configuration.GetSection("MobileUpdate"));
builder.Services.Configure<AppSecurityOptions>(builder.Configuration.GetSection("AppSecurity"));
builder.Services.Configure<AccountAuthOptions>(builder.Configuration.GetSection("AccountAuth"));
builder.Services.Configure<EmailAuthOptions>(builder.Configuration.GetSection("EmailAuth"));
builder.Services.Configure<UsageQuotaOptions>(builder.Configuration.GetSection("UsageQuota"));
builder.Services.Configure<BackgroundRemovalOptions>(builder.Configuration.GetSection("BackgroundRemoval"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<InstallationTokenService>();
builder.Services.AddSingleton<PersistentUsageQuotaService>();
builder.Services.AddSingleton<AccountStore>();
builder.Services.AddSingleton<MobileVersionService>();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
});
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 15 * 1024 * 1024);
builder.Services.AddHttpClient<OpenAiWardrobeService>(client => client.Timeout = TimeSpan.FromSeconds(60));
builder.Services.AddHttpClient<GoogleOAuthService>(client => client.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHttpClient<EmailOtpSender>(client => client.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHttpClient<BackgroundRemovalService>(client => client.Timeout = TimeSpan.FromSeconds(45));
builder.Services.AddCors(options => options.AddPolicy("lan", policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var securityConfig = builder.Configuration.GetSection("AppSecurity").Get<AppSecurityOptions>() ?? new AppSecurityOptions();
var accountConfig = builder.Configuration.GetSection("AccountAuth").Get<AccountAuthOptions>() ?? new AccountAuthOptions();
var emailConfig = builder.Configuration.GetSection("EmailAuth").Get<EmailAuthOptions>() ?? new EmailAuthOptions();
var accountAuthEnabled = accountConfig.GoogleEnabled || emailConfig.Enabled;
if (!builder.Environment.IsDevelopment()
    && System.Text.Encoding.UTF8.GetByteCount(securityConfig.TokenSigningKey?.Trim() ?? string.Empty) < 32)
{
    throw new InvalidOperationException(
        "Production ortamında AppSecurity:TokenSigningKey en az 32 bayt olarak ayarlanmalıdır.");
}
if (accountConfig.PartiallyConfigured)
    throw new InvalidOperationException(
        "AccountAuth etkinleştirilecekse GoogleClientId, GoogleClientSecret ve CallbackUrl birlikte ayarlanmalıdır.");
if (emailConfig.PartiallyConfigured)
    throw new InvalidOperationException(
        "EmailAuth etkinleştirilecekse ApiKey ve geçerli FromAddress birlikte ayarlanmalıdır.");
if (!builder.Environment.IsDevelopment() && !accountAuthEnabled)
    throw new InvalidOperationException(
        "Production ortamında Google veya e-posta hesap sağlayıcılarından en az biri yapılandırılmalıdır.");
if (!builder.Environment.IsDevelopment()
    && accountConfig.GoogleEnabled
    && (!Uri.TryCreate(accountConfig.CallbackUrl, UriKind.Absolute, out var callbackUri)
        || callbackUri.Scheme != Uri.UriSchemeHttps))
    throw new InvalidOperationException("Production AccountAuth:CallbackUrl HTTPS olmalıdır.");
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter =
                Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { message = "Çok fazla istek gönderildi. Birkaç dakika sonra yeniden dene." },
            cancellationToken);
    };
    options.AddPolicy("installation-registration", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"register:{context.Connection.RemoteIpAddress}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Math.Clamp(securityConfig.RegistrationPermitLimit, 3, 100),
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.AddPolicy("ai", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Items.TryGetValue(InstallationTokenService.ContextItemKey, out var value)
                ? $"ai:installation:{value}"
                : $"ai:{context.Connection.RemoteIpAddress}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Math.Clamp(securityConfig.AiPermitLimit, 3, 300),
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.AddPolicy("account-auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"account:{context.Connection.RemoteIpAddress}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.AddPolicy("email-send", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"email:{context.Connection.RemoteIpAddress}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

var app = builder.Build();
app.UseCors("lan");

app.Logger.LogInformation(
    "startup environment={Environment} accountAuth={AccountAuth} googleEnabled={GoogleEnabled} emailEnabled={EmailEnabled} openAiModel={OpenAiModel}",
    app.Environment.EnvironmentName,
    accountAuthEnabled,
    accountConfig.GoogleEnabled,
    emailConfig.Enabled,
    builder.Configuration["OpenAI:Model"] ?? "");

app.Use(async (context, next) =>
{
    var aiPath = context.Request.Path.StartsWithSegments("/api/analyze")
        || context.Request.Path.StartsWithSegments("/api/outfits")
        || context.Request.Path.StartsWithSegments("/api/background-removal");
    var accountExchangePath = context.Request.Path.StartsWithSegments("/api/account/google/start")
        || context.Request.Path.StartsWithSegments("/api/account/google/complete")
        || context.Request.Path.StartsWithSegments("/api/account/email/start")
        || context.Request.Path.StartsWithSegments("/api/account/email/complete");
    var accountPath = context.Request.Path.StartsWithSegments("/api/account/me")
        || (context.Request.Method == HttpMethods.Delete && context.Request.Path.Equals("/api/account"));
    if (!aiPath && !accountExchangePath && !accountPath)
    {
        await next();
        return;
    }

    var authorization = context.Request.Headers.Authorization.ToString();
    var bearer = authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
        ? authorization[7..].Trim()
        : string.Empty;
    var tokens = context.RequestServices.GetRequiredService<InstallationTokenService>();

    if ((aiPath && accountAuthEnabled) || accountPath)
    {
        if (tokens.TryValidateUser(bearer, out var userId, out var userInstallationId))
        {
            var accounts = context.RequestServices.GetRequiredService<AccountStore>();
            if (await accounts.GetUserAsync(userId, context.RequestAborted) is { } user)
            {
                context.Items[InstallationTokenService.UserContextItemKey] = userId;
                context.Items[InstallationTokenService.ContextItemKey] = userInstallationId;
                context.Items[InstallationTokenService.UserTierContextItemKey] = user.Tier;
                await next();
                return;
            }
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new
        {
            code = "account_session_required",
            message = "AI özelliklerini kullanmak için hesabınla giriş yap."
        });
        return;
    }

    if (tokens.TryValidate(bearer, out var installationId))
    {
        context.Items[InstallationTokenService.ContextItemKey] = installationId;
        await next();
        return;
    }

    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
    await context.Response.WriteAsJsonAsync(new
    {
        code = "installation_token_required",
        message = "Uygulama erişimi doğrulanamadı. Bağlantıyı yenileyip tekrar dene."
    });
});

app.UseRateLimiter();

app.MapGet("/health", (PersistentUsageQuotaService quota, AccountStore accounts) => Results.Ok(new
{
    status = "ok",
    quotaPersistence = quota.IsPersistent ? "postgres" : "not_configured",
    accountPersistence = accounts.IsPersistent ? "postgres" : "not_configured",
    accountAuth = accountAuthEnabled ? "enabled" : "disabled"
}));

app.MapGet("/api/version", (MobileVersionService versions, IOptions<MobileUpdateOptions> options) =>
{
    var update = options.Value;
    return Results.Ok(new
    {
        latestVersion = versions.LatestVersion,
        minimumVersion = update.MinimumVersion,
        forceLatest = update.ForceLatest,
        androidDownloadUrl = update.AndroidDownloadUrl
    });
});

app.MapPost("/api/installations/register", (
    InstallationRegistration registration,
    InstallationTokenService tokens,
    HttpResponse response) =>
{
    if (!Guid.TryParse(registration.InstallationId, out _))
        return Results.BadRequest(new { message = "Geçerli bir kurulum kimliği gerekli." });
    if (registration.AppVersion is { Length: > 32 })
        return Results.BadRequest(new { message = "Uygulama sürümü geçersiz." });

    var issued = tokens.Issue(registration.InstallationId);
    response.Headers.CacheControl = "no-store";
    return Results.Ok(new
    {
        accessToken = issued.AccessToken,
        expiresAt = issued.ExpiresAt
    });
}).RequireRateLimiting("installation-registration");

app.MapGet("/api/account/config", (IOptions<AccountAuthOptions> googleOptions, IOptions<EmailAuthOptions> emailOptions) => Results.Ok(new
{
    enabled = googleOptions.Value.GoogleEnabled || emailOptions.Value.Enabled,
    googleEnabled = googleOptions.Value.GoogleEnabled,
    emailEnabled = emailOptions.Value.Enabled
}));

app.MapPost("/api/account/google/start", async (
    HttpContext context,
    AccountStore accounts,
    GoogleOAuthService google,
    IOptions<AccountAuthOptions> options,
    CancellationToken cancellationToken) =>
{
    if (!options.Value.GoogleEnabled)
        return Results.Json(new { message = "Google hesabı henüz yapılandırılmamış." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    if (!accounts.IsPersistent)
        return Results.Json(new { message = "Hesap veritabanına şu anda ulaşılamıyor." }, statusCode: StatusCodes.Status503ServiceUnavailable);

    var lifetime = TimeSpan.FromMinutes(Math.Clamp(options.Value.AttemptLifetimeMinutes, 5, 30));
    var attempt = await accounts.CreateAttemptAsync(InstallationId(context), lifetime, cancellationToken);
    if (attempt is null)
        return Results.Json(new { message = "Google oturumu başlatılamadı." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    return Results.Ok(new { authorizationUrl = google.BuildAuthorizationUrl(attempt.State) });
}).RequireRateLimiting("account-auth");

app.MapGet("/api/account/google/callback", async (
    string? code,
    string? state,
    string? error,
    HttpResponse response,
    AccountStore accounts,
    GoogleOAuthService google,
    IOptions<AccountAuthOptions> options,
    CancellationToken cancellationToken) =>
{
    response.Headers.CacheControl = "no-store";
    response.Headers.Pragma = "no-cache";
    response.Headers["Referrer-Policy"] = "no-referrer";
    response.Headers["Content-Security-Policy"] = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    if (!options.Value.GoogleEnabled)
        return AccountReturnPage(options.Value.AppReturnScheme, false, "not_configured", "Google oturumu yapılandırılmamış.");

    var installationId = string.IsNullOrWhiteSpace(state)
        ? null
        : await accounts.ConsumeAttemptAsync(state, cancellationToken);
    if (installationId is null)
        return AccountReturnPage(options.Value.AppReturnScheme, false, "invalid_state", "Oturum isteğinin süresi doldu. Uygulamadan yeniden dene.");
    if (!string.IsNullOrWhiteSpace(error))
        return AccountReturnPage(options.Value.AppReturnScheme, false, "cancelled", "Google ile giriş iptal edildi.");
    if (string.IsNullOrWhiteSpace(code) || code.Length > 4096)
        return AccountReturnPage(options.Value.AppReturnScheme, false, "invalid_code", "Google geçerli bir oturum kodu döndürmedi.");

    try
    {
        var profile = await google.ExchangeAsync(code, cancellationToken);
        var user = await accounts.UpsertGoogleUserAsync(
            profile.Subject,
            profile.Email,
            profile.DisplayName,
            profile.PictureUrl,
            cancellationToken);
        var exchangeCode = await accounts.CreateExchangeCodeAsync(
            user.Id,
            installationId.Value,
            TimeSpan.FromMinutes(2),
            cancellationToken);
        return AccountReturnPage(options.Value.AppReturnScheme, true, exchangeCode, "Giriş tamamlandı. Uygulamaya dönebilirsin.");
    }
    catch (Exception callbackError) when (callbackError is GoogleOAuthException or HttpRequestException or JsonException or Npgsql.NpgsqlException or InvalidOperationException)
    {
        app.Logger.LogWarning(callbackError, "Google hesap dönüşü tamamlanamadı");
        return AccountReturnPage(options.Value.AppReturnScheme, false, "exchange_failed", "Google ile giriş tamamlanamadı. Uygulamadan yeniden dene.");
    }
}).RequireRateLimiting("account-auth");

app.MapPost("/api/account/google/complete", async (
    AccountExchangeRequest request,
    HttpContext context,
    HttpResponse response,
    AccountStore accounts,
    InstallationTokenService tokens,
    PersistentUsageQuotaService quota,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Length > 256)
        return Results.BadRequest(new { message = "Geçerli bir oturum tamamlama kodu gerekli." });
    var installationId = InstallationId(context);
    var user = await accounts.ConsumeExchangeCodeAsync(request.Code, installationId, cancellationToken);
    if (user is null)
        return Results.BadRequest(new { message = "Oturum kodu geçersiz, kullanılmış veya süresi dolmuş." });
    var issued = tokens.IssueUser(user.Id, installationId);
    var usage = await quota.GetSnapshotAsync(user.Id.ToString(), installationId, user.Tier, cancellationToken);
    response.Headers.CacheControl = "no-store";
    return Results.Ok(new
    {
        accessToken = issued.AccessToken,
        expiresAt = issued.ExpiresAt,
        user = new { id = user.Id, user.Email, user.DisplayName, user.PictureUrl, user.Tier },
        usage
    });
}).RequireRateLimiting("account-auth");

app.MapPost("/api/account/email/start", async (
    EmailSignInStartRequest request,
    HttpContext context,
    HttpResponse response,
    AccountStore accounts,
    EmailOtpSender emailSender,
    CancellationToken cancellationToken) =>
{
    if (!emailSender.IsEnabled)
        return Results.Json(new { code = "email_auth_unavailable", message = "E-posta ile giriş henüz kullanıma hazır değil." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    if (!accounts.IsPersistent)
        return Results.Json(new { code = "account_store_unavailable", message = "Hesap servisine şu anda ulaşılamıyor." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    var email = AccountStore.NormalizeEmail(request.Email);
    if (email is null)
        return Results.BadRequest(new { code = "invalid_email", message = "Geçerli bir e-posta adresi yaz." });

    var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
    var installationId = InstallationId(context);
    var challenge = await accounts.CreateEmailChallengeAsync(
        email,
        installationId,
        code,
        emailSender.CodeLifetime,
        emailSender.ResendCooldown,
        cancellationToken);
    if (challenge == EmailChallengeStatus.Throttled)
    {
        response.Headers.RetryAfter = Math.Ceiling(emailSender.ResendCooldown.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        return Results.Json(new { code = "email_code_throttled", message = "Yeni kod istemeden önce kısa bir süre bekle." }, statusCode: StatusCodes.Status429TooManyRequests);
    }
    if (challenge != EmailChallengeStatus.Created)
        return Results.Json(new { code = "account_store_unavailable", message = "Giriş kodu şu anda oluşturulamıyor." }, statusCode: StatusCodes.Status503ServiceUnavailable);

    try
    {
        await emailSender.SendCodeAsync(email, code, request.Language ?? "tr", cancellationToken);
    }
    catch (Exception error) when (error is EmailOtpException or HttpRequestException or TaskCanceledException)
    {
        await accounts.DeleteEmailChallengeAsync(email, installationId, CancellationToken.None);
        app.Logger.LogWarning(error, "E-posta giriş kodu gönderilemedi");
        return Results.Json(new { code = "email_delivery_failed", message = "Giriş kodu gönderilemedi. Biraz sonra yeniden dene." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    response.Headers.CacheControl = "no-store";
    return Results.Ok(new
    {
        code = "email_code_sent",
        message = "Altı haneli giriş kodu e-posta adresine gönderildi.",
        expiresInSeconds = (int)emailSender.CodeLifetime.TotalSeconds
    });
}).RequireRateLimiting("email-send");

app.MapPost("/api/account/email/complete", async (
    EmailSignInCompleteRequest request,
    HttpContext context,
    HttpResponse response,
    AccountStore accounts,
    EmailOtpSender emailSender,
    InstallationTokenService tokens,
    PersistentUsageQuotaService quota,
    CancellationToken cancellationToken) =>
{
    var email = AccountStore.NormalizeEmail(request.Email);
    var code = request.Code?.Trim() ?? string.Empty;
    if (email is null || code.Length != 6 || code.Any(character => !char.IsAsciiDigit(character)))
        return Results.BadRequest(new { code = "invalid_email_code", message = "E-posta adresini ve altı haneli kodu kontrol et." });
    var installationId = InstallationId(context);
    if (!await accounts.ConsumeEmailChallengeAsync(email, installationId, code, emailSender.MaximumAttempts, cancellationToken))
        return Results.BadRequest(new { code = "invalid_email_code", message = "Kod geçersiz veya süresi dolmuş. Yeni bir kod isteyebilirsin." });

    var user = await accounts.UpsertEmailUserAsync(email, cancellationToken);
    var issued = tokens.IssueUser(user.Id, installationId);
    var usage = await quota.GetSnapshotAsync(user.Id.ToString(), installationId, user.Tier, cancellationToken);
    response.Headers.CacheControl = "no-store";
    return Results.Ok(new
    {
        accessToken = issued.AccessToken,
        expiresAt = issued.ExpiresAt,
        user = new { id = user.Id, user.Email, user.DisplayName, user.PictureUrl, user.Tier },
        usage
    });
}).RequireRateLimiting("account-auth");

app.MapGet("/api/account/me", async (
    HttpContext context,
    HttpResponse response,
    AccountStore accounts,
    PersistentUsageQuotaService quota,
    CancellationToken cancellationToken) =>
{
    var userId = UserId(context);
    var user = await accounts.GetUserAsync(userId, cancellationToken);
    if (user is null) return Results.NotFound(new { message = "Kullanıcı hesabı bulunamadı." });
    var usage = await quota.GetSnapshotAsync(userId.ToString(), InstallationId(context), user.Tier, cancellationToken);
    response.Headers.CacheControl = "no-store";
    return Results.Ok(new
    {
        user = new { id = user.Id, user.Email, user.DisplayName, user.PictureUrl, user.Tier },
        usage
    });
});

app.MapDelete("/api/account", async (
    HttpContext context,
    AccountStore accounts,
    CancellationToken cancellationToken) =>
{
    var deleted = await accounts.DeleteUserAsync(UserId(context), cancellationToken);
    return deleted ? Results.NoContent() : Results.NotFound(new { message = "Kullanıcı hesabı bulunamadı." });
});

app.MapPost("/api/analyze", async (
    HttpRequest request,
    OpenAiWardrobeService ai,
    PersistentUsageQuotaService quota,
    CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest(new { message = "multipart/form-data bekleniyor." });

    var form = await request.ReadFormAsync(cancellationToken);
    var category = form["category"].ToString();
    var language = form["language"].ToString().Equals("en", StringComparison.OrdinalIgnoreCase) ? "en" : "tr";
    var photo = form.Files.GetFile("photo");
    if (!Categories.All.Contains(category))
        return Results.BadRequest(new { message = $"Kategori şu değerlerden biri olmalı: {string.Join(", ", Categories.All)}." });
    if (photo is null || photo.Length == 0)
        return Results.BadRequest(new { message = "Fotoğraf gerekli." });
    if (photo.Length > 12 * 1024 * 1024)
        return Results.BadRequest(new { message = "Fotoğraf en fazla 12 MB olabilir." });

    var contentType = photo.ContentType.ToLowerInvariant();
    if (contentType is not ("image/jpeg" or "image/png" or "image/webp" or "image/gif"))
        return Results.BadRequest(new { message = "JPEG, PNG, WEBP veya GIF fotoğraf gönder." });

    try
    {
        var usageSubjects = UsageSubjects(request.HttpContext);
        var tier = UserTier(request.HttpContext);
        var quotaDecision = await quota.TryConsumeAsync(
            usageSubjects.Primary,
            usageSubjects.Secondary,
            AiOperation.Analysis,
            tier,
            cancellationToken);
        if (QuotaError(quotaDecision) is { } quotaError) return quotaError;

        await using var stream = photo.OpenReadStream();
        var result = await ai.AnalyzeAsync(stream, contentType, category, language, cancellationToken);
        return Results.Ok(result);
    }
    catch (AiServiceException error)
    {
        var usageSubjects = UsageSubjects(request.HttpContext);
        await quota.RefundAsync(usageSubjects.Primary, usageSubjects.Secondary, AiOperation.Analysis, CancellationToken.None);
        app.Logger.LogWarning(error, "Kıyafet analizi başarısız");
        return Results.Json(new { message = error.Message }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (InvalidImageException error)
    {
        var usageSubjects = UsageSubjects(request.HttpContext);
        await quota.RefundAsync(usageSubjects.Primary, usageSubjects.Secondary, AiOperation.Analysis, CancellationToken.None);
        return Results.BadRequest(new { message = error.Message });
    }
}).RequireRateLimiting("ai");

app.MapGet("/api/background-removal/config", (IOptions<BackgroundRemovalOptions> options) => Results.Ok(new
{
    enabled = options.Value.Enabled,
    provider = options.Value.Provider
}));

app.MapPost("/api/background-removal", async (
    HttpRequest request,
    BackgroundRemovalService backgroundRemoval,
    CancellationToken cancellationToken) =>
{
    if (!backgroundRemoval.Enabled)
        return Results.Json(new { code = "background_removal_disabled", message = "Arka plan kaldırma servisi henüz kullanıma hazır değil." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    var tier = UserTier(request.HttpContext);
    if (!string.Equals(tier, AccountTier.Premium, StringComparison.OrdinalIgnoreCase))
        return Results.Json(new { code = "premium_required", message = "Arka plan kaldırma premium hesaplara açıktır." }, statusCode: StatusCodes.Status402PaymentRequired);
    if (!request.HasFormContentType)
        return Results.BadRequest(new { message = "multipart/form-data bekleniyor." });

    var form = await request.ReadFormAsync(cancellationToken);
    var photo = form.Files.GetFile("photo");
    if (photo is null || photo.Length == 0)
        return Results.BadRequest(new { message = "Fotoğraf gerekli." });
    if (photo.Length > backgroundRemoval.MaxUploadBytes)
        return Results.BadRequest(new { message = "Fotoğraf boyutu çok büyük." });
    var contentType = photo.ContentType.ToLowerInvariant();
    if (contentType is not ("image/jpeg" or "image/png" or "image/webp"))
        return Results.BadRequest(new { message = "JPEG, PNG veya WEBP fotoğraf gönder." });

    try
    {
        await using var stream = photo.OpenReadStream();
        var result = await backgroundRemoval.RemoveAsync(stream, contentType, cancellationToken);
        return Results.File(result.PngBytes, result.ContentType, "cutout.png");
    }
    catch (BackgroundRemovalException error)
    {
        app.Logger.LogWarning(error, "Arka plan kaldırma başarısız");
        return Results.Json(new { code = "background_removal_failed", message = error.Message }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}).RequireRateLimiting("ai");

app.MapPost("/api/outfits", async (
    OutfitRequest request,
    HttpContext context,
    OpenAiWardrobeService ai,
    PersistentUsageQuotaService quota,
    CancellationToken cancellationToken) =>
{
    if (OutfitRules.HasOversizedInput(request))
        return Results.BadRequest(new { message = "Kombin isteğindeki metin veya liste sınırı aşıldı." });
    if (request.Wardrobe.Count > 500)
        return Results.BadRequest(new { message = "Bir istekte en fazla 500 kıyafet gönderilebilir." });
    if (request.Wardrobe.Any(x => string.IsNullOrWhiteSpace(x.Id) || !Categories.All.Contains(x.Category)))
        return Results.BadRequest(new { message = "Her kıyafetin geçerli ID ve kategorisi olmalı." });
    if (request.Wardrobe.GroupBy(x => x.Id).Any(group => group.Count() > 1))
        return Results.BadRequest(new { message = "Kıyafet ID'leri benzersiz olmalı." });

    var missing = OutfitRules.MissingCategories(request.Wardrobe);
    if (missing.Count > 0)
        return Results.BadRequest(new { code = "missing_category", missingCategories = missing, message = "Kombin için her ana kategoriden en az bir parça gerekli." });

    var usageSubjects = UsageSubjects(context);
    var tier = UserTier(context);
    var quotaDecision = await quota.TryConsumeAsync(
        usageSubjects.Primary,
        usageSubjects.Secondary,
        AiOperation.Outfit,
        tier,
        cancellationToken);
    if (QuotaError(quotaDecision) is { } quotaError) return quotaError;

    var target = Math.Min(3, OutfitRules.PossibleCount(request.Wardrobe));
    var english = request.Language.Equals("en", StringComparison.OrdinalIgnoreCase);
    var collected = new List<OutfitSuggestion>();
    string? warning = null;
    var aiResponded = false;

    for (var attempt = 0; attempt < ai.MaxAttempts && OutfitRules.ValidateAi(request.Wardrobe, collected).Count < target; attempt++)
    {
        try
        {
            collected.AddRange(await ai.SuggestAsync(request, cancellationToken));
            aiResponded = true;
        }
        catch (AiServiceException error)
        {
            app.Logger.LogWarning(error, "Kombin AI denemesi {Attempt} başarısız", attempt + 1);
            warning = english
                ? "The smart suggestion service was unavailable, so local rules were used."
                : "Akıllı öneri servisine ulaşılamadığı için yerel kurallar kullanıldı.";
            break;
        }
    }

    if (!aiResponded && warning is not null)
        await quota.RefundAsync(usageSubjects.Primary, usageSubjects.Secondary, AiOperation.Outfit, CancellationToken.None);

    var validAi = OutfitRules.ValidateAi(request.Wardrobe, collected);
    var completed = OutfitRules.Complete(request, validAi);
    var usedFallback = completed.Count > validAi.Take(target).Count();
    if (usedFallback && warning is null)
        warning = english
            ? "Missing or invalid smart suggestions were completed with local rules."
            : "Eksik veya geçersiz akıllı öneriler yerel kurallarla tamamlandı.";
    return Results.Ok(new OutfitResponse(completed, usedFallback, warning));
}).RequireRateLimiting("ai");

app.Run();

static string InstallationId(HttpContext context) =>
    context.Items[InstallationTokenService.ContextItemKey]?.ToString()
    ?? throw new InvalidOperationException("Kurulum kimliği doğrulanmadı.");

static Guid UserId(HttpContext context) =>
    context.Items[InstallationTokenService.UserContextItemKey] is Guid userId && userId != Guid.Empty
        ? userId
        : throw new InvalidOperationException("Kullanıcı oturumu doğrulanmadı.");

static string UserTier(HttpContext context) =>
    context.Items[InstallationTokenService.UserTierContextItemKey] is string tier
        ? AccountTier.Normalize(tier)
        : AccountTier.Free;

static (string Primary, string? Secondary) UsageSubjects(HttpContext context)
{
    var installationId = InstallationId(context);
    return context.Items[InstallationTokenService.UserContextItemKey] is Guid userId && userId != Guid.Empty
        ? (userId.ToString(), installationId)
        : (installationId, null);
}

static IResult AccountReturnPage(string configuredScheme, bool success, string value, string message)
{
    var scheme = IsValidScheme(configuredScheme) ? configuredScheme.Trim() : "outfitcombination";
    var target = success
        ? $"{scheme}://auth?code={Uri.EscapeDataString(value)}"
        : $"{scheme}://auth?error={Uri.EscapeDataString(value)}";
    var targetJson = JsonSerializer.Serialize(target);
    var safeTarget = System.Text.Encodings.Web.HtmlEncoder.Default.Encode(target);
    var safeMessage = System.Text.Encodings.Web.HtmlEncoder.Default.Encode(message);
    var html = $$"""
        <!doctype html>
        <html lang="tr">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Outfit Combination</title>
          <style>
            body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f3ea; color: #25231f; font-family: system-ui, sans-serif; }
            main { width: min(420px, calc(100% - 40px)); padding: 28px; border-radius: 24px; background: #fffdf8; box-shadow: 0 12px 40px rgba(37,35,31,.12); }
            h1 { margin: 0 0 12px; font-size: 24px; }
            p { line-height: 1.55; color: #666158; }
            a { display: block; margin-top: 20px; padding: 15px 18px; border-radius: 14px; background: #345c45; color: white; text-align: center; text-decoration: none; font-weight: 800; }
          </style>
        </head>
        <body>
          <main>
            <h1>{{(success ? "Giriş tamamlandı" : "Giriş tamamlanamadı")}}</h1>
            <p>{{safeMessage}}</p>
            <a href="{{safeTarget}}">Uygulamaya dön</a>
          </main>
          <script>window.location.replace({{targetJson}});</script>
        </body>
        </html>
        """;
    return Results.Content(html, "text/html; charset=utf-8");
}

static bool IsValidScheme(string value)
{
    if (string.IsNullOrWhiteSpace(value)) return false;
    var scheme = value.Trim();
    return char.IsAsciiLetter(scheme[0])
        && scheme.All(character => char.IsAsciiLetterOrDigit(character) || character is '+' or '-' or '.');
}

static IResult? QuotaError(QuotaDecision decision) => decision.Status switch
{
    QuotaStatus.Exceeded => Results.Json(new
    {
        code = "ai_quota_exceeded",
        message = "AI kullanım hakkın doldu. Yerel özellikleri kullanabilir veya hakların yenilendiğinde tekrar deneyebilirsin.",
        dailyUsed = decision.DailyUsed,
        monthlyUsed = decision.MonthlyUsed
    }, statusCode: StatusCodes.Status429TooManyRequests),
    QuotaStatus.Unavailable => Results.Json(new
    {
        code = "quota_service_unavailable",
        message = "AI kullanım kotası şu anda doğrulanamıyor. Maliyeti korumak için AI isteği gönderilmedi."
    }, statusCode: StatusCodes.Status503ServiceUnavailable),
    _ => null
};

public partial class Program;

