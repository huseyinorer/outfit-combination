namespace OutfitCombination.Api.Services;

public sealed class UsageQuotaOptions
{
    public string ConnectionString { get; set; } = string.Empty;

    // Free plan (after the trial): keeps the wardrobe growing and one AI outfit a day.
    public int DailyAnalysisLimit { get; set; } = 3;
    public int MonthlyAnalysisLimit { get; set; } = 20;
    public int DailyOutfitLimit { get; set; } = 1;
    public int MonthlyOutfitLimit { get; set; } = 15;

    // Trial: the first TrialDays after sign-up. Generous analysis so the wardrobe gets built
    // (that is what keeps people), daily outfit credits to build the morning habit.
    public int TrialDays { get; set; } = 14;
    public int TrialDailyAnalysisLimit { get; set; } = 40;
    public int TrialMonthlyAnalysisLimit { get; set; } = 150;
    public int TrialDailyOutfitLimit { get; set; } = 5;
    public int TrialMonthlyOutfitLimit { get; set; } = 80;

    // Premium subscription.
    public int PremiumDailyAnalysisLimit { get; set; } = 50;
    public int PremiumMonthlyAnalysisLimit { get; set; } = 1000;
    public int PremiumDailyOutfitLimit { get; set; } = 20;
    public int PremiumMonthlyOutfitLimit { get; set; } = 400;
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
