using System.Diagnostics;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;

namespace OutfitCombination.Api.Services;

public sealed class BackgroundRemovalResult(byte[] pngBytes, string contentType)
{
    public byte[] PngBytes { get; } = pngBytes;
    public string ContentType { get; } = contentType;
}

public sealed class BackgroundRemovalService(
    HttpClient httpClient,
    IOptions<BackgroundRemovalOptions> options,
    ILogger<BackgroundRemovalService> logger)
{
    private readonly BackgroundRemovalOptions _options = options.Value;

    public bool Enabled => _options.Enabled;
    public string Provider => string.IsNullOrWhiteSpace(_options.Provider) ? "remove.bg" : _options.Provider;
    public int MaxUploadBytes => Math.Clamp(_options.MaxUploadBytes, 1024, 25 * 1024 * 1024);

    public async Task<BackgroundRemovalResult> RemoveAsync(
        Stream imageStream,
        string contentType,
        CancellationToken cancellationToken)
    {
        if (!Enabled) throw new BackgroundRemovalException("Arka plan kaldırma servisi yapılandırılmamış.");
        if (!string.Equals(Provider, "remove.bg", StringComparison.OrdinalIgnoreCase))
            throw new BackgroundRemovalException($"Desteklenmeyen arka plan kaldırma sağlayıcısı: {Provider}");

        using var memory = new MemoryStream();
        await imageStream.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();
        if (bytes.Length == 0 || bytes.Length > MaxUploadBytes)
            throw new BackgroundRemovalException("Gönderilen görsel boyutu geçersiz.");
        if (!ImageUploadValidator.MatchesContentType(bytes, contentType))
            throw new BackgroundRemovalException("Dosya içeriği bildirilen görsel türüyle eşleşmiyor.");

        var stopwatch = Stopwatch.StartNew();
        var outcome = "ok";
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, _options.Endpoint);
            request.Headers.Add("X-Api-Key", _options.ApiKey);
            using var form = new MultipartFormDataContent();
            var imageContent = new ByteArrayContent(bytes);
            imageContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            form.Add(imageContent, "image_file", "clothing.bin");
            form.Add(new StringContent("auto"), "size");
            form.Add(new StringContent("png"), "format");
            request.Content = form;

            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            var responseContentType = response.Content.Headers.ContentType?.MediaType ?? "image/png";
            if (!response.IsSuccessStatusCode)
            {
                outcome = (int)response.StatusCode >= 500 ? "server_error" : "client_error";
                var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                var trimmed = detail.Length > 600 ? detail[..600] : detail;
                throw new BackgroundRemovalException($"Arka plan kaldırma başarısız ({(int)response.StatusCode}): {trimmed}");
            }
            await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var buffer = new MemoryStream();
            await responseStream.CopyToAsync(buffer, cancellationToken);
            return new BackgroundRemovalResult(buffer.ToArray(), responseContentType);
        }
        catch (BackgroundRemovalException)
        {
            throw;
        }
        catch (TaskCanceledException error)
        {
            outcome = "timeout";
            throw new BackgroundRemovalException("Arka plan kaldırma servisine ulaşılamadı.", error);
        }
        catch (Exception error) when (error is HttpRequestException)
        {
            outcome = "transport_error";
            throw new BackgroundRemovalException("Arka plan kaldırma servisine ulaşılamadı.", error);
        }
        finally
        {
            stopwatch.Stop();
            logger.Log(
                outcome == "ok" ? LogLevel.Information : LogLevel.Warning,
                "background_removal.request provider={Provider} durationMs={DurationMs} outcome={Outcome}",
                Provider,
                stopwatch.ElapsedMilliseconds,
                outcome);
        }
    }
}
