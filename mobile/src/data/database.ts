import * as SQLite from 'expo-sqlite';
import type {
  ClothingAttributes,
  ClothingDraft,
  ClothingItem,
  CorrectionRule,
  FavoriteOutfit,
  OutfitFeedbackValue,
  OutfitPreferences,
  OutfitSuggestion,
  SuggestedOutfitHistoryEntry,
  WornOutfit,
} from '../domain/types';

type ClothingRow = Omit<
  ClothingItem,
  'secondaryColors' | 'styleTags' | 'seasons' | 'cutoutUri' | 'thumbnailUri' | 'price' | 'currency'
> & {
  secondaryColors: string;
  styleTags: string;
  seasons: string;
  cutoutUri: string | null;
  thumbnailUri: string | null;
  photoHash: string | null;
  price: number | null;
  currency: string | null;
  deletedAt: string | null;
  ownerId: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const LOCAL_OWNER = 'local';
let activeOwnerId = LOCAL_OWNER;

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
      ownerId TEXT NOT NULL DEFAULT 'local',
      category TEXT NOT NULL,
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
      photoHash TEXT NULL,
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
      ownerId TEXT NOT NULL DEFAULT 'local',
      title TEXT NOT NULL,
      topId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      bottomId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      shoeId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      hatId TEXT NULL REFERENCES clothing_items(id) ON DELETE SET NULL,
      accessoryId TEXT NULL REFERENCES clothing_items(id) ON DELETE SET NULL,
      outerwearId TEXT NULL REFERENCES clothing_items(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      source TEXT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(topId, bottomId, shoeId)
    );
    CREATE INDEX IF NOT EXISTS idx_favorite_created ON favorite_outfits(createdAt DESC);
    CREATE TABLE IF NOT EXISTS ai_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ownerId TEXT NOT NULL DEFAULT 'local',
      category TEXT NOT NULL,
      field TEXT NOT NULL,
      originalValue TEXT NOT NULL,
      correctedValue TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_corrections_lookup
      ON ai_corrections(category, field, originalValue, correctedValue);
    CREATE TABLE IF NOT EXISTS outfit_feedback (
      ownerId TEXT NOT NULL,
      topId TEXT NOT NULL,
      bottomId TEXT NOT NULL,
      shoeId TEXT NOT NULL,
      value TEXT NOT NULL CHECK(value IN ('like', 'dislike')),
      createdAt TEXT NOT NULL,
      PRIMARY KEY(ownerId, topId, bottomId, shoeId)
    );
    CREATE TABLE IF NOT EXISTS worn_outfits (
      id TEXT PRIMARY KEY NOT NULL,
      ownerId TEXT NOT NULL,
      title TEXT NOT NULL,
      topId TEXT NOT NULL,
      bottomId TEXT NOT NULL,
      shoeId TEXT NOT NULL,
      hatId TEXT NULL,
      accessoryId TEXT NULL,
      outerwearId TEXT NULL,
      reason TEXT NOT NULL,
      source TEXT NULL,
      wornAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_worn_owner_date ON worn_outfits(ownerId, wornAt DESC);
    CREATE TABLE IF NOT EXISTS suggestion_history (
      id TEXT PRIMARY KEY NOT NULL,
      batchId TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      title TEXT NOT NULL,
      topId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      bottomId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      shoeId TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
      hatId TEXT NULL REFERENCES clothing_items(id) ON DELETE SET NULL,
      accessoryId TEXT NULL REFERENCES clothing_items(id) ON DELETE SET NULL,
      outerwearId TEXT NULL REFERENCES clothing_items(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      source TEXT NULL,
      destination TEXT NOT NULL,
      look TEXT NOT NULL,
      tone TEXT NOT NULL,
      suggestedAt TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_suggestion_history_owner_date
      ON suggestion_history(ownerId, suggestedAt DESC, position ASC);
    CREATE INDEX IF NOT EXISTS idx_suggestion_history_owner_batch
      ON suggestion_history(ownerId, batchId);
  `);

  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(clothing_items)');
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('thumbnailUri')) await database.execAsync('ALTER TABLE clothing_items ADD COLUMN thumbnailUri TEXT NULL;');
  if (!names.has('deletedAt')) await database.execAsync('ALTER TABLE clothing_items ADD COLUMN deletedAt TEXT NULL;');
  if (!names.has('ownerId')) await database.execAsync("ALTER TABLE clothing_items ADD COLUMN ownerId TEXT NOT NULL DEFAULT 'local';");
  if (!names.has('photoHash')) await database.execAsync('ALTER TABLE clothing_items ADD COLUMN photoHash TEXT NULL;');
  if (!names.has('price')) await database.execAsync('ALTER TABLE clothing_items ADD COLUMN price REAL NULL;');
  if (!names.has('currency')) await database.execAsync('ALTER TABLE clothing_items ADD COLUMN currency TEXT NULL;');

  const favoriteColumns = new Set((await database.getAllAsync<{ name: string }>('PRAGMA table_info(favorite_outfits)')).map((column) => column.name));
  if (!favoriteColumns.has('ownerId')) await database.execAsync("ALTER TABLE favorite_outfits ADD COLUMN ownerId TEXT NOT NULL DEFAULT 'local';");
  const correctionColumns = new Set((await database.getAllAsync<{ name: string }>('PRAGMA table_info(ai_corrections)')).map((column) => column.name));
  if (!correctionColumns.has('ownerId')) await database.execAsync("ALTER TABLE ai_corrections ADD COLUMN ownerId TEXT NOT NULL DEFAULT 'local';");

  for (const table of ['favorite_outfits', 'worn_outfits', 'suggestion_history'] as const) {
    const cols = new Set((await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((column) => column.name));
    if (!cols.has('hatId')) await database.execAsync(`ALTER TABLE ${table} ADD COLUMN hatId TEXT NULL;`);
    if (!cols.has('accessoryId')) await database.execAsync(`ALTER TABLE ${table} ADD COLUMN accessoryId TEXT NULL;`);
    if (!cols.has('outerwearId')) await database.execAsync(`ALTER TABLE ${table} ADD COLUMN outerwearId TEXT NULL;`);
  }

  // Drop the legacy CHECK(category IN ('top','bottom','shoes')) by rebuilding the table.
  // This is a no-op once the constraint is gone.
  const legacy = await database.getFirstAsync<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='clothing_items'",
  );
  if (legacy?.sql && /CHECK\s*\(\s*category\s+IN\s*\(\s*'top'/i.test(legacy.sql)) {
    await database.execAsync(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;
      ALTER TABLE clothing_items RENAME TO clothing_items_legacy;
      CREATE TABLE clothing_items (
        id TEXT PRIMARY KEY NOT NULL,
        ownerId TEXT NOT NULL DEFAULT 'local',
        category TEXT NOT NULL,
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
        photoHash TEXT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT NULL
      );
      INSERT INTO clothing_items (
        id, ownerId, category, name, subType, primaryColor, secondaryColors,
        pattern, styleTags, seasons, description, photoUri, thumbnailUri,
        cutoutUri, photoHash, createdAt, updatedAt, deletedAt
      )
      SELECT id, ownerId, category, name, subType, primaryColor, secondaryColors,
        pattern, styleTags, seasons, description, photoUri, thumbnailUri,
        cutoutUri, photoHash, createdAt, updatedAt, deletedAt
      FROM clothing_items_legacy;
      DROP TABLE clothing_items_legacy;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  await database.execAsync(`
    DROP INDEX IF EXISTS idx_clothing_category;
    DROP INDEX IF EXISTS idx_corrections_lookup;
    CREATE INDEX IF NOT EXISTS idx_clothing_category ON clothing_items(ownerId, category);
    CREATE INDEX IF NOT EXISTS idx_clothing_deleted ON clothing_items(ownerId, deletedAt);
    CREATE INDEX IF NOT EXISTS idx_clothing_photo_hash ON clothing_items(ownerId, photoHash);
    CREATE INDEX IF NOT EXISTS idx_favorite_owner_created ON favorite_outfits(ownerId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_corrections_lookup ON ai_corrections(ownerId, category, field, originalValue, correctedValue);
    INSERT OR IGNORE INTO app_settings(key, value)
      SELECT 'pending_draft:local', value FROM app_settings WHERE key = 'pending_draft';
    INSERT OR IGNORE INTO app_settings(key, value)
      SELECT 'pending_queue:local', value FROM app_settings WHERE key = 'pending_queue';
    DELETE FROM app_settings WHERE key IN ('pending_draft', 'pending_queue');
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

const fromRow = (row: ClothingRow): ClothingItem => {
  const { ownerId: _ownerId, deletedAt: _deletedAt, ...item } = row;
  return {
    ...item,
    secondaryColors: safeArray(row.secondaryColors),
    styleTags: safeArray(row.styleTags),
    seasons: safeArray(row.seasons),
    price: row.price ?? null,
    currency: row.currency ?? null,
  };
};

const scopedSettingKey = (key: string) => `${key}:${activeOwnerId}`;

export function activeWardrobeOwner(): string {
  return activeOwnerId;
}

export async function activateWardrobeOwner(
  userId: string | null,
  claimExistingLocalWardrobe = false,
): Promise<{ ownerId: string; claimedLocalWardrobe: boolean }> {
  const database = await db();
  const nextOwner = userId ? `account:${userId}` : LOCAL_OWNER;
  let claimedLocalWardrobe = false;

  if (userId && claimExistingLocalWardrobe) {
    const claim = await getSetting('local_wardrobe_claimed_by');
    if (!claim) {
      const localCount = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM clothing_items WHERE ownerId = ?',
        LOCAL_OWNER,
      );
      const accountCount = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM clothing_items WHERE ownerId = ?',
        nextOwner,
      );
      if ((localCount?.count ?? 0) > 0 && (accountCount?.count ?? 0) === 0) {
        await database.withTransactionAsync(async () => {
          await database.runAsync('UPDATE clothing_items SET ownerId = ? WHERE ownerId = ?', nextOwner, LOCAL_OWNER);
          await database.runAsync('UPDATE favorite_outfits SET ownerId = ? WHERE ownerId = ?', nextOwner, LOCAL_OWNER);
          await database.runAsync('UPDATE ai_corrections SET ownerId = ? WHERE ownerId = ?', nextOwner, LOCAL_OWNER);
          await database.runAsync('UPDATE outfit_feedback SET ownerId = ? WHERE ownerId = ?', nextOwner, LOCAL_OWNER);
          await database.runAsync('UPDATE worn_outfits SET ownerId = ? WHERE ownerId = ?', nextOwner, LOCAL_OWNER);
          await database.runAsync('UPDATE suggestion_history SET ownerId = ? WHERE ownerId = ?', nextOwner, LOCAL_OWNER);
          for (const key of ['pending_draft', 'pending_queue']) {
            await database.runAsync(
              `INSERT OR REPLACE INTO app_settings(key, value)
               SELECT ?, value FROM app_settings WHERE key = ?`,
              `${key}:${nextOwner}`,
              `${key}:${LOCAL_OWNER}`,
            );
            await database.runAsync('DELETE FROM app_settings WHERE key = ?', `${key}:${LOCAL_OWNER}`);
          }
          await database.runAsync(
            `INSERT INTO app_settings(key, value) VALUES ('local_wardrobe_claimed_by', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            userId,
          );
        });
        claimedLocalWardrobe = true;
      } else {
        await setSetting('local_wardrobe_claimed_by', userId);
      }
    }
  }

  activeOwnerId = nextOwner;
  return { ownerId: nextOwner, claimedLocalWardrobe };
}

export async function moveAccountWardrobeToLocal(userId: string): Promise<void> {
  const database = await db();
  const sourceOwner = `account:${userId}`;
  await database.withTransactionAsync(async () => {
    await database.runAsync('UPDATE clothing_items SET ownerId = ? WHERE ownerId = ?', LOCAL_OWNER, sourceOwner);
    await database.runAsync('UPDATE favorite_outfits SET ownerId = ? WHERE ownerId = ?', LOCAL_OWNER, sourceOwner);
    await database.runAsync('UPDATE ai_corrections SET ownerId = ? WHERE ownerId = ?', LOCAL_OWNER, sourceOwner);
    await database.runAsync('UPDATE outfit_feedback SET ownerId = ? WHERE ownerId = ?', LOCAL_OWNER, sourceOwner);
    await database.runAsync('UPDATE worn_outfits SET ownerId = ? WHERE ownerId = ?', LOCAL_OWNER, sourceOwner);
    await database.runAsync('UPDATE suggestion_history SET ownerId = ? WHERE ownerId = ?', LOCAL_OWNER, sourceOwner);
    for (const key of ['pending_draft', 'pending_queue']) {
      const localKey = `${key}:${LOCAL_OWNER}`;
      const sourceKey = `${key}:${sourceOwner}`;
      const localPending = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?',
        localKey,
      );
      if (!localPending) {
        await database.runAsync(
          `INSERT OR IGNORE INTO app_settings(key, value)
           SELECT ?, value FROM app_settings WHERE key = ?`,
          localKey,
          sourceKey,
        );
        await database.runAsync('DELETE FROM app_settings WHERE key = ?', sourceKey);
      }
    }
    await database.runAsync("DELETE FROM app_settings WHERE key = 'local_wardrobe_claimed_by'");
  });
  activeOwnerId = LOCAL_OWNER;
}

export async function listClothing(): Promise<ClothingItem[]> {
  const database = await db();
  const rows = await database.getAllAsync<ClothingRow>(
    'SELECT * FROM clothing_items WHERE ownerId = ? AND deletedAt IS NULL ORDER BY createdAt DESC',
    activeOwnerId,
  );
  return rows.map(fromRow);
}

export async function insertClothing(item: ClothingItem): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO clothing_items (
      id, ownerId, category, name, subType, primaryColor, secondaryColors, pattern,
      styleTags, seasons, description, photoUri, thumbnailUri, cutoutUri, photoHash, price, currency, createdAt, updatedAt, deletedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    item.id,
    activeOwnerId,
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
    item.photoHash ?? null,
    item.price ?? null,
    item.currency ?? null,
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
      thumbnailUri = ?, cutoutUri = ?, photoHash = ?, price = ?, currency = ?, updatedAt = ? WHERE id = ? AND ownerId = ?`,
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
    item.photoHash ?? null,
    item.price ?? null,
    item.currency ?? null,
    item.updatedAt,
    item.id,
    activeOwnerId,
  );
}

export async function removeClothing(id: string): Promise<void> {
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      'DELETE FROM outfit_feedback WHERE ownerId = ? AND (topId = ? OR bottomId = ? OR shoeId = ?)',
      activeOwnerId, id, id, id,
    );
    await database.runAsync(
      'DELETE FROM worn_outfits WHERE ownerId = ? AND (topId = ? OR bottomId = ? OR shoeId = ?)',
      activeOwnerId, id, id, id,
    );
    await database.runAsync(
      'DELETE FROM suggestion_history WHERE ownerId = ? AND (topId = ? OR bottomId = ? OR shoeId = ?)',
      activeOwnerId, id, id, id,
    );
    await database.runAsync('DELETE FROM clothing_items WHERE id = ? AND ownerId = ?', id, activeOwnerId);
  });
}

export async function softDeleteClothing(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('UPDATE clothing_items SET deletedAt = ? WHERE id = ? AND ownerId = ?', new Date().toISOString(), id, activeOwnerId);
}

export async function restoreClothing(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('UPDATE clothing_items SET deletedAt = NULL WHERE id = ? AND ownerId = ?', id, activeOwnerId);
}

export async function listDeletedClothing(): Promise<ClothingItem[]> {
  const database = await db();
  const rows = await database.getAllAsync<ClothingRow>(
    'SELECT * FROM clothing_items WHERE ownerId = ? AND deletedAt IS NOT NULL ORDER BY deletedAt ASC',
    activeOwnerId,
  );
  return rows.map(fromRow);
}

export async function listFavoriteOutfits(): Promise<FavoriteOutfit[]> {
  const database = await db();
  return database.getAllAsync<FavoriteOutfit>(
    `SELECT f.* FROM favorite_outfits f
     JOIN clothing_items t ON t.id = f.topId AND t.ownerId = f.ownerId AND t.deletedAt IS NULL
     JOIN clothing_items b ON b.id = f.bottomId AND b.ownerId = f.ownerId AND b.deletedAt IS NULL
     JOIN clothing_items s ON s.id = f.shoeId AND s.ownerId = f.ownerId AND s.deletedAt IS NULL
     WHERE f.ownerId = ?
     ORDER BY f.createdAt DESC`,
    activeOwnerId,
  );
}

export async function saveFavoriteOutfit(suggestion: OutfitSuggestion): Promise<void> {
  const database = await db();
  const id = `${activeOwnerId}|${suggestion.topId}|${suggestion.bottomId}|${suggestion.shoeId}`;
  await database.runAsync(
    `INSERT INTO favorite_outfits(id, ownerId, title, topId, bottomId, shoeId, hatId, accessoryId, outerwearId, reason, source, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(topId, bottomId, shoeId) DO UPDATE SET
       title = excluded.title, reason = excluded.reason, source = excluded.source, ownerId = excluded.ownerId,
       hatId = excluded.hatId, accessoryId = excluded.accessoryId, outerwearId = excluded.outerwearId`,
    id,
    activeOwnerId,
    suggestion.title,
    suggestion.topId,
    suggestion.bottomId,
    suggestion.shoeId,
    suggestion.hatId ?? null,
    suggestion.accessoryId ?? null,
    suggestion.outerwearId ?? null,
    suggestion.reason,
    suggestion.source ?? null,
    new Date().toISOString(),
  );
}

export async function removeFavoriteOutfit(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM favorite_outfits WHERE id = ? AND ownerId = ?', id, activeOwnerId);
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
  const raw = await getSetting(scopedSettingKey('pending_draft'));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClothingDraft;
  } catch {
    await deleteSetting(scopedSettingKey('pending_draft'));
    return null;
  }
}

export async function savePendingDraft(draft: ClothingDraft | null): Promise<void> {
  const key = scopedSettingKey('pending_draft');
  if (draft) await setSetting(key, JSON.stringify(draft));
  else await deleteSetting(key);
}

export async function getPendingQueue(): Promise<ClothingDraft[]> {
  const raw = await getSetting(scopedSettingKey('pending_queue'));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ClothingDraft[] : [];
  } catch {
    await deleteSetting(scopedSettingKey('pending_queue'));
    return [];
  }
}

export async function savePendingQueue(queue: ClothingDraft[]): Promise<void> {
  const key = scopedSettingKey('pending_queue');
  if (queue.length > 0) await setSetting(key, JSON.stringify(queue));
  else await deleteSetting(key);
}

export async function clearPendingClothing(): Promise<void> {
  const database = await db();
  await database.runAsync(
    'DELETE FROM app_settings WHERE key IN (?, ?)',
    scopedSettingKey('pending_draft'),
    scopedSettingKey('pending_queue'),
  );
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
        'INSERT INTO ai_corrections(ownerId, category, field, originalValue, correctedValue, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        activeOwnerId,
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
     WHERE ownerId = ? AND category = ?
     GROUP BY category, field, originalValue, correctedValue
     HAVING COUNT(*) >= 2
     ORDER BY occurrences DESC`,
    activeOwnerId,
    category,
  );
}

export async function findClothingByPhotoHash(photoHash: string): Promise<ClothingItem | null> {
  const database = await db();
  const row = await database.getFirstAsync<ClothingRow>(
    'SELECT * FROM clothing_items WHERE ownerId = ? AND photoHash = ? AND deletedAt IS NULL LIMIT 1',
    activeOwnerId,
    photoHash,
  );
  return row ? fromRow(row) : null;
}

export async function setOutfitFeedback(
  suggestion: OutfitSuggestion,
  value: OutfitFeedbackValue,
): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO outfit_feedback(ownerId, topId, bottomId, shoeId, value, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(ownerId, topId, bottomId, shoeId) DO UPDATE SET
       value = excluded.value, createdAt = excluded.createdAt`,
    activeOwnerId,
    suggestion.topId,
    suggestion.bottomId,
    suggestion.shoeId,
    value,
    new Date().toISOString(),
  );
}

export async function getOutfitFeedback(suggestion: OutfitSuggestion): Promise<OutfitFeedbackValue | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ value: OutfitFeedbackValue }>(
    `SELECT value FROM outfit_feedback
     WHERE ownerId = ? AND topId = ? AND bottomId = ? AND shoeId = ?`,
    activeOwnerId,
    suggestion.topId,
    suggestion.bottomId,
    suggestion.shoeId,
  );
  return row?.value ?? null;
}

