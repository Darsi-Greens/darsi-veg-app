import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const QUEUE_KEY = '@darsi_sync_queue_v1';
const MAX_ATTEMPTS = 3;

export const SyncQueue = {
  async add(item) {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      queue.push({ ...item, attempts: 0, added_at: new Date().toISOString() });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  },

  async getPendingCount() {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      return queue.length;
    } catch { return 0; }
  },

  async process() {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      if (!queue.length) return;

      const remaining = [];
      for (const item of queue) {
        if (item.attempts >= MAX_ATTEMPTS) continue; // drop after max retries
        try {
          if (item.type === 'setDoc') {
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
            // Standard addDoc for vendor_orders, sales, stock_log, daily_expenses
            await addDoc(collection(db, item.collectionName), {
              ...item.data,
              created_at: serverTimestamp(),
              synced_from_queue: true,
            });
          }
        } catch {
          remaining.push({ ...item, attempts: item.attempts + 1 });
        }
      }
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } catch {}
  },
};
