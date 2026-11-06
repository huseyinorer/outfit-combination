namespace OutfitCombination.Api.Services;

public sealed class OpenAiOptions
{
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "";
    public int MaxAttempts { get; set; } = 2;
}

public sealed class AiServiceException(string message, Exception? inner = null) : Exception(message, inner);

