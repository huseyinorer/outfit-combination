using OutfitCombination.Api.Models;
using OutfitCombination.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace OutfitCombination.Api.Tests;

public static class TestRunner
{
    public static int Main()
    {
        var tests = new (string Name, Action Run)[]
        {
            ("Boş kategori", EmptyCategory),
            ("Tek mümkün kombin", SingleCombination),
            ("Üç farklı kombin", ThreeCombinations),
            ("Yanlış AI ID", InvalidAiId),
            ("AI kısa kıyafet adı", ShortClothingName),
            ("Kurulum belirteci doğrulama", InstallationTokenRoundTrip),
            ("Kurulum belirteci kurcalama", InstallationTokenTampering),
            ("Kurulum belirteci süre sonu", InstallationTokenExpiry),
            ("Kullanıcı oturumu doğrulama", UserTokenRoundTrip),
            ("Kurulum ve kullanıcı belirteci ayrımı", TokenTypeSeparation),
            ("Eksiksiz hesap yapılandırması", CompleteAccountConfiguration),
            ("Yarım hesap yapılandırması reddi", PartialAccountConfiguration),
            ("E-posta giriş yapılandırması", EmailAccountConfiguration),
            ("E-posta normalleştirme", EmailNormalization),
            ("Google OAuth isteğinde state korunur", GoogleAuthorizationUrl),
            ("Başarısız AI isteği kullanım hakkını iade eder", QuotaRefund),
            ("Hesap ve cihaz kotası birlikte uygulanır", DualSubjectQuota),
            ("Görsel imza doğrulama", ImageSignatureValidation),
            ("Büyük kombin girdisi reddi", OversizedOutfitInput),
            ("Mobil sürüm dosyası", MobileVersionFile),
            ("Kombin istemi kısa kodlar ve enum şeması", OutfitPromptAliases),
            ("Ceket üstüne ikinci mont eklenmez", NoDoubleOuterwear),
            ("Sıcak havada otomatik mont eklenmez", NoAutoOuterwearWhenWarm),
            ("Sabit parça her kombinde bulunur", AnchorIsAlwaysIncluded),
            ("Not ve beğenmeme sebebi isteme girer", NoteAndDislikeInPrompt),
            ("Alışveriş kombini şeması ve eşleme", ShoppingSchemaAndMapping),
            ("Alışveriş ürün süzgeci", ShoppingProductFilter),
            ("Ürün görseli önizlemesi", ProductPreviewParsing)
        };
        try
        {
            foreach (var test in tests)
            {
                test.Run();
                Console.WriteLine($"PASS: {test.Name}");
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"FAIL: {error.Message}");
            return 1;
        }
    }

    private static void EmptyCategory()
    {
        var request = Request(Item("t1", Categories.Top), Item("b1", Categories.Bottom));
        Equal(Categories.Shoes, OutfitRules.MissingCategories(request.Wardrobe).Single());
    }

    private static void SingleCombination()
    {
        var request = Request(Item("t1", Categories.Top), Item("b1", Categories.Bottom), Item("s1", Categories.Shoes));
        Equal(1, OutfitRules.Complete(request, []).Count);
    }

    private static void ThreeCombinations()
    {
        var request = Request(
            Item("t1", Categories.Top), Item("t2", Categories.Top), Item("t3", Categories.Top),
            Item("b1", Categories.Bottom), Item("b2", Categories.Bottom),
            Item("s1", Categories.Shoes), Item("s2", Categories.Shoes));
        var result = OutfitRules.Complete(request, []);
        Equal(3, result.Count);
        Equal(3, result.Select(x => $"{x.TopId}|{x.BottomId}|{x.ShoeId}").Distinct().Count());
    }

