import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SyncQueue } from '../services/SyncQueue';

// Clean, subtle sync status chip shown in every screen header.
//   • all synced  → small soft-green dot, no text
//   • pending     → amber dot + count, tap to retry
//   • syncing     → spinner
export default function SyncIndicator() {
  const [pending, setPending] = useState(0);
  const [dead,    setDead]    = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    const [p, d] = await Promise.all([
      SyncQueue.getPendingCount(),
      SyncQueue.getDeadCount(),
    ]);
    setPending(p);
    setDead(d);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const handlePress = async () => {
    if (syncing || (pending === 0 && dead === 0)) return;
    setSyncing(true);
    // Tapping while items are dead-lettered first revives them for a retry.
    if (dead > 0) await SyncQueue.retryDeadLetters();
    await SyncQueue.process();
    await refresh();
    setSyncing(false);
  };

  const hasDead    = dead > 0;
  const hasPending = pending > 0 || hasDead;
  const count      = pending + dead;
  // Only show words when something needs attention; when all-synced stay a
  // quiet green ✓ so it doesn't look like a "Save" button.
  const word = hasDead ? `${count} సమస్య` : `${count} ఆగింది`;

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.wrap, hasPending && styles.wrapAttention]}
      activeOpacity={hasPending ? 0.7 : 1}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={hasPending ? `sync ${word}` : 'synced'}
    >
      {syncing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : hasPending ? (
        <>
          <Text style={styles.icon}>{hasDead ? '⛔' : '⏳'}</Text>
          <Text style={styles.text} numberOfLines={1}>{word}</Text>
        </>
      ) : (
        // all synced — quiet green tick, no misleading word
        <View style={styles.okDot}><Text style={styles.okTick}>✓</Text></View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 44,
    minWidth: 36,
    borderRadius: 22,
    paddingHorizontal: 6,
  },
  wrapAttention: {
    backgroundColor: 'rgba(255,209,102,0.28)',
    paddingHorizontal: 12,
  },
  okDot:  { width: 22, height: 22, borderRadius: 11, backgroundColor: '#7BE0A4', alignItems: 'center', justifyContent: 'center' },
  okTick: { color: '#0f5132', fontSize: 13, fontWeight: '900' },
  icon: { fontSize: 13 },
  text: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
