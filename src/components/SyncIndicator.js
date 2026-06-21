import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { SyncQueue } from '../services/SyncQueue';

export default function SyncIndicator() {
  const [pending, setPending]   = useState(0);
  const [syncing, setSyncing]   = useState(false);

  const refresh = async () => {
    const count = await SyncQueue.getPendingCount();
    setPending(count);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const handlePress = async () => {
    if (syncing) return;
    setSyncing(true);
    await SyncQueue.process();
    await refresh();
    setSyncing(false);
  };

  const dot   = syncing ? '🟡' : pending > 0 ? '🔴' : '🟢';
  const label = pending > 0 ? `${pending} ⏳` : '';

  return (
    <TouchableOpacity onPress={handlePress} style={styles.wrap} activeOpacity={0.7}>
      <Text style={styles.text}>{dot}{label ? ` ${label}` : ''}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 16,
  },
});
