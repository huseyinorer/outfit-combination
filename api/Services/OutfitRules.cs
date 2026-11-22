using System.Globalization;
using OutfitCombination.Api.Models;

namespace OutfitCombination.Api.Services;

public static class OutfitRules
{
    // Matched with "contains" so fashion names like "koyu lacivert" or "deve tüyü" count too.
    private static readonly string[] NeutralColors =
    [
        "siyah", "beyaz", "gri", "bej", "krem", "lacivert", "kahverengi", "ekru", "antrasit", "füme",
        "deve tüyü", "taş", "kum", "haki", "vizon", "kemik", "taupe",
        "black", "white", "grey", "gray", "beige", "cream", "navy", "brown", "ecru", "charcoal",
        "camel", "stone", "sand", "khaki", "ivory", "off-white"
    ];
    private static readonly string[] LightColors =
    [
        "beyaz", "bej", "krem", "ekru", "açık", "pudra", "sarı", "taş", "kum", "kemik",
        "white", "beige", "cream", "ecru", "light", "pastel", "yellow", "stone", "sand", "ivory", "off-white"
    ];
    private static readonly string[] DarkColors =
    [
        "siyah", "lacivert", "antrasit", "bordo", "koyu", "kahverengi", "füme", "haki",
        "black", "navy", "charcoal", "burgundy", "oxblood", "dark", "brown", "olive"
    ];
    private static readonly Dictionary<string, string[]> SeasonWords = new(StringComparer.Ordinal)
    {
        ["summer"] = ["yaz", "summer"],
        ["autumn"] = ["sonbahar", "autumn", "fall"],
        ["winter"] = ["kış", "kis", "winter"],
        ["spring"] = ["ilkbahar", "spring"]
    };
    private static readonly string[] AllSeasonWords = ["4 mevsim", "dört mevsim", "four seasons", "all season", "all-season"];
    // Words that mark a jacket/coat-like piece; used to avoid a jacket "top" under a separate outerwear.
    private static readonly string[] OuterLayerWords =
    [
        "ceket", "mont", "kaban", "palto", "trençkot", "trenckot", "blazer", "bomber", "parka", "yelek", "hırka",
        "overshirt", "jacket", "coat", "overcoat", "trench", "parka", "puffer", "gilet", "cardigan", "shacket"
    ];
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
            || OversizedList(item.Seasons)
            || (item.Fit?.Length ?? 0) > 80
            || (item.Fabric?.Length ?? 0) > 80
            || (item.Formality?.Length ?? 0) > 10)
            || (request.Context?.Season?.Length ?? 0) > 20
            || (request.Avoid?.Count ?? 0) > 200
            || (request.Avoid ?? []).Any(x => x is null || TooLong(x.TopId, 100) || TooLong(x.BottomId, 100) || TooLong(x.ShoeId, 100))
            || (request.AnchorId?.Length ?? 0) > 100
            || (request.Note?.Length ?? 0) > 300
            || (request.ShopCategory?.Length ?? 0) > 20
            || (request.ShopCategories?.Count ?? 0) > 6
            || (request.ShopCategories ?? []).Any(x => x is null || x.Length > 20)
            || (request.Disliked?.Count ?? 0) > 100
            || (request.Disliked ?? []).Any(x => x is null || TooLong(x.TopId, 100) || TooLong(x.BottomId, 100) || TooLong(x.ShoeId, 100) || (x.Reason?.Length ?? 0) > 20);
    }

    public const int MaxShopCategories = 3;

    /// <summary>
    /// Valid, distinct shopping categories (old single field included), never the anchor's own
    /// category, capped at <see cref="MaxShopCategories"/> because each one adds a web search.
    /// </summary>
    public static List<string> ShopCategories(OutfitRequest request)
    {
        var anchorCategory = Anchor(request)?.Category;
        return (request.ShopCategories ?? [])
            .Append(request.ShopCategory)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim().ToLowerInvariant())
            .Where(x => Categories.All.Contains(x) && x != anchorCategory)
            .Distinct()
            .OrderBy(x => Array.IndexOf(Categories.All, x))
            .Take(MaxShopCategories)
            .ToList();
    }

    /// <summary>The "outfit with this item" piece, when the request names one that is in the wardrobe.</summary>
    public static WardrobeItem? Anchor(OutfitRequest request) =>
        string.IsNullOrWhiteSpace(request.AnchorId)
            ? null
            : request.Wardrobe.FirstOrDefault(x => x.Id == request.AnchorId);

    /// <summary>Items usable in the given slot; a required-category anchor narrows its slot to itself.</summary>
    public static List<WardrobeItem> Pool(OutfitRequest request, string category)
    {
        var anchor = Anchor(request);
        if (anchor is not null && anchor.Category == category && Categories.Required.Contains(category))
            return [anchor];
        var pool = request.Wardrobe.Where(x => x.Category == category).ToList();
        // A coat anchor is worn over a top, so prefer tops that are not jackets themselves.
        if (anchor?.Category == Categories.Outerwear && category == Categories.Top)
        {
            var plain = pool.Where(x => !IsOuterLayer(x)).ToList();
            if (plain.Count > 0) return plain;
        }
        return pool;
    }

    public static int PossibleCount(OutfitRequest request) =>
        Pool(request, Categories.Top).Count * Pool(request, Categories.Bottom).Count * Pool(request, Categories.Shoes).Count;

    private static bool ContainsAnchor(OutfitSuggestion suggestion, WardrobeItem? anchor) =>
        anchor is null || anchor.Category switch
        {
            Categories.Top => suggestion.TopId == anchor.Id,
            Categories.Bottom => suggestion.BottomId == anchor.Id,
            Categories.Shoes => suggestion.ShoeId == anchor.Id,
            Categories.Hat => suggestion.HatId == anchor.Id,
            Categories.Accessory => suggestion.AccessoryId == anchor.Id,
            Categories.Outerwear => suggestion.OuterwearId == anchor.Id,
            _ => true
        };

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

            // A jacket-like top already is the outer layer; drop a second coat on top of it.
            if (!string.IsNullOrWhiteSpace(candidate.OuterwearId) && IsOuterLayer(top))
                candidate.OuterwearId = null;

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
        var anchor = Anchor(request);
        var possible = PossibleCount(request);
        if (possible == 0) return [];
        var target = Math.Min(3, possible);
        var valid = ValidateAi(request.Wardrobe, aiCandidates)
            .Where(x => ContainsAnchor(x, anchor))
            .Take(target)
            .ToList();
        var seen = valid.Select(x => Key(x.TopId, x.BottomId, x.ShoeId)).ToHashSet(StringComparer.Ordinal);

        var hats = request.Wardrobe.Where(x => x.Category == Categories.Hat).ToList();
        var accessories = request.Wardrobe.Where(x => x.Category == Categories.Accessory).ToList();
        var outerwear = request.Wardrobe.Where(x => x.Category == Categories.Outerwear).ToList();
        var extras = request.Extras ?? new OutfitExtras();
        var season = NormalizeSeason(request.Context?.Season) ?? SeasonFromDate(DateTimeOffset.UtcNow);
        var avoid = (request.Avoid ?? [])
            .Where(x => x is not null)
            .Select(x => Key(x.TopId, x.BottomId, x.ShoeId))
            .ToHashSet(StringComparer.Ordinal);

        var triples = (
            from top in Pool(request, Categories.Top)
            from bottom in Pool(request, Categories.Bottom)
            from shoes in Pool(request, Categories.Shoes)
            let key = Key(top.Id, bottom.Id, shoes.Id)
            where !seen.Contains(key)
            select new Triple(top, bottom, shoes,
                Score(top, bottom, shoes, request.Preferences, season) - (avoid.Contains(key) ? 6 : 0))
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
                HatId = anchor?.Category == Categories.Hat ? anchor.Id
                    : PickExtra(hats, extras.Hat, best, request, season, valid, x => x.HatId)?.Id,
                AccessoryId = anchor?.Category == Categories.Accessory ? anchor.Id
                    : PickExtra(accessories, extras.Accessory, best, request, season, valid, x => x.AccessoryId)?.Id,
                OuterwearId = anchor?.Category == Categories.Outerwear ? anchor.Id
                    : PickExtra(outerwear, extras.Outerwear, best, request, season, valid, x => x.OuterwearId)?.Id,
                Reason = english
                    ? $"{Detail(best.Top, "top")}, {Detail(best.Bottom, "bottom")}, and {Detail(best.Shoes, "shoes")} create a balanced color and style combination."
                    : $"{Detail(best.Top, "Üst")}, {Detail(best.Bottom, "alt")} ve {Detail(best.Shoes, "ayakkabı")} renk ve tarz bakımından dengeli bir bütün oluşturuyor."
            });
        }
        return valid;
    }

    // Picks the best-fitting extra instead of always the first one: "auto" only adds a piece
    // that suits the weather and occasion, and the same extra is rotated across suggestions.
    private static WardrobeItem? PickExtra(
        IReadOnlyList<WardrobeItem> pool,
        string mode,
        Triple triple,
        OutfitRequest request,
        string season,
        IReadOnlyCollection<OutfitSuggestion> selected,
        Func<OutfitSuggestion, string?> selectedId)
    {
        if (pool.Count == 0 || string.Equals(mode, "exclude", StringComparison.OrdinalIgnoreCase)) return null;
        var include = string.Equals(mode, "include", StringComparison.OrdinalIgnoreCase);
        var category = pool[0].Category;

        if (category == Categories.Outerwear && !include)
        {
            // Never stack a coat over a top that is itself a jacket/coat.
            if (IsOuterLayer(triple.Top)) return null;
            var temperature = request.Context?.TemperatureC;
            var cold = temperature is { } t ? t < 16 : season is "winter" or "autumn";
            if (!cold) return null;
        }

        var prefs = request.Preferences ?? new OutfitPreferences();
        var best = pool
            .Select(item =>
            {
                var score = 0d;
                if (item.Seasons.Count > 0) score += MatchesSeason(item, season) ? 2 : -3;
                if (DestinationStyles.TryGetValue(prefs.Destination ?? "", out var expected) &&
                    item.StyleTags.Any(tag => expected.Any(e => tag.Contains(e, StringComparison.CurrentCultureIgnoreCase))))
                    score += 1.5;
                if (!OutfitPrompt.IsNoPreference(prefs.Look) &&
                    item.StyleTags.Any(tag => tag.Contains(prefs.Look, StringComparison.CurrentCultureIgnoreCase)))
                    score += 1.5;
                if (FormalitySpread([triple.Top, triple.Bottom, triple.Shoes, item]) > 1) score -= 2;
                if (InAny(NeutralColors, item.PrimaryColor)) score += .5;
                score -= selected.Count(x => selectedId(x) == item.Id) * 1.5;
                return (Item: item, Score: score);
            })
            .OrderByDescending(x => x.Score)
            .First();

        if (include) return best.Item;
        return category == Categories.Outerwear
            ? (best.Score > -2 ? best.Item : null)
            : (best.Score >= 2 ? best.Item : null);
    }

    public static bool IsOuterLayer(WardrobeItem item)
    {
        var text = $"{item.SubType} {item.Name}".ToLower(CultureInfo.GetCultureInfo("tr-TR"));
        return OuterLayerWords.Any(text.Contains);
    }

    public static string? NormalizeSeason(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = value.Trim().ToLowerInvariant();
        foreach (var (season, words) in SeasonWords)
            if (season == normalized || words.Any(normalized.Contains)) return season;
        return null;
    }

    public static string SeasonFromDate(DateTimeOffset now) => now.Month switch
    {
        12 or 1 or 2 => "winter",
        3 or 4 or 5 => "spring",
        6 or 7 or 8 => "summer",
        _ => "autumn"
    };

    private static bool MatchesSeason(WardrobeItem item, string season)
    {
        if (item.Seasons.Count == 0) return true;
        var words = SeasonWords[season];
        return item.Seasons.Any(value =>
        {
            var normalized = value.ToLower(CultureInfo.GetCultureInfo("tr-TR"));
            return AllSeasonWords.Any(normalized.Contains) || words.Any(normalized.Contains);
        });
    }

    private static int FormalitySpread(IEnumerable<WardrobeItem> items)
    {
        var levels = items
            .Select(x => int.TryParse(x.Formality, out var level) && level is >= 1 and <= 5 ? level : 0)
            .Where(x => x > 0)
            .ToList();
        return levels.Count < 2 ? 0 : levels.Max() - levels.Min();
    }

    private static bool InAny(string[] palette, string? color)
    {
        if (string.IsNullOrWhiteSpace(color)) return false;
        var normalized = color.ToLower(CultureInfo.GetCultureInfo("tr-TR"));
        return palette.Any(normalized.Contains);
    }

    private static double Score(WardrobeItem top, WardrobeItem bottom, WardrobeItem shoes, OutfitPreferences? prefs, string season)
    {
        prefs ??= new OutfitPreferences();
        var tone = prefs.Tone ?? "";
        var look = prefs.Look ?? "";
        var pieces = new[] { top, bottom, shoes };
        var score = 0d;
        foreach (var piece in pieces)
        {
            if (InAny(NeutralColors, piece.PrimaryColor)) score += .7;
            if ((tone.Equals("Açık", StringComparison.OrdinalIgnoreCase) || tone.Equals("Light", StringComparison.OrdinalIgnoreCase)) && InAny(LightColors, piece.PrimaryColor)) score += 1.8;
            if ((tone.Equals("Koyu", StringComparison.OrdinalIgnoreCase) || tone.Equals("Dark", StringComparison.OrdinalIgnoreCase)) && InAny(DarkColors, piece.PrimaryColor)) score += 1.8;
            if (!OutfitPrompt.IsNoPreference(look) &&
                piece.StyleTags.Any(x => x.Contains(look, StringComparison.CurrentCultureIgnoreCase))) score += 2;
            if (!MatchesSeason(piece, season)) score -= 3;
        }
        if (DestinationStyles.TryGetValue(prefs.Destination ?? "", out var expectedStyles) &&
            pieces.SelectMany(x => x.StyleTags).Any(style => expectedStyles.Any(expected =>
                style.Contains(expected, StringComparison.CurrentCultureIgnoreCase)))) score += 2.5;
        if ((tone.Equals("Karışık", StringComparison.OrdinalIgnoreCase) || tone.Equals("Mixed", StringComparison.OrdinalIgnoreCase)) &&
            pieces.Select(x => x.PrimaryColor).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1) score += 1.5;
        var bold = pieces.Count(x => !string.IsNullOrWhiteSpace(x.Pattern) &&
            !new[] { "düz", "desensiz", "plain", "solid" }.Contains(x.Pattern.Trim(), StringComparer.OrdinalIgnoreCase));
        if (bold > 1) score -= .8 * (bold - 1);
        if (FormalitySpread(pieces) > 1) score -= 2;
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

