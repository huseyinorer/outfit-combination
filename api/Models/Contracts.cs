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
    public List<OutfitSuggestion> Suggestions { get; set; } = [];
}

public sealed record OutfitResponse(
    IReadOnlyList<OutfitSuggestion> Suggestions,
    bool UsedFallback,
    string? Warning = null);

public sealed record InstallationRegistration(string InstallationId, string? AppVersion);

public sealed record AccountExchangeRequest(string Code);

public sealed record EmailSignInStartRequest(string Email, string? Language);

public sealed record EmailSignInCompleteRequest(string Email, string Code);