    private static void InvalidAiId()
    {
        var request = Request(
            Item("t1", Categories.Top), Item("t2", Categories.Top),
            Item("b1", Categories.Bottom),
            Item("s1", Categories.Shoes), Item("s2", Categories.Shoes));
        var invalid = new[]
        {
            new OutfitSuggestion { Title = "Hatalı", TopId = "yok", BottomId = "b1", ShoeId = "s1", Reason = "Hatalı." },
            new OutfitSuggestion { Title = "Kategori", TopId = "b1", BottomId = "t1", ShoeId = "s1", Reason = "Hatalı." }
        };
        Equal(0, OutfitRules.ValidateAi(request.Wardrobe, invalid).Count);
        Equal(3, OutfitRules.Complete(request, invalid).Count);
    }

    private static void MobileVersionFile()
    {
        var version = new MobileVersionService().LatestVersion;
        if (!System.Text.RegularExpressions.Regex.IsMatch(version, @"^\d+\.\d+\.\d+$"))
            throw new Exception($"Beklenen semver biçimi, gelen {version}");
    }

    private static void ShortClothingName()
    {
        var generated = OpenAiWardrobeService.EnsureShortName(new ClothingAnalysis
        {
            Name = "Lacivert ince çizgili pamuklu uzun kollu gömlek"
        }, Categories.Top);
        Equal("Lacivert ince çizgili pamuklu gömlek", generated);

        var fallback = OpenAiWardrobeService.EnsureShortName(new ClothingAnalysis
        {
            PrimaryColor = "Lacivert",
            Pattern = "ince çizgili",
            SubType = "gömlek"
        }, Categories.Top);
        Equal("Lacivert ince çizgili gömlek", fallback);
    }

    private static void InstallationTokenRoundTrip()
    {
        var service = TokenService(new DateTimeOffset(2026, 11, 7, 10, 0, 0, TimeSpan.Zero));
        var id = Guid.NewGuid().ToString();
        var issued = service.Issue(id);
        Equal(true, service.TryValidate(issued.AccessToken, out var validatedId));
        Equal(id, validatedId);
    }

    private static void InstallationTokenTampering()
    {
        var service = TokenService(new DateTimeOffset(2026, 11, 7, 10, 0, 0, TimeSpan.Zero));
        var token = service.Issue(Guid.NewGuid().ToString()).AccessToken;
        var tampered = token[..^1] + (token[^1] == 'A' ? 'B' : 'A');
        Equal(false, service.TryValidate(tampered, out _));
    }

    private static void InstallationTokenExpiry()
    {
        var clock = new ManualTimeProvider(new DateTimeOffset(2026, 11, 7, 10, 0, 0, TimeSpan.Zero));
        var service = TokenService(clock);
        var token = service.Issue(Guid.NewGuid().ToString()).AccessToken;
        clock.UtcNow = clock.UtcNow.AddDays(31);
        Equal(false, service.TryValidate(token, out _));
    }

    private static void UserTokenRoundTrip()
    {
        var service = TokenService(new DateTimeOffset(2026, 11, 7, 10, 0, 0, TimeSpan.Zero));
        var userId = Guid.NewGuid();
        var installationId = Guid.NewGuid().ToString();
        var token = service.IssueUser(userId, installationId).AccessToken;
        Equal(true, service.TryValidateUser(token, out var validatedUserId, out var validatedInstallationId));
        Equal(userId, validatedUserId);
        Equal(installationId, validatedInstallationId);
    }

    private static void TokenTypeSeparation()
    {
        var service = TokenService(new DateTimeOffset(2026, 11, 7, 10, 0, 0, TimeSpan.Zero));
        var installationId = Guid.NewGuid().ToString();
        var installationToken = service.Issue(installationId).AccessToken;
        var userToken = service.IssueUser(Guid.NewGuid(), installationId).AccessToken;
        Equal(false, service.TryValidateUser(installationToken, out _, out _));
        Equal(false, service.TryValidate(userToken, out _));
    }

