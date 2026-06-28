import * as Haptics from 'expo-haptics';

// Light tactile feedback for number entry (keypad, qty steppers, counters),
// which is otherwise silent. Wrapped so it never throws if unsupported.
export function tapBuzz() {
  try { Haptics.selectionAsync(); } catch {}
}

// Stronger confirmation buzz for a completed action (save / confirm).
export function okBuzz() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
}
