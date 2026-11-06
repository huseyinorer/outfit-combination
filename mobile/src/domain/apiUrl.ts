export function normalizeApiBaseUrl(value: string): string {
  const firstToken = value.trim().split(/\s+/)[0] ?? '';
  return firstToken.replace(/\/+$/, '');
}

export function isValidApiBaseUrl(value: string): boolean {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
