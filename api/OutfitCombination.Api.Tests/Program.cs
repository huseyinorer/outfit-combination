using OutfitCombination.Api.Models;
using OutfitCombination.Api.Services;

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
        Equal("1.0.0", new MobileVersionService().LatestVersion);
    }

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
}

