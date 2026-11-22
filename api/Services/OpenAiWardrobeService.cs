using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OutfitCombination.Api.Models;

namespace OutfitCombination.Api.Services;

public sealed class OpenAiWardrobeService(
    HttpClient httpClient,
    IOptions<OpenAiOptions> options,
    ILogger<OpenAiWardrobeService> logger)
{
    private readonly OpenAiOptions _options = options.Value;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    // Drops null properties (e.g. reasoning for non-reasoning models); null array items such as
    // the "no extra" enum value are still written.
    private static readonly JsonSerializerOptions RequestJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };
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
                ? "You are a senior fashion merchandiser with a trained eye for fit, cut, color accuracy, fabric and silhouette. Analyze one clothing photo for a wardrobe app. Write all free text in English. If clothing is visible, always provide a short distinctive 2-5 word name — primary color + visible pattern + garment subtype (e.g. 'navy pinstripe oxford'). Use precise fashion vocabulary for subType (oxford shirt, chinos, trench, derby, fedora, aviator sunglasses, bomber, etc.). primaryColor and secondaryColors should use common fashion color names (ecru, oxblood, camel, charcoal, sage, cobalt). Pattern uses standard terms (plain, pinstripe, houndstooth, gingham, tweed, herringbone, floral). styleTags should come from this set when applicable: minimal, smart casual, classic, streetwear, workwear, sporty, formal, business casual, preppy, utility, relaxed, elegant. fit describes cut and volume: slim, regular, relaxed or oversized (empty if it cannot be judged). fabric is the visible material in 1-2 words (denim, cotton poplin, wool flannel, knit, leather, suede, linen, technical nylon). formality is a 1-5 score: 1 athleisure/very casual, 2 casual, 3 smart casual, 4 business, 5 formal. Do not guess brands. Leave unknown fields empty. detectedCategory must be one of top, bottom, shoes, hat, accessory, outerwear or an empty string. Use 'hat' for any headwear, 'accessory' for watches, jewelry, belts, scarves, sunglasses and bags, 'outerwear' for jackets, coats and overcoats."
                : "Kıyafet kesimi, rengi, kumaşı ve siluetini keskin gözle değerlendiren, modada uzun yıllara sahip bir moda satın alma uzmanısın. Bir gardırop uygulaması için tek bir kıyafet fotoğrafını incele. Serbest metinleri Türkçe yaz. Fotoğrafta kıyafet varsa 2-5 kelimelik kısa ve ayırt edici bir name üret — ana renk + belirgin desen + alt tür (örn. 'lacivert ince çizgili gömlek'). subType için moda terimleri kullan (oxford gömlek, chino, trençkot, derby, fötr, aviator güneş gözlüğü, bomber vb.). primaryColor ve secondaryColors için moda dünyasında kullanılan renk adlarını tercih et (ekru, bordo, deve tüyü, antrasit, adaçayı, kobalt, haki). Pattern için standart terimler (düz, ince çizgili, pied-de-poule, kareli, tweed, balıksırtı, çiçek). styleTags şu setten uygun olanları alsın: minimal, smart casual, klasik, sokak, workwear, spor, resmi, iş-günlük, preppy, utility, rahat, şık. fit kesim ve hacmi anlatır: dar, normal, rahat veya oversize (anlaşılmıyorsa boş). fabric görünen kumaşı 1-2 kelimeyle yazar (denim, pamuk poplin, yün flanel, triko, deri, süet, keten, teknik kumaş). formality 1-5 arası resmiyet puanıdır: 1 spor/çok rahat, 2 günlük, 3 smart casual, 4 iş, 5 resmi. Marka tahmini yapma. Bilinmeyen alanları boş bırak. detectedCategory yalnız top, bottom, shoes, hat, accessory, outerwear veya boş string olabilir. Başlık için 'hat'; saat, takı, kemer, atkı, güneş gözlüğü, çanta için 'accessory'; ceket, mont, palto için 'outerwear' kullan.",
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

        var json = await SendAsync(body, "analyze", _options.Model, cancellationToken);
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
        IReadOnlyCollection<OutfitSuggestion> alreadySuggested,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();
        var english = request.Language.Equals("en", StringComparison.OrdinalIgnoreCase);
        var catalog = OutfitPrompt.Build(request, alreadySuggested, english, DateTimeOffset.UtcNow);
        var effort = _options.OutfitReasoningEffort?.Trim();

        var body = new
        {
            model = OutfitModel,
            store = false,
            reasoning = string.IsNullOrWhiteSpace(effort) ? null : new { effort },
            instructions = english ? OutfitPrompt.InstructionsEn : OutfitPrompt.InstructionsTr,
            input = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "input_text", text = catalog.Prompt }
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
                    schema = catalog.Schema()
                }
            }
        };

        var json = await SendAsync(body, "outfit", OutfitModel, cancellationToken);
        var envelope = JsonSerializer.Deserialize<OutfitAiEnvelope>(json, JsonOptions)
            ?? throw new AiServiceException("AI boş kombin yanıtı döndürdü.");
        return envelope.Suggestions
            .Select(catalog.ToSuggestion)
            .OfType<OutfitSuggestion>()
            .ToList();
    }

    private string OutfitModel => string.IsNullOrWhiteSpace(_options.OutfitModel) ? _options.Model : _options.OutfitModel.Trim();

    /// <summary>
    /// One outfit where the <paramref name="shopCategories"/> pieces are bought new: the other pieces
    /// come from the wardrobe and real products are found with the web search tool.
    /// </summary>
    public async Task<ShoppingLook?> ShopAsync(OutfitRequest request, IReadOnlyCollection<string> shopCategories, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        var english = request.Language.Equals("en", StringComparison.OrdinalIgnoreCase);
        var catalog = OutfitPrompt.Build(request, [], english, DateTimeOffset.UtcNow, shopCategories);
        var effort = _options.OutfitReasoningEffort?.Trim();
        var tool = string.IsNullOrWhiteSpace(_options.ShoppingSearchTool) ? "web_search" : _options.ShoppingSearchTool.Trim();

        var body = new
        {
            model = OutfitModel,
            store = false,
            reasoning = string.IsNullOrWhiteSpace(effort) ? null : new { effort },
            tools = new object[]
            {
                new
                {
                    type = tool,
                    user_location = english ? null : new { type = "approximate", country = "TR" }
                }
            },
            instructions = english ? OutfitPrompt.ShoppingInstructionsEn : OutfitPrompt.ShoppingInstructionsTr,
            input = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new
                        {
                            type = "input_text",
                            text = $"{catalog.Prompt}\n\nSHOPPING CATEGORIES (one piece each): {string.Join("; ", shopCategories.Select(c => $"{c} = {OutfitPrompt.CategoryName(c)}"))}"
                        }
                    }
                }
            },
            text = new
            {
                format = new
                {
                    type = "json_schema",
                    name = "shopping_look",
                    strict = true,
                    schema = catalog.ShoppingSchema(shopCategories)
                }
            }
        };

        var responseJson = await SendRawAsync(body, "shopping", OutfitModel, cancellationToken);
        var ai = JsonSerializer.Deserialize<ShoppingAiLook>(ExtractOutputText(responseJson), JsonOptions)
            ?? throw new AiServiceException("AI boş alışveriş yanıtı döndürdü.");
        var look = catalog.ToShoppingLook(ai, shopCategories);
        if (look is null) return null;
        var cited = ShoppingProducts.CitedHosts(responseJson);
        foreach (var piece in look.Pieces)
        {
            piece.Products = ShoppingProducts.Filter(piece.Products, cited);
            piece.SearchLinks = ShoppingProducts.SearchLinks(
                string.IsNullOrWhiteSpace(piece.IdealItem.SearchQuery) ? piece.IdealItem.Name : piece.IdealItem.SearchQuery,
                english);
        }
        return look;
    }

    private async Task<string> SendAsync(object body, string operation, string model, CancellationToken cancellationToken) =>
        ExtractOutputText(await SendRawAsync(body, operation, model, cancellationToken));

    private async Task<string> SendRawAsync(object body, string operation, string model, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey());
        request.Content = new StringContent(JsonSerializer.Serialize(body, RequestJsonOptions), Encoding.UTF8, "application/json");

        var stopwatch = Stopwatch.StartNew();
        var statusCode = 0;
        var outcome = "ok";

        try
        {
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            statusCode = (int)response.StatusCode;
            var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                outcome = statusCode >= 500 ? "server_error" : "client_error";
                var detail = responseJson.Length > 600 ? responseJson[..600] : responseJson;
                throw new AiServiceException($"OpenAI API {statusCode}: {detail}");
            }
            return responseJson;
        }
        catch (AiServiceException)
        {
            if (outcome == "ok") outcome = "parse_error";
            throw;
        }
        catch (TaskCanceledException error)
        {
            outcome = "timeout";
            throw new AiServiceException("OpenAI servisine ulaşılamadı veya yanıt okunamadı.", error);
        }
        catch (Exception error) when (error is HttpRequestException or JsonException)
        {
            outcome = "transport_error";
            throw new AiServiceException("OpenAI servisine ulaşılamadı veya yanıt okunamadı.", error);
        }
        finally
        {
            stopwatch.Stop();
            logger.Log(
                outcome == "ok" ? LogLevel.Information : LogLevel.Warning,
                "ai.request operation={Operation} model={Model} durationMs={DurationMs} status={Status} outcome={Outcome}",
                operation,
                model,
                stopwatch.ElapsedMilliseconds,
                statusCode,
                outcome);
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
            fit = new { type = "string" },
            fabric = new { type = "string" },
            formality = new { type = "string", @enum = new[] { "1", "2", "3", "4", "5", "" } },
            detectedCategory = new { type = "string", @enum = new[] { "top", "bottom", "shoes", "hat", "accessory", "outerwear", "" } },
            categoryConflict = new { type = "boolean" }
        },
        required = new[] { "name", "subType", "primaryColor", "secondaryColors", "pattern", "styleTags", "seasons", "description", "fit", "fabric", "formality", "detectedCategory", "categoryConflict" }
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
}
