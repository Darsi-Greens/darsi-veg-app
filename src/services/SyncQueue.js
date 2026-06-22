import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const QUEUE_KEY = '@darsi_sync_queue_v1';
const DEAD_KEY  = '@darsi_sync_dead_v1';
const MAX_ATTEMPTS = 5; // ~transient outages survive; was 3 (too low)

async function readArr(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function writeArr(key, arr) {
  try { await AsyncStorage.setItem(key, JSON.stringify(arr)); } catch {}
}

// Perform one queued write. Throws on failure so the caller can retry/dead-letter.
async function runItem(item) {
  if (item.type === 'createWithId') {
    // Idempotent create: same docId on every retry → no duplicates.
    await setDoc(
      doc(db, item.collectionName, item.docId),
      { ...item.data, created_at: serverTimestamp(), synced_from_queue: true },
      { merge: false }
    );
  } else if (item.type === 'setDoc') {
    await setDoc(
      doc(db, ...item.path),
      { ...item.data, updatedAt: serverTimestamp() },
      { merge: item.merge ?? true }
    );
  } else if (item.type === 'updateDoc') {
    await updateDoc(doc(db, ...item.path), {
      ...item.data,
      updated_at: serverTimestamp(),
    });
  } else {
    // Legacy addDoc (non-idempotent) — kept for backward compatibility with
    // any items already queued by older app versions.
    await addDoc(collection(db, item.collectionName), {
      ...item.data,
      created_at: serverTimestamp(),
      synced_from_queue: true,
    });
  }
}

export const SyncQueue = {
  async add(item) {
    const queue = await readArr(QUEUE_KEY);
    queue.push({ ...item, attempts: 0, added_at: new Date().toISOString() });
    await writeArr(QUEUE_KEY, queue);
  },

  async getPendingCount() {
    return (await readArr(QUEUE_KEY)).length;
  },

  // Items that exhausted all retries. Surfaced so data loss is never silent.
  async getDeadCount() {
    return (await readArr(DEAD_KEY)).length;
  },

  // Move dead-lettered items back into the live queue for another attempt
  // (e.g. user taps the red sync indicator after connectivity returns).
  async retryDeadLetters() {
    const dead = await readArr(DEAD_KEY);
    if (!dead.length) return;
    const queue = await readArr(QUEUE_KEY);
    for (const item of dead) queue.push({ ...item, attempts: 0 });
    await writeArr(QUEUE_KEY, queue);
    await writeArr(DEAD_KEY, []);
  },

  async process() {
    const queue = await readArr(QUEUE_KEY);
    if (!queue.length) return;

    const remaining = [];
    const newlyDead = [];

    // Process in FIFO order so a createWithId always runs before any
    // updateDoc that targets the same (not-yet-created) document.
    for (const item of queue) {
      try {
        await runItem(item);
        // success → drop from queue
      } catch {
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          newlyDead.push({ ...item, attempts, dead_at: new Date().toISOString() });
        } else {
          remaining.push({ ...item, attempts });
        }
      }
    }

    await writeArr(QUEUE_KEY, remaining);
    if (newlyDead.length) {
      const dead = await readArr(DEAD_KEY);
      await writeArr(DEAD_KEY, [...dead, ...newlyDead]);
    }
  },
};