    private static void CompleteAccountConfiguration()
    {
        var options = new AccountAuthOptions
        {
            GoogleClientId = "client.apps.googleusercontent.com",
            GoogleClientSecret = "secret",
            CallbackUrl = "https://example.com/api/account/google/callback"
        };
        Equal(true, options.Enabled);
        Equal(false, options.PartiallyConfigured);
    }

    private static void PartialAccountConfiguration()
    {
        var options = new AccountAuthOptions { GoogleClientId = "client.apps.googleusercontent.com" };
        Equal(false, options.Enabled);
        Equal(true, options.PartiallyConfigured);
    }

    private static void EmailAccountConfiguration()
    {
        var options = new EmailAuthOptions
        {
            ApiKey = "test-key",
            FromAddress = "login@example.com"
        };
        Equal(true, options.Enabled);
        Equal(false, options.PartiallyConfigured);
        options.FromAddress = string.Empty;
        Equal(false, options.Enabled);
        Equal(true, options.PartiallyConfigured);
    }

    private static void EmailNormalization()
    {
        Equal("person@example.com", AccountStore.NormalizeEmail(" Person@Example.COM "));
        Equal<string?>(null, AccountStore.NormalizeEmail("not-an-email"));
    }

    private static void GoogleAuthorizationUrl()
    {
        var service = new GoogleOAuthService(
            new HttpClient(),
            Options.Create(new AccountAuthOptions
            {
                GoogleClientId = "client.apps.googleusercontent.com",
                GoogleClientSecret = "secret",
                CallbackUrl = "https://example.com/api/account/google/callback"
            }));
        var url = service.BuildAuthorizationUrl("anti-forgery-state");
        Equal(true, url.StartsWith("https://accounts.google.com/o/oauth2/v2/auth?", StringComparison.Ordinal));
        Equal(true, url.Contains("state=anti-forgery-state", StringComparison.Ordinal));
        Equal(true, url.Contains("response_type=code", StringComparison.Ordinal));
    }

    private static void QuotaRefund()
    {
        var service = new PersistentUsageQuotaService(
            Options.Create(new UsageQuotaOptions
            {
                DailyAnalysisLimit = 1,
                MonthlyAnalysisLimit = 1,
                DailyOutfitLimit = 1,
                MonthlyOutfitLimit = 1
            }),
            new TestHostEnvironment(),
            NullLogger<PersistentUsageQuotaService>.Instance);
        var subject = Guid.NewGuid().ToString();
        Equal(QuotaStatus.Allowed, service.TryConsumeAsync(subject, AiOperation.Analysis, CancellationToken.None).GetAwaiter().GetResult().Status);
        Equal(QuotaStatus.Exceeded, service.TryConsumeAsync(subject, AiOperation.Analysis, CancellationToken.None).GetAwaiter().GetResult().Status);
        service.RefundAsync(subject, AiOperation.Analysis, CancellationToken.None).GetAwaiter().GetResult();
        Equal(QuotaStatus.Allowed, service.TryConsumeAsync(subject, AiOperation.Analysis, CancellationToken.None).GetAwaiter().GetResult().Status);
        service.DisposeAsync().AsTask().GetAwaiter().GetResult();
    }

    private static void DualSubjectQuota()
    {
        var service = new PersistentUsageQuotaService(
            Options.Create(new UsageQuotaOptions
            {
                DailyAnalysisLimit = 2,
                MonthlyAnalysisLimit = 2,
                DailyOutfitLimit = 2,
                MonthlyOutfitLimit = 2
            }),
            new TestHostEnvironment(),
            NullLogger<PersistentUsageQuotaService>.Instance);
        var installation = Guid.NewGuid().ToString();
        var firstAccount = Guid.NewGuid().ToString();
        var secondAccount = Guid.NewGuid().ToString();

        Equal(QuotaStatus.Allowed, service.TryConsumeAsync(firstAccount, installation, AiOperation.Analysis, CancellationToken.None).GetAwaiter().GetResult().Status);
        Equal(QuotaStatus.Allowed, service.TryConsumeAsync(secondAccount, installation, AiOperation.Analysis, CancellationToken.None).GetAwaiter().GetResult().Status);
        Equal(QuotaStatus.Exceeded, service.TryConsumeAsync(Guid.NewGuid().ToString(), installation, AiOperation.Analysis, CancellationToken.None).GetAwaiter().GetResult().Status);

        var effective = service.GetSnapshotAsync(secondAccount, installation, CancellationToken.None).GetAwaiter().GetResult();
        Equal(2, effective?.DailyAnalysisUsed ?? -1);
        service.DisposeAsync().AsTask().GetAwaiter().GetResult();
    }

