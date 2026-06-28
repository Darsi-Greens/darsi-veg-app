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
  // icon + colour + Telugu word (never colour alone)
  const dotColor = hasDead ? '#ff6b6b' : hasPending ? '#ffd166' : '#7BE0A4';
  const icon     = hasDead ? '⛔' : hasPending ? '⏳' : '✓';
  const word     = hasDead ? `${count} సమస్య` : hasPending ? `${count} ఆగింది` : 'సేవ్';

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.wrap, hasPending && styles.wrapAttention]}
      activeOpacity={hasPending ? 0.7 : 1}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityLabel={`sync ${word}`}
    >
      {syncing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={styles.icon}>{icon}</Text>
          <Text style={styles.text} numberOfLines={1}>{word}</Text>
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
    gap: 5,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  wrapAttention: {
    backgroundColor: 'rgba(255,209,102,0.28)',
  },
  dot:  { width: 10, height: 10, borderRadius: 5 },
  icon: { fontSize: 13 },
  text: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
