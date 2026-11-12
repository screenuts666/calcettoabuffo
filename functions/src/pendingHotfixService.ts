import * as admin from 'firebase-admin';

export interface PendingHotfixData {
  chatId: number;
  promptText: string;
  photoFileId: string | null;
  voiceFileId: string | null;
  createdAt: number;
}

const COLLECTION_NAME = '_internal_bot_pending_hotfixes';

export async function savePendingHotfix(
  chatId: number,
  data: {
    promptText: string;
    photoFileId?: string | null;
    voiceFileId?: string | null;
  }
): Promise<void> {
  const db = admin.firestore();
  await db.collection(COLLECTION_NAME).doc(String(chatId)).set({
    chatId,
    promptText: data.promptText || '',
    photoFileId: data.photoFileId || null,
    voiceFileId: data.voiceFileId || null,
    createdAt: Date.now(),
  });
}

export async function getPendingHotfix(chatId: number): Promise<PendingHotfixData | null> {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION_NAME).doc(String(chatId)).get();
  if (!snap.exists) return null;
  const data = snap.data() as PendingHotfixData;
  // Considera scaduta una richiesta inviata più di 30 minuti prima
  if (Date.now() - (data.createdAt || 0) > 30 * 60 * 1000) {
    await deletePendingHotfix(chatId);
    return null;
  }
  return data;
}

export async function deletePendingHotfix(chatId: number): Promise<void> {
  try {
    const db = admin.firestore();
    await db.collection(COLLECTION_NAME).doc(String(chatId)).delete();
  } catch (err: any) {
    console.warn('[pendingHotfixService] Errore cancellazione doc pending:', err.message);
  }
}

