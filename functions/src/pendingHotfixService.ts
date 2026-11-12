import * as admin from 'firebase-admin';

export interface PendingHotfixData {
  chatId: number;
  promptText: string;
  photoFileId: string | null;
  voiceFileId: string | null;
  createdAt: number;
}

const COLLECTION_NAME = '_internal_bot_pending_hotfixes';
const memoryCache = new Map<string, PendingHotfixData>();

export async function savePendingHotfix(
  chatId: number,
  data: {
    promptText: string;
    photoFileId?: string | null;
    voiceFileId?: string | null;
  }
): Promise<void> {
  const item: PendingHotfixData = {
    chatId,
    promptText: data.promptText || '',
    photoFileId: data.photoFileId || null,
    voiceFileId: data.voiceFileId || null,
    createdAt: Date.now(),
  };

  // Cache in memoria immediata
  memoryCache.set(String(chatId), item);

  try {
    const db = admin.firestore();
    await db.collection(COLLECTION_NAME).doc(String(chatId)).set(item);
  } catch (err: any) {
    console.warn('[pendingHotfixService] Errore salvataggio Firestore (rimane in cache memoria):', err.message);
  }
}

export async function getPendingHotfix(chatId: number): Promise<PendingHotfixData | null> {
  const key = String(chatId);
  const fromMem = memoryCache.get(key);
  if (fromMem) {
    if (Date.now() - (fromMem.createdAt || 0) <= 30 * 60 * 1000) {
      return fromMem;
    }
    memoryCache.delete(key);
  }

  try {
    const db = admin.firestore();
    const snap = await db.collection(COLLECTION_NAME).doc(key).get();
    if (!snap.exists) return fromMem || null;
    const data = snap.data() as PendingHotfixData;
    if (Date.now() - (data.createdAt || 0) > 30 * 60 * 1000) {
      await deletePendingHotfix(chatId);
      return null;
    }
    return data;
  } catch (err: any) {
    console.warn('[pendingHotfixService] Errore lettura Firestore:', err.message);
    return fromMem || null;
  }
}

export async function deletePendingHotfix(chatId: number): Promise<void> {
  memoryCache.delete(String(chatId));
  try {
    const db = admin.firestore();
    await db.collection(COLLECTION_NAME).doc(String(chatId)).delete();
  } catch (err: any) {
    console.warn('[pendingHotfixService] Errore cancellazione doc pending:', err.message);
  }
}

