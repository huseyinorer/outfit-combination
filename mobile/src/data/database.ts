import * as SQLite from 'expo-sqlite';
import type { ClothingDraft, ClothingItem } from '../domain/types';

type ClothingRow = Omit<
  ClothingItem,
  'secondaryColors' | 'styleTags' | 'seasons' | 'cutoutUri'
> & {
  secondaryColors: string;
  styleTags: string;
  seasons: string;
  cutoutUri: string | null;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) databasePromise = SQLite.openDatabaseAsync('outfit-combination.db');
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  const database = await db();
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS clothing_items (
      id TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('top', 'bottom', 'shoes')),
      name TEXT NOT NULL DEFAULT '',
      subType TEXT NOT NULL DEFAULT '',
      primaryColor TEXT NOT NULL DEFAULT '',
      secondaryColors TEXT NOT NULL DEFAULT '[]',
      pattern TEXT NOT NULL DEFAULT '',
      styleTags TEXT NOT NULL DEFAULT '[]',
      seasons TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      photoUri TEXT NOT NULL,
      cutoutUri TEXT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clothing_category ON clothing_items(category);
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

const safeArray = (value: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const fromRow = (row: ClothingRow): ClothingItem => ({
  ...row,
  secondaryColors: safeArray(row.secondaryColors),
  styleTags: safeArray(row.styleTags),
  seasons: safeArray(row.seasons),
});

export async function listClothing(): Promise<ClothingItem[]> {
  const database = await db();
  const rows = await database.getAllAsync<ClothingRow>(
    'SELECT * FROM clothing_items ORDER BY createdAt DESC',
  );
  return rows.map(fromRow);
}

export async function insertClothing(item: ClothingItem): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO clothing_items (
      id, category, name, subType, primaryColor, secondaryColors, pattern,
      styleTags, seasons, description, photoUri, cutoutUri, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    item.category,
    item.name,
    item.subType,
    item.primaryColor,
    JSON.stringify(item.secondaryColors),
    item.pattern,
    JSON.stringify(item.styleTags),
    JSON.stringify(item.seasons),
    item.description,
    item.photoUri,
    item.cutoutUri,
    item.createdAt,
    item.updatedAt,
  );
}

export async function updateClothing(item: ClothingItem): Promise<void> {
  const database = await db();
  await database.runAsync(
    `UPDATE clothing_items SET
      category = ?, name = ?, subType = ?, primaryColor = ?, secondaryColors = ?,
      pattern = ?, styleTags = ?, seasons = ?, description = ?, photoUri = ?,
      cutoutUri = ?, updatedAt = ? WHERE id = ?`,
    item.category,
    item.name,
    item.subType,
    item.primaryColor,
    JSON.stringify(item.secondaryColors),
    item.pattern,
    JSON.stringify(item.styleTags),
    JSON.stringify(item.seasons),
    item.description,
    item.photoUri,
    item.cutoutUri,
    item.updatedAt,
    item.id,
  );
}

export async function removeClothing(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM clothing_items WHERE id = ?', id);
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO app_settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM app_settings WHERE key = ?', key);
}

export async function getPendingDraft(): Promise<ClothingDraft | null> {
  const raw = await getSetting('pending_draft');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClothingDraft;
  } catch {
    await deleteSetting('pending_draft');
    return null;
  }
}

export async function savePendingDraft(draft: ClothingDraft | null): Promise<void> {
  if (draft) await setSetting('pending_draft', JSON.stringify(draft));
  else await deleteSetting('pending_draft');
}

