using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using OutfitCombination.Api.Models;

namespace OutfitCombination.Api.Services;

/// <summary>
/// Adds a preview image to shopping products by reading the product page's og:image /
/// twitter:image tag. Best effort with a short overall budget: a product without a readable
/// image simply keeps an empty <see cref="ShoppingProduct.ImageUrl"/>.
/// Only public https hosts are fetched (no private/loopback addresses, manual redirects).
/// </summary>
public sealed partial class ProductPreviewService(HttpClient httpClient, ILogger<ProductPreviewService> logger)
{
    private const int MaxHtmlBytes = 400_000;
    private const int MaxRedirects = 3;
    private static readonly TimeSpan PerProductTimeout = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan TotalBudget = TimeSpan.FromSeconds(9);

    public async Task EnrichAsync(IReadOnlyList<ShoppingProduct> products, CancellationToken cancellationToken)
    {
        if (products.Count == 0) return;
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TotalBudget);
        using var gate = new SemaphoreSlim(6);

        await Task.WhenAll(products.Select(async product =>
        {
            try
            {
                await gate.WaitAsync(budget.Token);
                try
                {
                    product.ImageUrl = await FindImageAsync(product.Url, budget.Token) ?? "";
                }
                finally
                {
                    gate.Release();
                }
            }
            catch (Exception error) when (error is OperationCanceledException or HttpRequestException or SocketException or IOException)
            {
                // No preview for this product; the link itself still works.
            }
            catch (Exception error)
            {
                logger.LogDebug(error, "Ürün önizlemesi okunamadı");
            }
        }));
    }

    private async Task<string?> FindImageAsync(string url, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(PerProductTimeout);

        for (var redirect = 0; redirect <= MaxRedirects; redirect++)
        {
            if (uri.Scheme != Uri.UriSchemeHttps || !await IsPublicHostAsync(uri.Host, timeout.Token)) return null;

            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (compatible; LinkPreview/1.0)");
            request.Headers.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml");
            request.Headers.TryAddWithoutValidation("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.8");
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);

            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is { } location)
            {
                uri = location.IsAbsoluteUri ? location : new Uri(uri, location);
                continue;
            }
            if (!response.IsSuccessStatusCode) return null;
            if (response.Content.Headers.ContentType?.MediaType is { } media && !media.Contains("html", StringComparison.OrdinalIgnoreCase))
                return null;

            var html = await ReadLimitedAsync(response, timeout.Token);
            return ExtractImage(html, uri);
        }
        return null;
    }

    internal static string? ExtractImage(string html, Uri pageUri)
    {
        string? found = null;
        foreach (Match tag in MetaTag().Matches(html))
        {
            var key = Attribute(tag.Value, "property") ?? Attribute(tag.Value, "name");
            if (key is null) continue;
            key = key.ToLowerInvariant();
            if (key is not ("og:image" or "og:image:secure_url" or "twitter:image" or "twitter:image:src")) continue;
            var content = Attribute(tag.Value, "content");
            if (string.IsNullOrWhiteSpace(content)) continue;
            found = WebUtility.HtmlDecode(content.Trim());
            if (key.StartsWith("og:", StringComparison.Ordinal)) break; // og:image wins over twitter:image
        }
        if (found is null) return null;
        if (found.StartsWith("//", StringComparison.Ordinal)) found = "https:" + found;
        if (!Uri.TryCreate(pageUri, found, out var image) || image.Scheme != Uri.UriSchemeHttps) return null;
        return image.ToString();
    }

    private static string? Attribute(string tag, string name)
    {
        var match = Regex.Match(tag, $@"\b{name}\s*=\s*(?:""([^""]*)""|'([^']*)')", RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        return match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
    }

    private static async Task<string> ReadLimitedAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var buffer = new byte[MaxHtmlBytes];
        var total = 0;
        while (total < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(total, buffer.Length - total), cancellationToken);
            if (read == 0) break;
            total += read;
        }
        return Encoding.UTF8.GetString(buffer, 0, total);
    }

    private static async Task<bool> IsPublicHostAsync(string host, CancellationToken cancellationToken)
    {
        IPAddress[] addresses;
        try
        {
            addresses = IPAddress.TryParse(host, out var literal)
                ? [literal]
                : await Dns.GetHostAddressesAsync(host, cancellationToken);
        }
        catch (SocketException)
        {
            return false;
        }
        return addresses.Length > 0 && addresses.All(IsPublic);
    }

    internal static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any)) return false;
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
            return !(address.IsIPv6LinkLocal || address.IsIPv6SiteLocal || address.IsIPv6Multicast || address.IsIPv6UniqueLocal);
        var b = address.GetAddressBytes();
        return !(b[0] == 10
            || b[0] == 127
            || b[0] == 0
            || (b[0] == 169 && b[1] == 254)
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168)
            || (b[0] == 100 && b[1] >= 64 && b[1] <= 127)
            || b[0] >= 224);
    }

    [GeneratedRegex(@"<meta\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex MetaTag();
}
