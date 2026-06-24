import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Telugu voice output for low-literacy users. On-device TTS (free, no network).
// Telugu (te-IN) is read by the device's TTS engine (Google TTS on Android);
// the Telugu voice pack may need a one-time install in phone settings. If it's
// missing, speech just no-ops — the app never breaks.

const MUTE_KEY = '@darsi_voice_muted';
const LANG = 'te-IN';

let muted = false;

export const Voice = {
  // Load the saved mute preference once at app start.
  async init() {
    try { muted = (await AsyncStorage.getItem(MUTE_KEY)) === 'true'; } catch {}
  },

  isMuted() { return muted; },

  async setMuted(value) {
    muted = !!value;
    try { await AsyncStorage.setItem(MUTE_KEY, muted ? 'true' : 'false'); } catch {}
    if (muted) { try { Speech.stop(); } catch {} }
  },

  // Speak a line. Stops any current utterance first so rapid taps don't pile up.
  speak(text) {
    if (muted || !text) return;
    try {
      Speech.stop();
      Speech.speak(String(text), { language: LANG, rate: 0.92, pitch: 1.0 });
    } catch {}
  },

  stop() { try { Speech.stop(); } catch {} },

  // Currency phrase, e.g. 105 → "105 రూపాయలు" (₹ symbol is read inconsistently by
  // TTS, so we say the number + the Telugu word for rupees).
  money(n) {
    const v = Math.round(Number(n) || 0);
    return `${v} రూపాయలు`;
  },

  // Is a Telugu voice actually available on this device?
  async hasTeluguVoice() {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      return voices.some((v) => (v.language || '').toLowerCase().startsWith('te'));
    } catch { return false; }
  },
};