export async function listDislikedOutfitKeys(): Promise<Set<string>> {
  const database = await db();
  const rows = await database.getAllAsync<{ topId: string; bottomId: string; shoeId: string }>(
    `SELECT topId, bottomId, shoeId FROM outfit_feedback
     WHERE ownerId = ? AND value = 'dislike'`,
    activeOwnerId,
  );
  return new Set(rows.map((row) => `${row.topId}|${row.bottomId}|${row.shoeId}`));
}

export async function markOutfitWorn(suggestion: OutfitSuggestion, wornAt = new Date()): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO worn_outfits(id, ownerId, title, topId, bottomId, shoeId, hatId, accessoryId, outerwearId, reason, source, wornAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `${activeOwnerId}|${wornAt.toISOString()}|${suggestion.topId}|${suggestion.bottomId}|${suggestion.shoeId}`,
    activeOwnerId,
    suggestion.title,
    suggestion.topId,
    suggestion.bottomId,
    suggestion.shoeId,
    suggestion.hatId ?? null,
    suggestion.accessoryId ?? null,
    suggestion.outerwearId ?? null,
    suggestion.reason,
    suggestion.source ?? null,
    wornAt.toISOString(),
  );
}

export async function listWornOutfits(limit = 30): Promise<WornOutfit[]> {
  const database = await db();
  return database.getAllAsync<WornOutfit>(
    `SELECT id, title, topId, bottomId, shoeId, hatId, accessoryId, outerwearId, reason, source, wornAt
     FROM worn_outfits WHERE ownerId = ? ORDER BY wornAt DESC LIMIT ?`,
    activeOwnerId,
    Math.max(1, Math.min(limit, 200)),
  );
}

