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
                ? "You are a senior fashion merchandiser with a trained eye for fit, cut, color accuracy, fabric and silhouette. Analyze one clothing photo for a wardrobe app. Write all free text in English. If clothing is visible, always provide a short distinctive 2-5 word name — primary color + visible pattern + garment subtype (e.g. 'navy pinstripe oxford'). Use precise fashion vocabulary for subType (oxford shirt, chinos, trench, derby, fedora, aviator sunglasses, bomber, etc.). primaryColor and secondaryColors should use common fashion color names (ecru, oxblood, camel, charcoal, sage, cobalt). Pattern uses standard terms (plain, pinstripe, houndstooth, gingham, tweed, herringbone, floral). styleTags should come from this set when applicable: minimal, smart casual, classic, streetwear, workwear, sporty, formal, business casual, preppy, utility, relaxed, elegant. Do not guess brands. Leave unknown fields empty. detectedCategory must be one of top, bottom, shoes, hat, accessory, outerwear or an empty string. Use 'hat' for any headwear, 'accessory' for watches, jewelry, belts, scarves, sunglasses and bags, 'outerwear' for jackets, coats and overcoats."
                : "Kıyafet kesimi, rengi, kumaşı ve siluetini keskin gözle değerlendiren, modada uzun yıllara sahip bir moda satın alma uzmanısın. Bir gardırop uygulaması için tek bir kıyafet fotoğrafını incele. Serbest metinleri Türkçe yaz. Fotoğrafta kıyafet varsa 2-5 kelimelik kısa ve ayırt edici bir name üret — ana renk + belirgin desen + alt tür (örn. 'lacivert ince çizgili gömlek'). subType için moda terimleri kullan (oxford gömlek, chino, trençkot, derby, fötr, aviator güneş gözlüğü, bomber vb.). primaryColor ve secondaryColors için moda dünyasında kullanılan renk adlarını tercih et (ekru, bordo, deve tüyü, antrasit, adaçayı, kobalt, haki). Pattern için standart terimler (düz, ince çizgili, pied-de-poule, kareli, tweed, balıksırtı, çiçek). styleTags şu setten uygun olanları alsın: minimal, smart casual, klasik, sokak, workwear, spor, resmi, iş-günlük, preppy, utility, rahat, şık. Marka tahmini yapma. Bilinmeyen alanları boş bırak. detectedCategory yalnız top, bottom, shoes, hat, accessory, outerwear veya boş string olabilir. Başlık için 'hat'; saat, takı, kemer, atkı, güneş gözlüğü, çanta için 'accessory'; ceket, mont, palto için 'outerwear' kullan.",
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

        var json = await SendAsync(body, "analyze", cancellationToken);
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
            extras = request.Extras,
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
                ? "You are a senior editorial stylist with a decade of experience shaping looks for Vogue Business, GQ and The Sartorialist. You build real outfits a stranger could wear on the street, not costumes. Use ONLY the supplied clothing IDs. Every suggestion must have exactly one top, one bottom and one shoes. hatId, accessoryId and outerwearId are OPTIONAL — add them only when the wardrobe has that category and the piece genuinely elevates the look. Respect extras hints: 'include' → try hard to add it when available, 'exclude' → never, 'auto' → your call.\n\nBuild each outfit on these style principles:\n1. COLOR HARMONY — follow a clear scheme per outfit: monochrome, neutral-plus-accent, analogous, or a controlled 60/30/10 split. Avoid muddy clashes. Honor the user's tone preference.\n2. PROPORTION & SILHOUETTE — balance volumes (loose top ↔ tailored bottom, or vice versa); do not stack two voluminous layers unintentionally.\n3. OCCASION FIT — match destination and look preferences faithfully (office = tailored, smart-casual = polished-relaxed, dinner = elevated, daily = comfort-first).\n4. PATTERN & TEXTURE — mix at most two patterns; pair silky or technical with something structured to avoid flatness.\n5. SEASON LOGIC — honor seasons on each piece; no summer linens in a winter destination.\n6. ACCESSORY RESTRAINT — one accessory that anchors, not three competing pieces.\n\nNever repeat a triple. Title should be short and evocative (2-4 words). reason must be ONE concrete sentence that names the specific style principle used (e.g. 'Analogous navy palette with textured contrast.'). Prefer three visually distinct suggestions."
                : "On yılı aşkın tecrübeyle Vogue, GQ ve Les Essentiels gibi moda yayınlarına stillendirme yapan kıdemli bir moda editörüsün. Kostüm değil, sokakta giyilebilecek gerçek kombinler kurgularsın. YALNIZ verilen kıyafet ID'lerini kullan. Her öneride tam olarak bir top, bir bottom, bir shoes bulunmalı. hatId, accessoryId ve outerwearId OPSİYONELDİR — yalnız ilgili kategori dolapta varsa ve parça kombini gerçekten güçlendiriyorsa doldur. extras ipuçlarına uy: 'include' → varsa mutlaka ekle, 'exclude' → asla ekleme, 'auto' → sen karar ver.\n\nHer kombini şu prensiplere göre kur:\n1. RENK UYUMU — her kombinde net bir şema izle: monokrom, nötr + tek aksan, analog veya 60/30/10 dengesi. Çamurlu çatışmalardan kaç. Kullanıcının ton tercihini koru.\n2. ORANTI VE SİLUET — hacimleri dengele (bol üst ↔ dar alt ya da tersi); farkında olmadan iki bol katman üst üste koyma.\n3. ORTAMA UYGUNLUK — ortam ve görünüm tercihine sadık kal (ofis = tailored, smart casual = polished-rahat, akşam yemeği = yukarı çek, günlük = konfor önce).\n4. DESEN VE DOKU — en fazla iki desen karıştır; ipeksi/teknik parçaları yapılı bir parçayla eşle, düzlük hissi olmasın.\n5. SEZON MANTIĞI — her parçanın sezonuna saygı göster; kışa yaz keteni koyma.\n6. AKSESUAR EKONOMİSİ — kombini dengeleyen tek bir aksesuar yeter, üç parça birbiriyle yarışmasın.\n\nAynı üçlüyü tekrarlama. title kısa ve etkili olsun (2-4 kelime). reason TEK somut cümle olmalı ve kullanılan stil prensibini açıkça belirtsin (örn. 'Analog lacivert paleti, yapılı doku kontrastıyla.'). Mümkünse görsel olarak farklı üç öneri üret.",
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

        var json = await SendAsync(body, "outfit", cancellationToken);
        var envelope = JsonSerializer.Deserialize<OutfitAiEnvelope>(json, JsonOptions)
            ?? throw new AiServiceException("AI boş kombin yanıtı döndürdü.");
        return envelope.Suggestions;
    }

    private async Task<string> SendAsync(object body, string operation, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey());
        request.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");

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
            return ExtractOutputText(responseJson);
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
                _options.Model,
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
            detectedCategory = new { type = "string", @enum = new[] { "top", "bottom", "shoes", "hat", "accessory", "outerwear", "" } },
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
                        hatId = new { type = new[] { "string", "null" } },
                        accessoryId = new { type = new[] { "string", "null" } },
                        outerwearId = new { type = new[] { "string", "null" } },
                        reason = new { type = "string" }
                    },
                    required = new[] { "title", "topId", "bottomId", "shoeId", "hatId", "accessoryId", "outerwearId", "reason" }
                }
            }
        },
        required = new[] { "suggestions" }
    };
}

