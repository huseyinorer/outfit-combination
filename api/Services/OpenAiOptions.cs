namespace OutfitCombination.Api.Services;

public sealed class OpenAiOptions
{
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "";
    public int MaxAttempts { get; set; } = 2;
    // Optional separate model for outfit building (e.g. a reasoning model); falls back to Model.
    public string OutfitModel { get; set; } = "";
    // Sent as reasoning.effort only when set (low|medium|high); leave empty for non-reasoning models.
    public string OutfitReasoningEffort { get; set; } = "";
    // Shopping looks use the Responses API web search tool; the tool type is configurable in case
    // the API renames it (e.g. "web_search_preview" on older deployments).
    public string ShoppingSearchTool { get; set; } = "web_search";
}

public sealed class AiServiceException(string message, Exception? inner = null) : Exception(message, inner);

