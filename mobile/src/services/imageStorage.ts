import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const root = new Directory(Paths.document, 'outfit-combination');
const pending = new Directory(root, 'pending');
const wardrobe = new Directory(root, 'wardrobe');
const thumbnails = new Directory(root, 'thumbnails');

function ensureDirectories(): void {
  root.create({ idempotent: true, intermediates: true });
  pending.create({ idempotent: true, intermediates: true });
  wardrobe.create({ idempotent: true, intermediates: true });
  thumbnails.create({ idempotent: true, intermediates: true });
}

export async function prepareSelectedImage(sourceUri: string, draftId: string): Promise<string> {
  ensureDirectories();
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: 1600, height: null });
  const rendered = await context.renderAsync();
  const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  const source = new File(normalized.uri);
  const destination = new File(pending, `${draftId}.jpg`);
  if (destination.exists) destination.delete();
  await source.copy(destination);
  return destination.uri;
}

export async function finalizeImage(pendingUri: string, clothingId: string): Promise<string> {
  ensureDirectories();
  const source = new File(pendingUri);
  const destination = new File(wardrobe, `${clothingId}.jpg`);
  if (destination.exists) destination.delete();
  await source.copy(destination);
  return destination.uri;
}

export async function createThumbnail(photoUri: string, clothingId: string): Promise<string> {
  ensureDirectories();
  const context = ImageManipulator.manipulate(photoUri);
  context.resize({ width: 420, height: null });
  const rendered = await context.renderAsync();
  const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.72 });
  const source = new File(normalized.uri);
  const destination = new File(thumbnails, `${clothingId}.jpg`);
  if (destination.exists) destination.delete();
  await source.copy(destination);
  return destination.uri;
}

export function deleteStoredImage(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Veritabanı kaydının silinmesini bozuk/eski bir dosya yolu engellemesin.
  }
}

export function deleteAllStoredImages(): void {
  if (root.exists) root.delete();
}

export function imageContentHash(uri: string): string | null {
  try {
    const file = new File(uri);
    return file.exists ? file.md5 : null;
  } catch {
    return null;
  }
}