type SuggestionHistoryRow = Omit<SuggestedOutfitHistoryEntry, 'preferences'> & OutfitPreferences;

export async function saveSuggestionHistory(
  suggestions: OutfitSuggestion[],
  preferences: OutfitPreferences,
  suggestedAt = new Date(),
): Promise<string | null> {
  if (suggestions.length === 0) return null;
  const database = await db();
  const iso = suggestedAt.toISOString();
  const batchId = `${activeOwnerId}|${iso}|${Math.random().toString(36).slice(2, 10)}`;
  await database.withTransactionAsync(async () => {
    for (const [position, suggestion] of suggestions.entries()) {
      await database.runAsync(
        `INSERT INTO suggestion_history(
          id, batchId, ownerId, title, topId, bottomId, shoeId, hatId, accessoryId, outerwearId, reason, source,
          destination, look, tone, suggestedAt, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${batchId}|${position}`,
        batchId,
        activeOwnerId,
        suggestion.title,
        suggestion.topId,
        suggestion.bottomId,
        suggestion.shoeId,
        suggestion.hatId ?? null,
        suggestion.accessoryId ?? null,
        suggestion.outerwearId ?? null,
        suggestion.reason,
        suggestion.source ?? null,
        preferences.destination,
        preferences.look,
        preferences.tone,
        iso,
        position,
      );
    }
  });
  return batchId;
}

