using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using OutfitCombination.Api.Models;

namespace OutfitCombination.Api.Services;

public sealed class OpenAiWardrobeService(HttpClient httpClient, IOptions<OpenAiOptions> options)
{
    private readonly OpenAiOptions _options = options.Value;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public int MaxAttempts => Math.Clamp(_options.MaxAttempts, 1, 3);

    public async Task<ClothingAnalysis> AnalyzeAsync(
        Stream image,
        string contentType,
        string selectedCategory,
        string language,
        CancellationToken cancellationToken)
    {
        using var memory = new MemoryStream();
        await image.CopyToAsync(memory, cancellationToken);
        var imageBytes = memory.ToArray();
        if (!ImageUploadValidator.MatchesContentType(imageBytes, contentType))
            throw new InvalidImageException("Dosya içeriği bildirilen görsel türüyle eşleşmiyor.");
        EnsureConfigured();
        var dataUrl = $"data:{contentType};base64,{Convert.ToBase64String(imageBytes)}";

        var body = new
        {
            model = _options.Model,
            store = false,
            instructions = language == "en"
                ? "Analyze one clothing photo for a wardrobe app. Write all free text in English. If clothing is visible, always provide a short distinctive 2-5 word name, preferably primary color + visible pattern + subtype. Do not guess brands. Leave unknown fields empty. detectedCategory must be top, bottom, shoes, or an empty string."
                : "Bir gardırop uygulaması için tek bir kıyafet fotoğrafını incele. Tüm serbest metinleri Türkçe yaz. Fotoğrafta kıyafet varsa 2-5 kelimelik kısa ve ayırt edici bir name üret; mümkünse ana renk + belirgin desen + alt tür sırasını kullan. Marka tahmini yapma. Bilinmeyen alanları boş bırak. detectedCategory yalnız top, bottom, shoes veya boş string olabilir.",
            input = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "input_text", text = language == "en" ? $"Selected category: {selectedCategory}. Analyze the clothing." : $"Kullanıcının seçtiği kategori: {selectedCategory}. Kıyafeti analiz et." },
                        new { type = "input_image", image_url = dataUrl, detail = "high" }
                    }
                }
            },
            text = new
            {
                format = new
                {
                    type = "json_schema",
                    name = "clothing_analysis",
                    strict = true,
                    schema = AnalysisSchema(language)
                }
            }
        };

        var json = await SendAsync(body, cancellationToken);
        var result = JsonSerializer.Deserialize<ClothingAnalysis>(json, JsonOptions)
            ?? throw new AiServiceException("AI boş analiz döndürdü.");
        result.Name = EnsureShortName(result, selectedCategory, language);
        result.DetectedCategory = string.IsNullOrWhiteSpace(result.DetectedCategory) ? null : result.DetectedCategory;
        result.CategoryConflict = result.DetectedCategory is not null &&
            !result.DetectedCategory.Equals(selectedCategory, StringComparison.OrdinalIgnoreCase);
        return result;
    }

    public async Task<IReadOnlyList<OutfitSuggestion>> SuggestAsync(
        OutfitRequest request,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();
        var safeInput = new
        {
            preferences = request.Preferences,
            wardrobe = request.Wardrobe.Select(x => new
            {
                x.Id,
                x.Category,
                x.Name,
                x.SubType,
                x.PrimaryColor,
                x.SecondaryColors,
                x.Pattern,
                x.StyleTags,
                x.Seasons,
                x.Description
            })
        };

        var body = new
        {
            model = _options.Model,
            store = false,
            instructions = request.Language.Equals("en", StringComparison.OrdinalIgnoreCase)
                ? "You are a personal style assistant. Use only the supplied clothing IDs. Every suggestion must contain exactly one top, one bottom, and one shoes item. Never repeat a triple. Write title and reason in English. reason must be one concrete sentence about the selected colors, patterns, or style. Prefer three visually distinct suggestions when possible."
                : "Türkçe bir kişisel stil asistanısın. Yalnızca verilen kıyafet ID'lerini kullan. Her öneride tam olarak bir top, bir bottom ve bir shoes seç. Aynı üçlüyü tekrarlama. title ve reason Türkçe olsun. reason tek cümlede seçilen parçaların renk, desen veya tarzına somut biçimde değinsin. Mümkünse görsel olarak farklı üç öneri üret.",
            input = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "input_text", text = JsonSerializer.Serialize(safeInput, JsonOptions) }
                    }
                }
            },
            text = new
            {
                format = new
                {
                    type = "json_schema",
                    name = "outfit_suggestions",
                    strict = true,
                    schema = OutfitSchema()
                }
            }
        };

        var json = await SendAsync(body, cancellationToken);
        var envelope = JsonSerializer.Deserialize<OutfitAiEnvelope>(json, JsonOptions)
            ?? throw new AiServiceException("AI boş kombin yanıtı döndürdü.");
        return envelope.Suggestions;
    }

    private async Task<string> SendAsync(object body, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey());
        request.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");

        try
        {
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var detail = responseJson.Length > 600 ? responseJson[..600] : responseJson;
                throw new AiServiceException($"OpenAI API {(int)response.StatusCode}: {detail}");
            }
            return ExtractOutputText(responseJson);
        }
        catch (AiServiceException)
        {
            throw;
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException)
        {
            throw new AiServiceException("OpenAI servisine ulaşılamadı veya yanıt okunamadı.", error);
        }
    }

    private static string ExtractOutputText(string responseJson)
    {
        using var document = JsonDocument.Parse(responseJson);
        if (!document.RootElement.TryGetProperty("output", out var output))
            throw new AiServiceException("OpenAI yanıtında output alanı yok.");

        foreach (var item in output.EnumerateArray())
        {
            if (!item.TryGetProperty("type", out var type) || type.GetString() != "message" ||
                !item.TryGetProperty("content", out var content)) continue;
            foreach (var part in content.EnumerateArray())
            {
                if (part.TryGetProperty("type", out var partType) && partType.GetString() == "output_text" &&
                    part.TryGetProperty("text", out var text)) return text.GetString() ?? "";
            }
        }
        throw new AiServiceException("OpenAI yanıtında yapılandırılmış metin bulunamadı.");
    }

    private string ApiKey() => !string.IsNullOrWhiteSpace(_options.ApiKey)
        ? _options.ApiKey
        : Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? "";

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(ApiKey()))
            throw new AiServiceException("OPENAI_API_KEY veya OpenAI__ApiKey ayarlanmamış.");
        if (string.IsNullOrWhiteSpace(_options.Model))
            throw new AiServiceException("OpenAI__Model ayarlanmamış.");
    }

    private static object AnalysisSchema(string language) => new
    {
        type = "object",
        additionalProperties = false,
        properties = new
        {
            name = new
            {
                type = "string",
                description = language == "en"
                    ? "A non-empty 2-5 word English short name when clothing is visible. Example: Navy striped shirt."
                    : "Fotoğrafta kıyafet varsa boş olmayan, 2-5 kelimelik Türkçe kısa ad. Örnek: Lacivert çizgili gömlek."
            },
            subType = new { type = "string" },
            primaryColor = new { type = "string" },
            secondaryColors = new { type = "array", items = new { type = "string" } },
            pattern = new { type = "string" },
            styleTags = new { type = "array", items = new { type = "string" } },
            seasons = new { type = "array", items = new { type = "string" } },
            description = new { type = "string" },
            detectedCategory = new { type = "string", @enum = new[] { "top", "bottom", "shoes", "" } },
            categoryConflict = new { type = "boolean" }
        },
        required = new[] { "name", "subType", "primaryColor", "secondaryColors", "pattern", "styleTags", "seasons", "description", "detectedCategory", "categoryConflict" }
    };

    internal static string EnsureShortName(ClothingAnalysis analysis, string selectedCategory, string language = "tr")
    {
        var supplied = LimitWords(analysis.Name, 5);
        if (!string.IsNullOrWhiteSpace(supplied)) return supplied;

        var parts = new List<string>();
        AddDistinct(parts, analysis.PrimaryColor);
        if (!analysis.Pattern.Equals("düz", StringComparison.OrdinalIgnoreCase) &&
            !analysis.Pattern.Equals("desensiz", StringComparison.OrdinalIgnoreCase))
            AddDistinct(parts, analysis.Pattern);
        AddDistinct(parts, analysis.SubType);

        if (parts.Count == 0)
        {
            parts.Add(language == "en" ? selectedCategory switch
            {
                Categories.Top => "Top",
                Categories.Bottom => "Bottom",
                Categories.Shoes => "Shoes",
                _ => "Clothing"
            } : selectedCategory switch
            {
                Categories.Top => "Üst parça",
                Categories.Bottom => "Alt parça",
                Categories.Shoes => "Ayakkabı",
                _ => "Kıyafet"
            });
        }

        return LimitWords(string.Join(' ', parts), 5);
    }

    private static void AddDistinct(List<string> values, string value)
    {
        var cleaned = string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (!string.IsNullOrWhiteSpace(cleaned) &&
            !values.Any(existing => existing.Equals(cleaned, StringComparison.OrdinalIgnoreCase)))
            values.Add(cleaned);
    }

    private static string LimitWords(string value, int limit)
    {
        var words = value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (words.Length <= limit) return string.Join(' ', words);
        return string.Join(' ', words.Take(limit - 1).Append(words[^1]));
    }

    private static object OutfitSchema() => new
    {
        type = "object",
        additionalProperties = false,
        properties = new
        {
            suggestions = new
            {
                type = "array",
                minItems = 0,
                maxItems = 5,
                items = new
                {
                    type = "object",
                    additionalProperties = false,
                    properties = new
                    {
                        title = new { type = "string" },
                        topId = new { type = "string" },
                        bottomId = new { type = "string" },
                        shoeId = new { type = "string" },
                        reason = new { type = "string" }
                    },
                    required = new[] { "title", "topId", "bottomId", "shoeId", "reason" }
                }
            }
        },
        required = new[] { "suggestions" }
    };
}

