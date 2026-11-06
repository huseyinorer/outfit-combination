using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using OutfitCombination.Api.Models;
using OutfitCombination.Api.Services;

var builder = WebApplication.CreateBuilder(args);

if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var renderPort))
    builder.WebHost.UseUrls($"http://0.0.0.0:{renderPort}");

builder.Services.Configure<OpenAiOptions>(builder.Configuration.GetSection("OpenAI"));
builder.Services.Configure<MobileUpdateOptions>(builder.Configuration.GetSection("MobileUpdate"));
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

var app = builder.Build();
app.UseCors("lan");

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

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

app.MapPost("/api/analyze", async (HttpRequest request, OpenAiWardrobeService ai, CancellationToken cancellationToken) =>
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
        await using var stream = photo.OpenReadStream();
        var result = await ai.AnalyzeAsync(stream, contentType, category, cancellationToken);
        return Results.Ok(result);
    }
    catch (AiServiceException error)
    {
        app.Logger.LogWarning(error, "Kıyafet analizi başarısız");
        return Results.Json(new { message = error.Message }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapPost("/api/outfits", async (OutfitRequest request, OpenAiWardrobeService ai, CancellationToken cancellationToken) =>
{
    if (request.Wardrobe.Count > 500)
        return Results.BadRequest(new { message = "Bir istekte en fazla 500 kıyafet gönderilebilir." });
    if (request.Wardrobe.Any(x => string.IsNullOrWhiteSpace(x.Id) || !Categories.All.Contains(x.Category)))
        return Results.BadRequest(new { message = "Her kıyafetin geçerli ID ve kategorisi olmalı." });
    if (request.Wardrobe.GroupBy(x => x.Id).Any(group => group.Count() > 1))
        return Results.BadRequest(new { message = "Kıyafet ID'leri benzersiz olmalı." });

    var missing = OutfitRules.MissingCategories(request.Wardrobe);
    if (missing.Count > 0)
        return Results.BadRequest(new { code = "missing_category", missingCategories = missing, message = "Kombin için her ana kategoriden en az bir parça gerekli." });

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
});

app.Run();

public partial class Program;

