namespace OutfitCombination.Api.Services;

public sealed class UsageQuotaOptions
{
    public string ConnectionString { get; set; } = string.Empty;
    public int DailyAnalysisLimit { get; set; } = 20;
    public int MonthlyAnalysisLimit { get; set; } = 300;
    public int DailyOutfitLimit { get; set; } = 60;
    public int MonthlyOutfitLimit { get; set; } = 900;
    public double PremiumMultiplier { get; set; } = 5.0;
}

public enum AiOperation
{
    Analysis,
    Outfit
}

public enum QuotaStatus
{
    Allowed,
    Exceeded,
    Unavailable
}

public sealed record QuotaDecision(QuotaStatus Status, int DailyUsed = 0, int MonthlyUsed = 0);

public sealed record UsageSnapshot(
    int DailyAnalysisUsed,
    int DailyAnalysisLimit,
    int MonthlyAnalysisUsed,
    int MonthlyAnalysisLimit,
    int DailyOutfitUsed,
    int DailyOutfitLimit,
    int MonthlyOutfitUsed,
    int MonthlyOutfitLimit);
