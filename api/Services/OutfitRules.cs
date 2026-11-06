using OutfitCombination.Api.Models;

namespace OutfitCombination.Api.Services;

public static class OutfitRules
{
    private static readonly HashSet<string> NeutralColors = new(StringComparer.OrdinalIgnoreCase)
        { "siyah", "beyaz", "gri", "bej", "krem", "lacivert", "kahverengi", "ekru" };
    private static readonly HashSet<string> LightColors = new(StringComparer.OrdinalIgnoreCase)
        { "beyaz", "bej", "krem", "ekru", "açık mavi", "pudra", "sarı" };
    private static readonly HashSet<string> DarkColors = new(StringComparer.OrdinalIgnoreCase)
        { "siyah", "lacivert", "antrasit", "bordo", "koyu gri", "kahverengi" };
    private static readonly Dictionary<string, string[]> DestinationStyles = new(StringComparer.CurrentCultureIgnoreCase)
    {
        ["Günlük"] = ["günlük", "rahat", "spor"],
        ["İş/ofis"] = ["klasik", "smart casual", "resmi", "minimal"],
        ["Arkadaş buluşması"] = ["rahat", "smart casual", "günlük", "spor"],
        ["Akşam yemeği"] = ["smart casual", "klasik", "şık"],
        ["Özel gün"] = ["klasik", "şık", "resmi"]
    };

    public static IReadOnlyList<string> MissingCategories(IEnumerable<WardrobeItem> wardrobe)
    {
        var categories = wardrobe.Select(x => x.Category).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Categories.All.Where(x => !categories.Contains(x)).ToArray();
    }

    public static int PossibleCount(IEnumerable<WardrobeItem> wardrobe)
    {
        var list = wardrobe.ToList();
        return list.Count(x => x.Category == Categories.Top)
             * list.Count(x => x.Category == Categories.Bottom)
             * list.Count(x => x.Category == Categories.Shoes);
    }

    public static List<OutfitSuggestion> ValidateAi(
        IReadOnlyCollection<WardrobeItem> wardrobe,
        IEnumerable<OutfitSuggestion>? candidates)
    {
        var byId = wardrobe
            .Where(x => !string.IsNullOrWhiteSpace(x.Id))
            .GroupBy(x => x.Id)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var valid = new List<OutfitSuggestion>();

        foreach (var candidate in candidates ?? [])
        {
            if (!byId.TryGetValue(candidate.TopId, out var top) || top.Category != Categories.Top ||
                !byId.TryGetValue(candidate.BottomId, out var bottom) || bottom.Category != Categories.Bottom ||
                !byId.TryGetValue(candidate.ShoeId, out var shoes) || shoes.Category != Categories.Shoes)
                continue;

            var key = Key(candidate.TopId, candidate.BottomId, candidate.ShoeId);
            if (seen.Add(key)) valid.Add(candidate);
        }
        return valid;
    }

    public static List<OutfitSuggestion> Complete(
        OutfitRequest request,
        IEnumerable<OutfitSuggestion>? aiCandidates)
    {
        var possible = PossibleCount(request.Wardrobe);
        if (possible == 0) return [];
        var target = Math.Min(3, possible);
        var valid = ValidateAi(request.Wardrobe, aiCandidates).Take(target).ToList();
        var seen = valid.Select(x => Key(x.TopId, x.BottomId, x.ShoeId)).ToHashSet(StringComparer.Ordinal);

        var triples = (
            from top in request.Wardrobe.Where(x => x.Category == Categories.Top)
            from bottom in request.Wardrobe.Where(x => x.Category == Categories.Bottom)
            from shoes in request.Wardrobe.Where(x => x.Category == Categories.Shoes)
            let key = Key(top.Id, bottom.Id, shoes.Id)
            where !seen.Contains(key)
            select new Triple(top, bottom, shoes, Score(top, bottom, shoes, request.Preferences))
        ).ToList();

        while (valid.Count < target && triples.Count > 0)
        {
            var best = triples
                .OrderByDescending(candidate => candidate.Score - DiversityPenalty(candidate, valid))
                .First();
            triples.Remove(best);
            valid.Add(new OutfitSuggestion
            {
                Title = $"{Display(best.Top, "Üst")} & {Display(best.Bottom, "Alt")}",
                TopId = best.Top.Id,
                BottomId = best.Bottom.Id,
                ShoeId = best.Shoes.Id,
                Reason = $"{Detail(best.Top, "Üst")}, {Detail(best.Bottom, "alt")} ve {Detail(best.Shoes, "ayakkabı")} renk ve tarz bakımından dengeli bir bütün oluşturuyor."
            });
        }
        return valid;
    }

    private static double Score(WardrobeItem top, WardrobeItem bottom, WardrobeItem shoes, OutfitPreferences prefs)
    {
        var pieces = new[] { top, bottom, shoes };
        var score = 0d;
        foreach (var piece in pieces)
        {
            if (NeutralColors.Contains(piece.PrimaryColor)) score += .7;
            if (prefs.Tone.Equals("Açık", StringComparison.OrdinalIgnoreCase) && LightColors.Contains(piece.PrimaryColor)) score += 1.8;
            if (prefs.Tone.Equals("Koyu", StringComparison.OrdinalIgnoreCase) && DarkColors.Contains(piece.PrimaryColor)) score += 1.8;
            if (!prefs.Look.Equals("Fark etmez", StringComparison.OrdinalIgnoreCase) &&
                piece.StyleTags.Any(x => x.Contains(prefs.Look, StringComparison.CurrentCultureIgnoreCase))) score += 2;
        }
        if (DestinationStyles.TryGetValue(prefs.Destination, out var expectedStyles) &&
            pieces.SelectMany(x => x.StyleTags).Any(style => expectedStyles.Any(expected =>
                style.Contains(expected, StringComparison.CurrentCultureIgnoreCase)))) score += 2.5;
        if (prefs.Tone.Equals("Karışık", StringComparison.OrdinalIgnoreCase) &&
            pieces.Select(x => x.PrimaryColor).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1) score += 1.5;
        return score;
    }

    private static double DiversityPenalty(Triple triple, IEnumerable<OutfitSuggestion> selected) =>
        selected.Sum(x => (x.TopId == triple.Top.Id ? 1.2 : 0) +
                          (x.BottomId == triple.Bottom.Id ? 1 : 0) +
                          (x.ShoeId == triple.Shoes.Id ? .8 : 0));

    private static string Display(WardrobeItem item, string fallback) =>
        string.IsNullOrWhiteSpace(item.Name) ? fallback : item.Name;
    private static string Detail(WardrobeItem item, string fallback) =>
        string.IsNullOrWhiteSpace(item.PrimaryColor)
            ? Display(item, fallback)
            : $"{Display(item, fallback)} ({item.PrimaryColor})";
    private static string Key(string top, string bottom, string shoes) => $"{top}|{bottom}|{shoes}";
    private sealed record Triple(WardrobeItem Top, WardrobeItem Bottom, WardrobeItem Shoes, double Score);
}