export async function listSuggestionHistory(batchLimit = 50): Promise<SuggestedOutfitHistoryEntry[]> {
  const database = await db();
  const rows = await database.getAllAsync<SuggestionHistoryRow>(
    `SELECT id, batchId, title, topId, bottomId, shoeId, hatId, accessoryId, outerwearId, reason, source,
       destination, look, tone, suggestedAt, position
     FROM suggestion_history
     WHERE ownerId = ? AND batchId IN (
       SELECT batchId FROM suggestion_history
       WHERE ownerId = ?
       GROUP BY batchId
       ORDER BY MAX(suggestedAt) DESC
       LIMIT ?
     )
     ORDER BY suggestedAt DESC, position ASC`,
    activeOwnerId,
    activeOwnerId,
    Math.max(1, Math.min(batchLimit, 100)),
  );
  return rows.map(({ destination, look, tone, ...entry }) => ({
    ...entry,
    preferences: { destination, look, tone },
  }));
}

export async function countWornByClothing(): Promise<Map<string, number>> {
  const database = await db();
  const rows = await database.getAllAsync<{ clothingId: string; wears: number }>(
    `SELECT clothingId, COUNT(*) AS wears FROM (
       SELECT topId AS clothingId FROM worn_outfits WHERE ownerId = ?
       UNION ALL SELECT bottomId FROM worn_outfits WHERE ownerId = ?
       UNION ALL SELECT shoeId FROM worn_outfits WHERE ownerId = ?
       UNION ALL SELECT hatId FROM worn_outfits WHERE ownerId = ? AND hatId IS NOT NULL
       UNION ALL SELECT accessoryId FROM worn_outfits WHERE ownerId = ? AND accessoryId IS NOT NULL
       UNION ALL SELECT outerwearId FROM worn_outfits WHERE ownerId = ? AND outerwearId IS NOT NULL
     )
     GROUP BY clothingId`,
    activeOwnerId, activeOwnerId, activeOwnerId, activeOwnerId, activeOwnerId, activeOwnerId,
  );
  return new Map(rows.map((row) => [row.clothingId, row.wears]));
}

export async function clearAllUserData(): Promise<void> {
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM outfit_feedback');
    await database.runAsync('DELETE FROM worn_outfits');
    await database.runAsync('DELETE FROM suggestion_history');
    await database.runAsync('DELETE FROM favorite_outfits');
    await database.runAsync('DELETE FROM clothing_items');
    await database.runAsync('DELETE FROM ai_corrections');
    await database.runAsync('DELETE FROM app_settings');
  });
}

