import * as Location from 'expo-location';
import { getSetting, setSetting } from '../data/database';

export type WeatherSeason = 'summer' | 'autumn' | 'winter' | 'spring';

export interface WeatherSnapshot {
  temperatureC: number;
  precipitationMm: number;
  isRaining: boolean;
  season: WeatherSeason;
  locationLabel: string | null;
  fetchedAt: string;
}

const CACHE_KEY = 'weather_snapshot';
const COORDS_KEY = 'weather_coords';
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/reverse';

export function seasonForTemperature(tempC: number): WeatherSeason {
  if (tempC >= 24) return 'summer';
  if (tempC >= 15) return 'autumn';
  if (tempC <= 5) return 'winter';
  return 'spring';
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json() as T;
}

interface ForecastResponse {
  current?: { temperature_2m?: number; precipitation?: number; weather_code?: number };
  timezone?: string;
}

interface ReverseResponse {
  results?: Array<{ name?: string; admin1?: string; country?: string }>;
}

async function reverseGeocode(latitude: number, longitude: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = `${GEOCODE}?latitude=${latitude}&longitude=${longitude}&count=1&language=tr&format=json`;
    const body = await fetchJson<ReverseResponse>(url, signal);
    const hit = body.results?.[0];
    if (!hit) return null;
    return [hit.name, hit.admin1].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

async function fetchWeatherAt(latitude: number, longitude: number, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const url = `${OPEN_METEO}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weather_code&timezone=auto`;
  const body = await fetchJson<ForecastResponse>(url, signal);
  const temperatureC = body.current?.temperature_2m ?? 20;
  const precipitationMm = body.current?.precipitation ?? 0;
  const label = await reverseGeocode(latitude, longitude, signal);
  return {
    temperatureC,
    precipitationMm,
    isRaining: precipitationMm > 0.3,
    season: seasonForTemperature(temperatureC),
    locationLabel: label,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCachedWeather(): Promise<WeatherSnapshot | null> {
  const raw = await getSetting(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WeatherSnapshot;
    const age = Date.now() - Date.parse(parsed.fetchedAt);
    if (!Number.isFinite(age) || age > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadFreshWeather(signal?: AbortSignal): Promise<WeatherSnapshot | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  let granted = permission.granted;
  if (!granted && permission.canAskAgain) {
    const asked = await Location.requestForegroundPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) {
    const stored = await getSetting(COORDS_KEY);
    if (!stored) return null;
    try {
      const { latitude, longitude } = JSON.parse(stored) as { latitude: number; longitude: number };
      const snapshot = await fetchWeatherAt(latitude, longitude, signal);
      await setSetting(CACHE_KEY, JSON.stringify(snapshot));
      return snapshot;
    } catch {
      return null;
    }
  }
  try {
    const position = await Location.getLastKnownPositionAsync()
      ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    if (!position) return null;
    const { latitude, longitude } = position.coords;
    await setSetting(COORDS_KEY, JSON.stringify({ latitude, longitude }));
    const snapshot = await fetchWeatherAt(latitude, longitude, signal);
    await setSetting(CACHE_KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export async function getWeather(signal?: AbortSignal): Promise<WeatherSnapshot | null> {
  const cached = await getCachedWeather();
  if (cached) return cached;
  return loadFreshWeather(signal);
}

export function matchesWeather(seasons: string[], weather: WeatherSnapshot): boolean {
  if (!seasons || seasons.length === 0) return true;
  const normalized = seasons.map((s) => s.trim().toLocaleLowerCase('tr-TR'));
  const match: Record<WeatherSeason, string[]> = {
    summer: ['yaz', 'summer', '4 mevsim', 'four seasons', 'all season'],
    autumn: ['sonbahar', 'autumn', 'fall', '4 mevsim', 'four seasons', 'all season', 'ilkbahar', 'spring'],
    winter: ['kış', 'kis', 'winter', '4 mevsim', 'four seasons', 'all season'],
    spring: ['ilkbahar', 'spring', '4 mevsim', 'four seasons', 'all season', 'sonbahar', 'autumn', 'fall'],
  };
  const needles = match[weather.season];
  return normalized.some((season) => needles.some((needle) => season.includes(needle)));
}
