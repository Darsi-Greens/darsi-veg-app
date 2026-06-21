import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@darsi_';

export const LocalDB = {
  async get(key) {
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  async set(key, value) {
    try {
      await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {}
  },

  async append(key, item) {
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(item);
      await AsyncStorage.setItem(PREFIX + key, JSON.stringify(arr));
    } catch {}
  },

  async clear(key) {
    try {
      await AsyncStorage.removeItem(PREFIX + key);
    } catch {}
  },
};
