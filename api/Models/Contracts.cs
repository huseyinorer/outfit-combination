namespace OutfitCombination.Api.Models;

public static class Categories
{
    public const string Top = "top";
    public const string Bottom = "bottom";
    public const string Shoes = "shoes";
    public const string Hat = "hat";
    public const string Accessory = "accessory";
    public const string Outerwear = "outerwear";
    public static readonly string[] All = [Top, Bottom, Shoes, Hat, Accessory, Outerwear];
    public static readonly string[] Required = [Top, Bottom, Shoes];
    public static readonly string[] Optional = [Hat, Accessory, Outerwear];
}

public sealed class ClothingAnalysis
{
    public string Name { get; set; } = "";
    public string SubType { get; set; } = "";
    public string PrimaryColor { get; set; } = "";
    public List<string> SecondaryColors { get; set; } = [];
    public string Pattern { get; set; } = "";
    public List<string> StyleTags { get; set; } = [];
    public List<string> Seasons { get; set; } = [];
    public string Description { get; set; } = "";
    public string Fit { get; set; } = "";
    public string Fabric { get; set; } = "";
    public string Formality { get; set; } = "";
    public string? DetectedCategory { get; set; }
    public bool CategoryConflict { get; set; }
}

public sealed class OutfitPreferences
{
    public string Destination { get; set; } = "Fark etmez";
    public string Look { get; set; } = "Fark etmez";
    public string Tone { get; set; } = "Fark etmez";
}

public sealed class WardrobeItem
{
    public string Id { get; set; } = "";
    public string Category { get; set; } = "";
    public string Name { get; set; } = "";
    public string SubType { get; set; } = "";
    public string PrimaryColor { get; set; } = "";
    public List<string> SecondaryColors { get; set; } = [];
    public string Pattern { get; set; } = "";
    public List<string> StyleTags { get; set; } = [];
    public List<string> Seasons { get; set; } = [];
    public string Description { get; set; } = "";
    public string? Fit { get; set; } = "";
    public string? Fabric { get; set; } = "";
    public string? Formality { get; set; } = "";
}

public sealed class OutfitContext
{
    public double? TemperatureC { get; set; }
    public bool? IsRaining { get; set; }
    public string? Season { get; set; }
}

public sealed class OutfitKey
{
    public string TopId { get; set; } = "";
    public string BottomId { get; set; } = "";
    public string ShoeId { get; set; } = "";
}

public sealed class OutfitExtras
{
    public string Hat { get; set; } = "auto";
    public string Accessory { get; set; } = "auto";
    public string Outerwear { get; set; } = "auto";
}

public sealed class OutfitRequest
{
    public string Language { get; set; } = "tr";
    public OutfitPreferences Preferences { get; set; } = new();
    public List<WardrobeItem> Wardrobe { get; set; } = [];
    public OutfitExtras Extras { get; set; } = new();
    public OutfitContext? Context { get; set; }
    public List<OutfitKey>? Avoid { get; set; } = [];
    /// <summary>Optional piece every outfit must be built around ("outfit with this item").</summary>
    public string? AnchorId { get; set; }
    /// <summary>Optional free-text wish from the user, e.g. "I will walk a lot".</summary>
    public string? Note { get; set; }
    /// <summary>Disliked outfits with the reason the user picked, so the model learns the why.</summary>
    public List<OutfitDislike>? Disliked { get; set; } = [];
    /// <summary>Single shopping category (kept for older app versions); merged into ShopCategories.</summary>
    public string? ShopCategory { get; set; }
    /// <summary>Categories the user wants to buy instead of picking from the wardrobe (shopping look).</summary>
    public List<string>? ShopCategories { get; set; } = [];
}

public sealed class OutfitDislike
{
    public string TopId { get; set; } = "";
    public string BottomId { get; set; } = "";
    public string ShoeId { get; set; } = "";
    /// <summary>colors | occasion | weather | style, or empty.</summary>
    public string? Reason { get; set; }
}

public sealed class OutfitSuggestion
{
    public string Title { get; set; } = "";
    public string TopId { get; set; } = "";
    public string BottomId { get; set; } = "";
    public string ShoeId { get; set; } = "";
    public string? HatId { get; set; }
    public string? AccessoryId { get; set; }
    public string? OuterwearId { get; set; }
    public string Reason { get; set; } = "";
}

public sealed class OutfitAiEnvelope
{
    public List<OutfitAiSuggestion> Suggestions { get; set; } = [];
}

// Model output uses short per-request aliases (T1, B2, S3...) instead of real IDs and
// writes its plan before choosing pieces; OpenAiWardrobeService maps it back.
public sealed class OutfitAiSuggestion
{
    public string Plan { get; set; } = "";
    public string TopId { get; set; } = "";
    public string BottomId { get; set; } = "";
    public string ShoeId { get; set; } = "";
    public string? OuterwearId { get; set; }
    public string? HatId { get; set; }
    public string? AccessoryId { get; set; }
    public string Title { get; set; } = "";
    public string Reason { get; set; } = "";
}

public sealed record OutfitResponse(
    IReadOnlyList<OutfitSuggestion> Suggestions,
    bool UsedFallback,
    string? Warning = null,
    ShoppingLook? Shopping = null);

// ---- Shopping look: wardrobe pieces + one piece to buy, with real products from a web search ----

public sealed class IdealItem
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string SearchQuery { get; set; } = "";
}

public sealed class ShoppingProduct
{
    public string Name { get; set; } = "";
    public string Store { get; set; } = "";
    public string Price { get; set; } = "";
    public string Url { get; set; } = "";
    /// <summary>Preview image read from the product page (og:image); empty when unavailable.</summary>
    public string ImageUrl { get; set; } = "";
}

public sealed record ShoppingLink(string Label, string Url);

public sealed class ShoppingAiPiece
{
    public string Category { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string SearchQuery { get; set; } = "";
    public List<ShoppingProduct> Products { get; set; } = [];
}

public sealed class ShoppingAiLook
{
    public string Plan { get; set; } = "";
    public string? TopId { get; set; }
    public string? BottomId { get; set; }
    public string? ShoeId { get; set; }
    public string? OuterwearId { get; set; }
    public string? HatId { get; set; }
    public string? AccessoryId { get; set; }
    public string Title { get; set; } = "";
    public string Reason { get; set; } = "";
    public List<ShoppingAiPiece> Pieces { get; set; } = [];
}

/// <summary>One piece to buy: what it should be, products found for it and store search links.</summary>
public sealed class ShoppingPiece
{
    public string Category { get; set; } = "";
    public IdealItem IdealItem { get; set; } = new();
    public List<ShoppingProduct> Products { get; set; } = [];
    public List<ShoppingLink> SearchLinks { get; set; } = [];
}

public sealed class ShoppingLook
{
    public List<string> ShopCategories { get; set; } = [];
    public string Title { get; set; } = "";
    public string Reason { get; set; } = "";
    public string? TopId { get; set; }
    public string? BottomId { get; set; }
    public string? ShoeId { get; set; }
    public string? OuterwearId { get; set; }
    public string? HatId { get; set; }
    public string? AccessoryId { get; set; }
    public List<ShoppingPiece> Pieces { get; set; } = [];
}

public sealed record InstallationRegistration(string InstallationId, string? AppVersion);

public sealed record AccountExchangeRequest(string Code);

public sealed record EmailSignInStartRequest(string Email, string? Language);

public sealed record EmailSignInCompleteRequest(string Email, string Code);

