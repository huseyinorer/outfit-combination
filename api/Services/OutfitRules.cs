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
        ["Özel gün"] = ["klasik", "şık", "resmi"],
        ["Daily"] = ["daily", "casual", "sport", "günlük", "rahat", "spor"],
        ["Work/office"] = ["classic", "smart casual", "formal", "minimal", "klasik", "resmi"],
        ["Meeting friends"] = ["casual", "smart casual", "sport", "rahat", "günlük", "spor"],
        ["Dinner"] = ["smart casual", "classic", "elegant", "klasik", "şık"],
        ["Special occasion"] = ["classic", "elegant", "formal", "klasik", "şık", "resmi"]
    };

    public static bool HasOversizedInput(OutfitRequest request)
    {
        if (request.Preferences is null || request.Wardrobe is null) return true;
        if (TooLong(request.Preferences.Destination, 100)
            || TooLong(request.Preferences.Look, 100)
            || TooLong(request.Preferences.Tone, 100)) return true;

        return request.Wardrobe.Any(item => item is null
            || TooLong(item.Id, 100)
            || TooLong(item.Category, 20)
            || TooLong(item.Name, 120)
            || TooLong(item.SubType, 120)
            || TooLong(item.PrimaryColor, 80)
            || TooLong(item.Pattern, 120)
            || TooLong(item.Description, 500)
            || OversizedList(item.SecondaryColors)
            || OversizedList(item.StyleTags)
            || OversizedList(item.Seasons));
    }

    public static IReadOnlyList<string> MissingCategories(IEnumerable<WardrobeItem> wardrobe)
    {
        var categories = wardrobe.Select(x => x.Category).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Categories.Required.Where(x => !categories.Contains(x)).ToArray();
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
            if (!OptionalMatches(candidate.HatId, Categories.Hat, byId) ||
                !OptionalMatches(candidate.AccessoryId, Categories.Accessory, byId) ||
                !OptionalMatches(candidate.OuterwearId, Categories.Outerwear, byId))
                continue;

            var key = Key(candidate.TopId, candidate.BottomId, candidate.ShoeId);
            if (seen.Add(key)) valid.Add(candidate);
        }
        return valid;
    }

    private static bool OptionalMatches(string? id, string expectedCategory, Dictionary<string, WardrobeItem> byId)
    {
        if (string.IsNullOrWhiteSpace(id)) return true;
        return byId.TryGetValue(id, out var item) && item.Category == expectedCategory;
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

        var hats = request.Wardrobe.Where(x => x.Category == Categories.Hat).ToList();
        var accessories = request.Wardrobe.Where(x => x.Category == Categories.Accessory).ToList();
        var outerwear = request.Wardrobe.Where(x => x.Category == Categories.Outerwear).ToList();
        var extras = request.Extras ?? new OutfitExtras();

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
            var english = request.Language.Equals("en", StringComparison.OrdinalIgnoreCase);
            valid.Add(new OutfitSuggestion
            {
                Title = $"{Display(best.Top, english ? "Top" : "Üst")} & {Display(best.Bottom, english ? "Bottom" : "Alt")}",
                TopId = best.Top.Id,
                BottomId = best.Bottom.Id,
                ShoeId = best.Shoes.Id,
                HatId = PickExtra(hats, extras.Hat)?.Id,
                AccessoryId = PickExtra(accessories, extras.Accessory)?.Id,
                OuterwearId = PickExtra(outerwear, extras.Outerwear)?.Id,
                Reason = english
                    ? $"{Detail(best.Top, "top")}, {Detail(best.Bottom, "bottom")}, and {Detail(best.Shoes, "shoes")} create a balanced color and style combination."
                    : $"{Detail(best.Top, "Üst")}, {Detail(best.Bottom, "alt")} ve {Detail(best.Shoes, "ayakkabı")} renk ve tarz bakımından dengeli bir bütün oluşturuyor."
            });
        }
        return valid;
    }

    private static WardrobeItem? PickExtra(IReadOnlyList<WardrobeItem> pool, string mode)
    {
        if (string.Equals(mode, "exclude", StringComparison.OrdinalIgnoreCase)) return null;
        return pool.FirstOrDefault();
    }

    private static double Score(WardrobeItem top, WardrobeItem bottom, WardrobeItem shoes, OutfitPreferences prefs)
    {
        var pieces = new[] { top, bottom, shoes };
        var score = 0d;
        foreach (var piece in pieces)
        {
            if (NeutralColors.Contains(piece.PrimaryColor)) score += .7;
            if ((prefs.Tone.Equals("Açık", StringComparison.OrdinalIgnoreCase) || prefs.Tone.Equals("Light", StringComparison.OrdinalIgnoreCase)) && LightColors.Contains(piece.PrimaryColor)) score += 1.8;
            if ((prefs.Tone.Equals("Koyu", StringComparison.OrdinalIgnoreCase) || prefs.Tone.Equals("Dark", StringComparison.OrdinalIgnoreCase)) && DarkColors.Contains(piece.PrimaryColor)) score += 1.8;
            if (!prefs.Look.Equals("Fark etmez", StringComparison.OrdinalIgnoreCase) && !prefs.Look.Equals("Any", StringComparison.OrdinalIgnoreCase) &&
                piece.StyleTags.Any(x => x.Contains(prefs.Look, StringComparison.CurrentCultureIgnoreCase))) score += 2;
        }
        if (DestinationStyles.TryGetValue(prefs.Destination, out var expectedStyles) &&
            pieces.SelectMany(x => x.StyleTags).Any(style => expectedStyles.Any(expected =>
                style.Contains(expected, StringComparison.CurrentCultureIgnoreCase)))) score += 2.5;
        if ((prefs.Tone.Equals("Karışık", StringComparison.OrdinalIgnoreCase) || prefs.Tone.Equals("Mixed", StringComparison.OrdinalIgnoreCase)) &&
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
    private static bool TooLong(string? value, int maximum) => value is null || value.Length > maximum;
    private static bool OversizedList(IReadOnlyCollection<string>? values) =>
        values is null || values.Count > 20 || values.Any(value => TooLong(value, 80));
    private sealed record Triple(WardrobeItem Top, WardrobeItem Bottom, WardrobeItem Shoes, double Score);
}

