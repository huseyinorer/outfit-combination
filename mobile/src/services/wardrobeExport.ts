import * as FileSystem from 'expo-file-system/legacy';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  activeWardrobeOwner,
  initializeDatabase,
  insertClothing,
  listClothing,
  listFavoriteOutfits,
  saveFavoriteOutfit,
} from '../data/database';
import type { ClothingItem, FavoriteOutfit, OutfitSuggestion } from '../domain/types';
import { CATEGORIES } from '../domain/types';
import { reportError } from './observability';

const EXPORT_FORMAT = 'outfit-combination.wardrobe/v1';
const EXPORT_DIR_NAME = 'exports';
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

interface EncodedPhoto {
  base64: string;
  mimeType: string;
}

interface ClothingExportRecord extends Omit<ClothingItem, 'photoUri' | 'thumbnailUri' | 'cutoutUri'> {
  photo: EncodedPhoto | null;
  thumbnail: EncodedPhoto | null;
  cutout: EncodedPhoto | null;
}

interface WardrobeExportEnvelope {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  ownerId: string;
  appPlatform: string;
  clothing: ClothingExportRecord[];
  favorites: FavoriteOutfit[];
}

export interface WardrobeExportResult {
  fileUri: string;
  clothingCount: number;
  favoriteCount: number;
  bytes: number;
}

export interface WardrobeImportResult {
  insertedClothing: number;
  skippedClothing: number;
  insertedFavorites: number;
  skippedFavorites: number;
  warnings: string[];
}