    private static void ImageSignatureValidation()
    {
        Equal(true, ImageUploadValidator.MatchesContentType([0xFF, 0xD8, 0xFF, 0xE0], "image/jpeg"));
        Equal(false, ImageUploadValidator.MatchesContentType("not an image"u8, "image/jpeg"));
        Equal(true, ImageUploadValidator.MatchesContentType([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image/png"));
    }

    private static void OversizedOutfitInput()
    {
        var request = Request(Item("t1", Categories.Top));
        request.Wardrobe[0].Description = new string('x', 501);
        Equal(true, OutfitRules.HasOversizedInput(request));
        request.Wardrobe[0].Description = "kısa";
        Equal(false, OutfitRules.HasOversizedInput(request));
    }

    private static void OutfitPromptAliases()
    {
        var request = Request(
            Item("top-guid", Categories.Top), Item("bottom-guid", Categories.Bottom),
            Item("shoe-guid", Categories.Shoes), Item("coat-guid", Categories.Outerwear));
        request.Avoid = [new OutfitKey { TopId = "top-guid", BottomId = "bottom-guid", ShoeId = "shoe-guid" }];
        var catalog = OutfitPrompt.Build(request, [], false, new DateTimeOffset(2026, 1, 10, 0, 0, 0, TimeSpan.Zero));
        Equal(true, catalog.Prompt.Contains("T1: top-guid"));
        Equal(false, catalog.Prompt.Contains("DO NOT REPEAT")); // the only possible outfit stays allowed
        var schema = System.Text.Json.JsonSerializer.Serialize(catalog.Schema());
        Equal(true, schema.Contains("\"enum\":[\"T1\"]"));
        Equal(true, schema.Contains("\"enum\":[\"O1\",null]"));
        var mapped = catalog.ToSuggestion(new OutfitAiSuggestion { TopId = "T1", BottomId = "B1", ShoeId = "S1", OuterwearId = "O1", Title = "x", Reason = "y" });
        Equal("top-guid", mapped?.TopId);
        Equal("coat-guid", mapped?.OuterwearId);
        Equal(null, catalog.ToSuggestion(new OutfitAiSuggestion { TopId = "T9", BottomId = "B1", ShoeId = "S1" }));
    }

    private static void NoDoubleOuterwear()
    {
        var jacket = Item("t1", Categories.Top);
        jacket.SubType = "blazer ceket";
        var request = Request(jacket, Item("b1", Categories.Bottom), Item("s1", Categories.Shoes), Item("o1", Categories.Outerwear));
        request.Context = new OutfitContext { TemperatureC = 3, Season = "winter" };
        var ai = new[] { new OutfitSuggestion { TopId = "t1", BottomId = "b1", ShoeId = "s1", OuterwearId = "o1", Title = "x", Reason = "y" } };
        Equal(null, OutfitRules.ValidateAi(request.Wardrobe, ai).Single().OuterwearId);
        Equal(null, OutfitRules.Complete(request, []).Single().OuterwearId);
    }

    private static void NoAutoOuterwearWhenWarm()
    {
        var request = Request(Item("t1", Categories.Top), Item("b1", Categories.Bottom), Item("s1", Categories.Shoes), Item("o1", Categories.Outerwear));
        request.Context = new OutfitContext { TemperatureC = 28, Season = "summer" };
        Equal(null, OutfitRules.Complete(request, []).Single().OuterwearId);
        request.Context = new OutfitContext { TemperatureC = 5, Season = "winter" };
        Equal("o1", OutfitRules.Complete(request, []).Single().OuterwearId);
    }

    private static void AnchorIsAlwaysIncluded()
    {
        var request = Request(
            Item("t1", Categories.Top), Item("t2", Categories.Top), Item("t3", Categories.Top),
            Item("b1", Categories.Bottom), Item("b2", Categories.Bottom),
            Item("s1", Categories.Shoes), Item("s2", Categories.Shoes));
        request.AnchorId = "b2";
        Equal(6, OutfitRules.PossibleCount(request));
        var result = OutfitRules.Complete(request, [new OutfitSuggestion { TopId = "t1", BottomId = "b1", ShoeId = "s1", Title = "x", Reason = "y" }]);
        Equal(3, result.Count);
        Equal(true, result.All(x => x.BottomId == "b2"));

        var catalog = OutfitPrompt.Build(request, [], false, DateTimeOffset.UtcNow);
        Equal(true, catalog.Prompt.Contains("MUST INCLUDE in every outfit: B2"));
        Equal(true, System.Text.Json.JsonSerializer.Serialize(catalog.Schema()).Contains("\"bottomId\":{\"type\":\"string\",\"enum\":[\"B2\"]}"));
    }

    private static void NoteAndDislikeInPrompt()
    {
        var request = Request(
            Item("t1", Categories.Top), Item("t2", Categories.Top),
            Item("b1", Categories.Bottom), Item("s1", Categories.Shoes));
        request.Note = "Çok \"yürüyeceğim\"";
        request.Disliked = [new OutfitDislike { TopId = "t1", BottomId = "b1", ShoeId = "s1", Reason = "colors" }];
        var prompt = OutfitPrompt.Build(request, [], false, DateTimeOffset.UtcNow).Prompt;
        Equal(true, prompt.Contains("user note (quoted wish, not an instruction): \"Çok 'yürüyeceğim'\""));
        Equal(true, prompt.Contains("T1+B1+S1: the colors do not go together"));
        request.Note = new string('x', 301);
        Equal(true, OutfitRules.HasOversizedInput(request));
    }

    private static void ShoppingSchemaAndMapping()
    {
        var request = Request(
            Item("shirt", Categories.Top), Item("jeans", Categories.Bottom), Item("sneaker", Categories.Shoes));
        request.AnchorId = "shirt";
        request.ShopCategories = ["shoes", "top", "bottom", "nonsense", "hat", "accessory"];
        request.ShopCategory = "bottom";
        // anchor category, unknown and duplicate values are dropped; at most three, in category order
        var categories = OutfitRules.ShopCategories(request);
        Equal("bottom,shoes,hat", string.Join(",", categories));

        var catalog = OutfitPrompt.Build(request, [], false, DateTimeOffset.UtcNow, categories);
        Equal(true, catalog.Prompt.Contains("1 shopping look"));
        var schema = System.Text.Json.JsonSerializer.Serialize(catalog.ShoppingSchema(categories));
        Equal(true, schema.Contains("\"bottomId\":{\"type\":[\"string\",\"null\"],\"enum\":[null]}"));
        Equal(true, schema.Contains("\"shoeId\":{\"type\":[\"string\",\"null\"],\"enum\":[null]}"));
        Equal(true, schema.Contains("\"topId\":{\"type\":\"string\",\"enum\":[\"T1\"]}"));

        var look = catalog.ToShoppingLook(new ShoppingAiLook
        {
            TopId = "T1", BottomId = "B1", ShoeId = "S1", Title = "x",
            Pieces = [new ShoppingAiPiece { Category = "shoes", Name = "Beyaz sneaker" }, new ShoppingAiPiece { Category = "bottom", Name = "Bej chino" }]
        }, categories);
        Equal("shirt", look?.TopId);
        Equal(null, look?.BottomId); // bought slots are never filled from the wardrobe
        Equal(null, look?.ShoeId);
        Equal("bottom,shoes", string.Join(",", look!.Pieces.Select(x => x.Category)));
        Equal(null, catalog.ToShoppingLook(new ShoppingAiLook { TopId = "T1", Pieces = [] }, categories));
    }

    private static void ShoppingProductFilter()
    {
        var cited = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "example-shop.com" };
        var products = ShoppingProducts.Filter(
        [
            new ShoppingProduct { Name = "Chino", Url = "https://www.example-shop.com/p/1" },
            new ShoppingProduct { Name = "Trendyol chino", Url = "https://www.trendyol.com/x-p-2" },
            new ShoppingProduct { Name = "Uydurma", Url = "https://fake-store.biz/p/3" },
            new ShoppingProduct { Name = "Http", Url = "http://www.trendyol.com/x" }
        ], cited);
        Equal(2, products.Count);
        Equal("example-shop.com", products[0].Store);
        var links = ShoppingProducts.SearchLinks("bej chino", false);
        Equal("https://www.trendyol.com/sr?q=bej%20chino", links[0].Url);
        Equal(1, ShoppingProducts.SearchLinks("beige chinos", true).Count);
    }

    private static void ProductPreviewParsing()
    {
        var page = new Uri("https://www.example-shop.com/urun/1");
        Equal("https://cdn.example-shop.com/a.jpg?w=1&h=2",
            ProductPreviewService.ExtractImage("<meta content='https://cdn.example-shop.com/a.jpg?w=1&amp;h=2' property='og:image'>", page));
        Equal("https://www.example-shop.com/img/b.png",
            ProductPreviewService.ExtractImage("<meta name=\"twitter:image\" content=\"/img/b.png\">", page));
        Equal(null, ProductPreviewService.ExtractImage("<meta property=\"og:image\" content=\"http://insecure/x.jpg\">", page));
        Equal(false, ProductPreviewService.IsPublic(System.Net.IPAddress.Parse("192.168.1.5")));
        Equal(false, ProductPreviewService.IsPublic(System.Net.IPAddress.Parse("127.0.0.1")));
        Equal(false, ProductPreviewService.IsPublic(System.Net.IPAddress.Parse("169.254.169.254")));
        Equal(true, ProductPreviewService.IsPublic(System.Net.IPAddress.Parse("151.101.1.69")));
    }

    private static InstallationTokenService TokenService(DateTimeOffset now) =>
        TokenService(new ManualTimeProvider(now));

    private static InstallationTokenService TokenService(TimeProvider clock) => new(
        Options.Create(new AppSecurityOptions
        {
            TokenSigningKey = "tests-only-signing-key-with-at-least-32-bytes",
            TokenLifetimeDays = 30
        }),
        clock,
        NullLogger<InstallationTokenService>.Instance);

    private static OutfitRequest Request(params WardrobeItem[] items) => new()
    {
        Preferences = new OutfitPreferences { Destination = "Arkadaş buluşması", Look = "Smart casual", Tone = "Koyu" },
        Wardrobe = items.ToList()
    };

    private static WardrobeItem Item(string id, string category) => new()
    {
        Id = id,
        Category = category,
        Name = id,
        PrimaryColor = "lacivert",
        StyleTags = ["smart casual"]
    };

    private static void Equal<T>(T expected, T actual)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
            throw new InvalidOperationException($"Beklenen {expected}, gelen {actual}");
    }

    private sealed class ManualTimeProvider(DateTimeOffset initial) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = initial;
        public override DateTimeOffset GetUtcNow() => UtcNow;
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "OutfitCombination.Api.Tests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

