import * as SQLite from 'expo-sqlite';
import type { ClothingAttributes, ClothingDraft, ClothingItem, CorrectionRule, FavoriteOutfit, OutfitSuggestion } from '../domain/types';

type ClothingRow = Omit<
  ClothingItem,
  'secondaryColors' | 'styleTags' | 'seasons' | 'cutoutUri' | 'thumbnailUri'
> & {
  secondaryColors: string;
  styleTags: string;
  seasons: string;
  cutoutUri: string | null;
  thumbnailUri: string | null;
  deletedAt: string | null;
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
      thumbnailUri TEXT NULL,
      cutoutUri TEXT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      deletedAt TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clothing_category ON clothing_items(category);
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS favorite_outfits (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      topId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      bottomId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      shoeId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      source TEXT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(topId, bottomId, shoeId)
    );
    CREATE INDEX IF NOT EXISTS idx_favorite_created ON favorite_outfits(createdAt DESC);
    CREATE TABLE IF NOT EXISTS ai_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      field TEXT NOT NULL,
      originalValue TEXT NOT NULL,
      correctedValue TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_corrections_lookup
      ON ai_corrections(category, field, originalValue, correctedValue);
  `);

  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(clothing_items)');
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('thumbnailUri')) await database.execAsync('ALTER TABLE clothing_items ADD COLUMN thumbnailUri TEXT NULL;');
  if (!names.has('deletedAt')) await database.execAsync('ALTER TABLE clothing_items ADD COLUMN deletedAt TEXT NULL;');
  await database.execAsync('CREATE INDEX IF NOT EXISTS idx_clothing_deleted ON clothing_items(deletedAt);');
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
    'SELECT * FROM clothing_items WHERE deletedAt IS NULL ORDER BY createdAt DESC',
  );
  return rows.map(fromRow);
}

export async function insertClothing(item: ClothingItem): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO clothing_items (
      id, category, name, subType, primaryColor, secondaryColors, pattern,
      styleTags, seasons, description, photoUri, thumbnailUri, cutoutUri, createdAt, updatedAt, deletedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
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
    item.thumbnailUri,
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
      thumbnailUri = ?, cutoutUri = ?, updatedAt = ? WHERE id = ?`,
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
    item.thumbnailUri,
    item.cutoutUri,
    item.updatedAt,
    item.id,
  );
}

export async function removeClothing(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM clothing_items WHERE id = ?', id);
}

export async function softDeleteClothing(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('UPDATE clothing_items SET deletedAt = ? WHERE id = ?', new Date().toISOString(), id);
}

export async function restoreClothing(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('UPDATE clothing_items SET deletedAt = NULL WHERE id = ?', id);
}

export async function listDeletedClothing(): Promise<ClothingItem[]> {
  const database = await db();
  const rows = await database.getAllAsync<ClothingRow>(
    'SELECT * FROM clothing_items WHERE deletedAt IS NOT NULL ORDER BY deletedAt ASC',
  );
  return rows.map(fromRow);
}

export async function listFavoriteOutfits(): Promise<FavoriteOutfit[]> {
  const database = await db();
  return database.getAllAsync<FavoriteOutfit>(
    `SELECT f.* FROM favorite_outfits f
     JOIN clothing_items t ON t.id = f.topId AND t.deletedAt IS NULL
     JOIN clothing_items b ON b.id = f.bottomId AND b.deletedAt IS NULL
     JOIN clothing_items s ON s.id = f.shoeId AND s.deletedAt IS NULL
     ORDER BY f.createdAt DESC`,
  );
}

export async function saveFavoriteOutfit(suggestion: OutfitSuggestion): Promise<void> {
  const database = await db();
  const id = `${suggestion.topId}|${suggestion.bottomId}|${suggestion.shoeId}`;
  await database.runAsync(
    `INSERT INTO favorite_outfits(id, title, topId, bottomId, shoeId, reason, source, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(topId, bottomId, shoeId) DO UPDATE SET
       title = excluded.title, reason = excluded.reason, source = excluded.source`,
    id,
    suggestion.title,
    suggestion.topId,
    suggestion.bottomId,
    suggestion.shoeId,
    suggestion.reason,
    suggestion.source ?? null,
    new Date().toISOString(),
  );
}

export async function removeFavoriteOutfit(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM favorite_outfits WHERE id = ?', id);
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

export async function getPendingQueue(): Promise<ClothingDraft[]> {
  const raw = await getSetting('pending_queue');
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ClothingDraft[] : [];
  } catch {
    await deleteSetting('pending_queue');
    return [];
  }
}

export async function savePendingQueue(queue: ClothingDraft[]): Promise<void> {
  if (queue.length > 0) await setSetting('pending_queue', JSON.stringify(queue));
  else await deleteSetting('pending_queue');
}

const correctionFields = ['name', 'subType', 'primaryColor', 'pattern'] as const;

export async function recordAiCorrections(
  category: ClothingItem['category'],
  ai: ClothingAttributes | null | undefined,
  corrected: ClothingAttributes,
): Promise<void> {
  if (!ai) return;
  const database = await db();
  const now = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    for (const field of correctionFields) {
      const originalValue = ai[field].trim();
      const correctedValue = corrected[field].trim();
      if (!originalValue || !correctedValue || originalValue.localeCompare(correctedValue, 'tr', { sensitivity: 'accent' }) === 0) continue;
      await database.runAsync(
        'INSERT INTO ai_corrections(category, field, originalValue, correctedValue, createdAt) VALUES (?, ?, ?, ?, ?)',
        category,
        field,
        originalValue,
        correctedValue,
        now,
      );
    }
  });
}

export async function listCorrectionRules(category: ClothingItem['category']): Promise<CorrectionRule[]> {
  const database = await db();
  return database.getAllAsync<CorrectionRule>(
    `SELECT category, field, originalValue, correctedValue, COUNT(*) AS occurrences
     FROM ai_corrections
     WHERE category = ?
     GROUP BY category, field, originalValue, correctedValue
     HAVING COUNT(*) >= 2
     ORDER BY occurrences DESC`,
    category,
  );
}

export async function clearAllUserData(): Promise<void> {
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM favorite_outfits');
    await database.runAsync('DELETE FROM clothing_items');
    await database.runAsync('DELETE FROM ai_corrections');
    await database.runAsync('DELETE FROM app_settings');
  });
}

