using OutfitCombination.Api.Models;
using OutfitCombination.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

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
            ("Görsel imza doğrulama", ImageSignatureValidation),
            ("Büyük kombin girdisi reddi", OversizedOutfitInput),
            ("Mobil sürüm dosyası", MobileVersionFile)
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
        Equal("1.1.1", new MobileVersionService().LatestVersion);
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
}

