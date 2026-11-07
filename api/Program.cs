using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using OutfitCombination.Api.Models;
using OutfitCombination.Api.Services;
using System.Globalization;
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
builder.Services.Configure<UsageQuotaOptions>(builder.Configuration.GetSection("UsageQuota"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<InstallationTokenService>();
builder.Services.AddSingleton<PersistentUsageQuotaService>();
builder.Services.AddSingleton<MobileVersionService>();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
});
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 15 * 1024 * 1024);
builder.Services.AddHttpClient<OpenAiWardrobeService>(client => client.Timeout = TimeSpan.FromSeconds(60));
builder.Services.AddCors(options => options.AddPolicy("lan", policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var securityConfig = builder.Configuration.GetSection("AppSecurity").Get<AppSecurityOptions>() ?? new AppSecurityOptions();
if (!builder.Environment.IsDevelopment()
    && System.Text.Encoding.UTF8.GetByteCount(securityConfig.TokenSigningKey?.Trim() ?? string.Empty) < 32)
{
    throw new InvalidOperationException(
        "Production ortamında AppSecurity:TokenSigningKey en az 32 bayt olarak ayarlanmalıdır.");
}
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
                ? $"ai:{value}"
                : $"ai:{context.Connection.RemoteIpAddress}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Math.Clamp(securityConfig.AiPermitLimit, 3, 300),
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

var app = builder.Build();
app.UseCors("lan");

app.Use(async (context, next) =>
{
    var protectedPath = context.Request.Path.StartsWithSegments("/api/analyze")
        || context.Request.Path.StartsWithSegments("/api/outfits");
    if (!protectedPath)
    {
        await next();
        return;
    }

    var authorization = context.Request.Headers.Authorization.ToString();
    var bearer = authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
        ? authorization[7..].Trim()
        : string.Empty;
    var tokens = context.RequestServices.GetRequiredService<InstallationTokenService>();
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

app.MapGet("/health", (PersistentUsageQuotaService quota) => Results.Ok(new
{
    status = "ok",
    quotaPersistence = quota.IsPersistent ? "postgres" : "not_configured"
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
    var photo = form.Files.GetFile("photo");
    if (!Categories.All.Contains(category))
        return Results.BadRequest(new { message = "Kategori top, bottom veya shoes olmalı." });
    if (photo is null || photo.Length == 0)
        return Results.BadRequest(new { message = "Fotoğraf gerekli." });
    if (photo.Length > 12 * 1024 * 1024)
        return Results.BadRequest(new { message = "Fotoğraf en fazla 12 MB olabilir." });

    var contentType = photo.ContentType.ToLowerInvariant();
    if (contentType is not ("image/jpeg" or "image/png" or "image/webp" or "image/gif"))
        return Results.BadRequest(new { message = "JPEG, PNG, WEBP veya GIF fotoğraf gönder." });

    try
    {
        var quotaDecision = await quota.TryConsumeAsync(
            InstallationId(request.HttpContext),
            AiOperation.Analysis,
            cancellationToken);
        if (QuotaError(quotaDecision) is { } quotaError) return quotaError;

        await using var stream = photo.OpenReadStream();
        var result = await ai.AnalyzeAsync(stream, contentType, category, cancellationToken);
        return Results.Ok(result);
    }
    catch (AiServiceException error)
    {
        app.Logger.LogWarning(error, "Kıyafet analizi başarısız");
        return Results.Json(new { message = error.Message }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (InvalidImageException error)
    {
        return Results.BadRequest(new { message = error.Message });
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

    var quotaDecision = await quota.TryConsumeAsync(
        InstallationId(context),
        AiOperation.Outfit,
        cancellationToken);
    if (QuotaError(quotaDecision) is { } quotaError) return quotaError;

    var target = Math.Min(3, OutfitRules.PossibleCount(request.Wardrobe));
    var collected = new List<OutfitSuggestion>();
    string? warning = null;

    for (var attempt = 0; attempt < ai.MaxAttempts && OutfitRules.ValidateAi(request.Wardrobe, collected).Count < target; attempt++)
    {
        try
        {
            collected.AddRange(await ai.SuggestAsync(request, cancellationToken));
        }
        catch (AiServiceException error)
        {
            app.Logger.LogWarning(error, "Kombin AI denemesi {Attempt} başarısız", attempt + 1);
            warning = "AI servisine ulaşılamadığı için yerel kurallar kullanıldı.";
            break;
        }
    }

    var validAi = OutfitRules.ValidateAi(request.Wardrobe, collected);
    var completed = OutfitRules.Complete(request, validAi);
    var usedFallback = completed.Count > validAi.Take(target).Count();
    if (usedFallback && warning is null) warning = "Eksik veya geçersiz AI sonuçları yerel kurallarla tamamlandı.";
    return Results.Ok(new OutfitResponse(completed, usedFallback, warning));
}).RequireRateLimiting("ai");

app.Run();

static string InstallationId(HttpContext context) =>
    context.Items[InstallationTokenService.ContextItemKey]?.ToString()
    ?? throw new InvalidOperationException("Kurulum kimliği doğrulanmadı.");

static IResult? QuotaError(QuotaDecision decision) => decision.Status switch
{
    QuotaStatus.Exceeded => Results.Json(new
    {
        code = "ai_quota_exceeded",
        message = "Bu cihaz için AI kullanım kotası doldu. Yerel özellikleri kullanabilir veya kota yenilendiğinde tekrar deneyebilirsin.",
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

