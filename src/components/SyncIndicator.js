import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SyncQueue } from '../services/SyncQueue';

// Clean, subtle sync status chip shown in every screen header.
//   • all synced  → small soft-green dot, no text
//   • pending     → amber dot + count, tap to retry
//   • syncing     → spinner
export default function SyncIndicator() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

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
    if (syncing || pending === 0) return;
    setSyncing(true);
    await SyncQueue.process();
    await refresh();
    setSyncing(false);
  };

  const hasPending = pending > 0;
  const dotColor = hasPending ? '#ffd166' : '#7BE0A4';

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.wrap, hasPending && styles.wrapPending]}
      activeOpacity={hasPending ? 0.7 : 1}
    >
      {syncing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          {hasPending && <Text style={styles.text}>{pending}</Text>}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 8,
  },
  wrapPending: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 11,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
