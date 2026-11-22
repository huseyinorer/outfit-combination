using System.Text.Json;
using OutfitCombination.Api.Models;

namespace OutfitCombination.Api.Services;

/// <summary>
/// Guards the product list a web-search answer returns: keeps only https links whose site the
/// model actually cited (or a well-known store), and always adds store search links built from
/// the ideal-item query so the user has something that works even when no product survives.
/// </summary>
public static class ShoppingProducts
{
    private static readonly string[] KnownStores =
    [
        "trendyol.com", "hepsiburada.com", "n11.com", "amazon.com.tr", "zara.com", "lcw.com", "lcwaikiki.com",
        "mavi.com", "koton.com", "defacto.com.tr", "boyner.com.tr", "hm.com", "beymen.com", "network.com.tr",
        "ipekyol.com.tr", "vakko.com", "massimodutti.com", "bershka.com", "pullandbear.com", "stradivarius.com",
        "mango.com", "colins.com.tr", "ltbjeans.com", "nike.com", "adidas.com.tr", "adidas.com", "puma.com",
        "skechers.com.tr", "flo.com.tr", "superstep.com.tr", "derimod.com.tr", "amazon.com", "asos.com",
        "uniqlo.com", "gap.com", "zalando.com", "nordstrom.com", "macys.com"
    ];

    /// <summary>Hosts of every url_citation annotation in a Responses API answer.</summary>
    public static HashSet<string> CitedHosts(string responseJson)
    {
        var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var document = JsonDocument.Parse(responseJson);
            if (!document.RootElement.TryGetProperty("output", out var output)) return hosts;
            foreach (var item in output.EnumerateArray())
            {
                if (!item.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array) continue;
                foreach (var part in content.EnumerateArray())
                {
                    if (!part.TryGetProperty("annotations", out var annotations) || annotations.ValueKind != JsonValueKind.Array) continue;
                    foreach (var annotation in annotations.EnumerateArray())
                    {
                        if (annotation.TryGetProperty("url", out var url) &&
                            Uri.TryCreate(url.GetString(), UriKind.Absolute, out var uri))
                            hosts.Add(Host(uri));
                    }
                }
            }
        }
        catch (JsonException)
        {
            // No citations readable; known-store check still applies.
        }
        return hosts;
    }

    public static List<ShoppingProduct> Filter(IEnumerable<ShoppingProduct> products, IReadOnlySet<string> citedHosts) =>
        products
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .Where(p => Uri.TryCreate(p.Url?.Trim(), UriKind.Absolute, out var uri) &&
                        uri.Scheme == Uri.UriSchemeHttps &&
                        (citedHosts.Contains(Host(uri)) || IsKnownStore(Host(uri))))
            .GroupBy(p => p.Url.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .Take(6)
            .Select(p => new ShoppingProduct
            {
                Name = p.Name.Trim(),
                Store = string.IsNullOrWhiteSpace(p.Store) ? Host(new Uri(p.Url.Trim())) : p.Store.Trim(),
                Price = p.Price?.Trim() ?? "",
                Url = p.Url.Trim(),
                ImageUrl = ""
            })
            .ToList();

    public static List<ShoppingLink> SearchLinks(string query, bool english)
    {
        var q = Uri.EscapeDataString(string.IsNullOrWhiteSpace(query) ? "" : query.Trim());
        if (q.Length == 0) return [];
        var links = new List<ShoppingLink>();
        if (!english)
        {
            links.Add(new ShoppingLink("Trendyol", $"https://www.trendyol.com/sr?q={q}"));
            links.Add(new ShoppingLink("Hepsiburada", $"https://www.hepsiburada.com/ara?q={q}"));
        }
        links.Add(new ShoppingLink(english ? "Google Shopping" : "Google Alışveriş", $"https://www.google.com/search?tbm=shop&q={q}"));
        return links;
    }

    private static bool IsKnownStore(string host) =>
        KnownStores.Any(store => host == store || host.EndsWith("." + store, StringComparison.OrdinalIgnoreCase));

    private static string Host(Uri uri) =>
        uri.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? uri.Host[4..].ToLowerInvariant() : uri.Host.ToLowerInvariant();
}