function exportsDirectory(): Directory {
  const root = new Directory(Paths.document, 'outfit-combination');
  const dir = new Directory(root, EXPORT_DIR_NAME);
  root.create({ idempotent: true, intermediates: true });
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function detectMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

async function encodeFile(uri: string | null): Promise<EncodedPhoto | null> {
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return { base64, mimeType: detectMime(uri) };
  } catch (error) {
    reportError(error, { stage: 'wardrobeExport.encodeFile', uri });
    return null;
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return '.heic';
  return '.jpg';
}

async function decodeFile(
  photo: EncodedPhoto | null,
  destinationDir: Directory,
  basename: string,
): Promise<string | null> {
  if (!photo) return null;
  const extension = extensionFor(photo.mimeType);
  const safeBasename = basename.replace(/[^0-9A-Za-z._-]/g, '-');
  const destination = new File(destinationDir, `${safeBasename}${extension}`);
  if (destination.exists) destination.delete();
  await FileSystem.writeAsStringAsync(destination.uri, photo.base64, { encoding: FileSystem.EncodingType.Base64 });
  return destination.uri;
}

export async function exportWardrobe(): Promise<WardrobeExportResult> {
  await initializeDatabase();
  const clothing = await listClothing();
  const favorites = await listFavoriteOutfits();
  const ownerId = activeWardrobeOwner();

  const encoded: ClothingExportRecord[] = [];
  for (const item of clothing) {
    const [photo, thumbnail, cutout] = await Promise.all([
      encodeFile(item.photoUri),
      encodeFile(item.thumbnailUri),
      encodeFile(item.cutoutUri),
    ]);
    const { photoUri: _photo, thumbnailUri: _thumb, cutoutUri: _cutout, ...rest } = item;
    encoded.push({ ...rest, photo, thumbnail, cutout });
  }

  const envelope: WardrobeExportEnvelope = {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    ownerId,
    appPlatform: Platform.OS,
    clothing: encoded,
    favorites,
  };

  const dir = exportsDirectory();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = new File(dir, `wardrobe-${stamp}.json`);
  if (destination.exists) destination.delete();
  const serialized = JSON.stringify(envelope);
  await FileSystem.writeAsStringAsync(destination.uri, serialized, { encoding: FileSystem.EncodingType.UTF8 });

  return {
    fileUri: destination.uri,
    clothingCount: encoded.length,
    favoriteCount: favorites.length,
    bytes: serialized.length,
  };
}

function parseEnvelope(raw: string): WardrobeExportEnvelope {
  const value = JSON.parse(raw) as Partial<WardrobeExportEnvelope>;
  if (value.format !== EXPORT_FORMAT) throw new Error('Desteklenmeyen dolap aktarım biçimi.');
  if (!Array.isArray(value.clothing)) throw new Error('Dolap aktarım dosyasında kıyafet listesi eksik.');
  if (!Array.isArray(value.favorites)) throw new Error('Dolap aktarım dosyasında favori listesi eksik.');
  return value as WardrobeExportEnvelope;
}

function isValidClothing(record: ClothingExportRecord): boolean {
  return typeof record.id === 'string'
    && record.id.length > 0
    && (CATEGORIES as readonly string[]).includes(record.category)
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

export async function importWardrobe(fileUri: string): Promise<WardrobeImportResult> {
  await initializeDatabase();
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) throw new Error('Aktarım dosyası bulunamadı.');
  const size = (info as { size?: number }).size ?? 0;
  if (size > MAX_IMPORT_BYTES) throw new Error('Aktarım dosyası çok büyük (üst sınır 200 MB).');

  const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
  const envelope = parseEnvelope(raw);

  const existing = await listClothing();
  const existingIds = new Set(existing.map((item) => item.id));

  const wardrobeDir = new Directory(Paths.document, 'outfit-combination', 'wardrobe');
  const thumbnailsDir = new Directory(Paths.document, 'outfit-combination', 'thumbnails');
  const cutoutsDir = new Directory(Paths.document, 'outfit-combination', 'cutouts');
  for (const dir of [wardrobeDir, thumbnailsDir, cutoutsDir]) {
    dir.create({ idempotent: true, intermediates: true });
  }

  const result: WardrobeImportResult = {
    insertedClothing: 0,
    skippedClothing: 0,
    insertedFavorites: 0,
    skippedFavorites: 0,
    warnings: [],
  };

  for (const record of envelope.clothing) {
    if (!isValidClothing(record)) {
      result.skippedClothing += 1;
      result.warnings.push(`Geçersiz kayıt atlandı: ${record.id ?? 'id?'}`);
      continue;
    }
    if (existingIds.has(record.id)) {
      result.skippedClothing += 1;
      continue;
    }
    try {
      const photoUri = await decodeFile(record.photo, wardrobeDir, record.id);
      if (!photoUri) {
        result.skippedClothing += 1;
        result.warnings.push(`Fotoğraf çözülemedi: ${record.id}`);
        continue;
      }
      const thumbnailUri = await decodeFile(record.thumbnail, thumbnailsDir, record.id);
      const cutoutUri = await decodeFile(record.cutout, cutoutsDir, record.id);
      const { photo: _p, thumbnail: _t, cutout: _c, ...rest } = record;
      const item: ClothingItem = {
        ...rest,
        photoUri,
        thumbnailUri,
        cutoutUri,
      };
      await insertClothing(item);
      existingIds.add(item.id);
      result.insertedClothing += 1;
    } catch (error) {
      reportError(error, { stage: 'wardrobeImport.clothing', id: record.id });
      result.skippedClothing += 1;
      result.warnings.push(`Kayıt eklenemedi: ${record.id}`);
    }
  }

  for (const favorite of envelope.favorites) {
    if (!existingIds.has(favorite.topId)
      || !existingIds.has(favorite.bottomId)
      || !existingIds.has(favorite.shoeId)) {
      result.skippedFavorites += 1;
      continue;
    }
    try {
      const suggestion: OutfitSuggestion = {
        title: favorite.title,
        topId: favorite.topId,
        bottomId: favorite.bottomId,
        shoeId: favorite.shoeId,
        reason: favorite.reason,
        source: favorite.source,
      };
      await saveFavoriteOutfit(suggestion);
      result.insertedFavorites += 1;
    } catch (error) {
      reportError(error, { stage: 'wardrobeImport.favorite', id: favorite.id });
      result.skippedFavorites += 1;
    }
  }

  return result;
}

export const wardrobeExportInternals = {
  EXPORT_FORMAT,
  parseEnvelope,
  isValidClothing,
};
