import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, Alert, Modal, TextInput, ActivityIndicator,
  Platform, ScrollView, RefreshControl,
} from 'react-native';
import {
  collection, addDoc, getDocs, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { LocalDB }  from '../services/LocalDB';
import { SyncQueue } from '../services/SyncQueue';
import SyncIndicator from '../components/SyncIndicator';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LOW_THRESHOLD = { kg: 1, bundle: 2, piece: 5, dozen: 1 };

function stockColor(remaining, unit) {
  const low = LOW_THRESHOLD[unit] ?? 1;
  if (remaining <= 0)     return '#e74c3c'; // red — out
  if (remaining <= low)   return '#f6a623'; // orange — low
  return '#2d6a4f';                          // green — ok
}

export default function StockScreen() {
  const [rows,        setRows]       = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [refreshing,  setRefreshing] = useState(false);
  const [wasteModal,  setWasteModal] = useState(null); // { veg_id, veg_name_te, unit }
  const [wasteQty,    setWasteQty]   = useState('');
  const [savingWaste, setSavingWaste] = useState(false);
  const [carryModal,  setCarryModal] = useState(null); // { veg_id, veg_name_te, unit }
  const [carryQty,    setCarryQty]   = useState('');
  const [savingCarry, setSavingCarry] = useState(false);

  const loadAll = useCallback(async () => {
    const today = todayStr();
    try {
      const [ordSnap, salesSnap, stockSnap] = await Promise.all([
        getDocs(query(collection(db, 'vendor_orders'), where('order_date', '==', today), where('status', '==', 'received'))),
        getDocs(query(collection(db, 'sales'),         where('sale_date',  '==', today))),
        getDocs(query(collection(db, 'stock_log'),     where('log_date',   '==', today))),
      ]);

      // Build per-vegetable maps
      const vegMeta  = {};  // veg_id → { name_te, name_en, emoji, unit }
      const received = {};  // veg_id → qty
      const sold     = {};  // veg_id → qty
      const wasted   = {};  // veg_id → qty
      const carryOver = {}; // veg_id → qty

      // From received orders
      ordSnap.docs.forEach((d) => {
        (d.data().items || []).forEach((item) => {
          const id = item.veg_id;
          if (!id) return;
          vegMeta[id]  = { name_te: item.veg_name_te, name_en: item.veg_name_en, emoji: item.emoji ?? '🥬', unit: item.unit ?? 'kg' };
          received[id] = (received[id] || 0) + (item.quantity || 0);
        });
      });

      // From sales
      salesSnap.docs.forEach((d) => {
        const data = d.data();
        const id   = data.veg_id;
        if (!id) return;
        if (!vegMeta[id]) vegMeta[id] = { name_te: data.veg_name_te, name_en: data.veg_name_en, emoji: data.veg_emoji ?? '🥬', unit: data.unit ?? 'kg' };
        sold[id] = (sold[id] || 0) + (data.quantity || 0);
      });

      // From stock_log
      stockSnap.docs.forEach((d) => {
        const data = d.data();
        const id   = data.veg_id;
        if (!id) return;
        if (!vegMeta[id]) vegMeta[id] = { name_te: data.veg_name_te, name_en: data.veg_name_en ?? '', emoji: '🥬', unit: data.unit ?? 'kg' };
        if (data.type === 'wastage')    wasted[id]    = (wasted[id]    || 0) + (data.quantity || 0);
        if (data.type === 'carry_over') carryOver[id] = (carryOver[id] || 0) + (data.quantity || 0);
      });

      // Merge all vegetable IDs
      const allIds = new Set([
        ...Object.keys(received),
        ...Object.keys(sold),
        ...Object.keys(wasted),
        ...Object.keys(carryOver),
      ]);

      const result = Array.from(allIds).map((id) => {
        const meta      = vegMeta[id] || { name_te: id, name_en: id, emoji: '🥬', unit: 'kg' };
        const recvQty   = received[id]   || 0;
        const soldQty   = sold[id]       || 0;
        const wasteQty  = wasted[id]     || 0;
        const carryQty  = carryOver[id]  || 0;
        const remaining = parseFloat((carryQty + recvQty - soldQty - wasteQty).toFixed(3));
        return { id, ...meta, recvQty, soldQty, wasteQty, carryQty, remaining };
      }).sort((a, b) => a.name_te.localeCompare(b.name_te));

      setRows(result);
    } catch (e) {
      console.warn('StockScreen load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  // ── Save wastage ─────────────────────────────────────────────────────────────

  const saveWastage = async () => {
    const qty = parseFloat(wasteQty);
    if (!qty || qty <= 0) { Alert.alert('పరిమాణం చేర్చండి', 'వేస్ట్ పరిమాణం నమోదు చేయండి.'); return; }
    // Check wastage does not exceed remaining stock
    const row = rows.find((r) => r.id === wasteModal?.veg_id);
    if (row && qty > row.remaining) {
      Alert.alert(
        'స్టాక్ సరిపోదు',
        `మిగిలిన స్టాక్: ${row.remaining.toFixed(1)} ${UNIT_TE[row.unit] ?? row.unit}\nవేస్ట్ పరిమాణం తక్కువగా నమోదు చేయండి.`
      );
      return;
    }
    setSavingWaste(true);
    const stockData = {
      veg_id:      wasteModal.veg_id,
      veg_name_te: wasteModal.veg_name_te,
      type:        'wastage',
      quantity:    qty,
      unit:        wasteModal.unit,
      log_date:    todayStr(),
    };

    // 1. Save locally + update UI immediately
    await LocalDB.append('today_stock_log', { ...stockData, saved_at: new Date().toISOString() });
    setRows((prev) => prev.map((r) =>
      r.id === wasteModal.veg_id
        ? { ...r, wasteQty: r.wasteQty + qty, remaining: parseFloat((r.remaining - qty).toFixed(3)) }
        : r
    ));
    setWasteModal(null);
    setWasteQty('');
    setSavingWaste(false);

    // 2. Sync to Firestore in background
    try {
      await addDoc(collection(db, 'stock_log'), { ...stockData, created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({ collectionName: 'stock_log', data: stockData });
    }
  };

  // ── Save carry-over ──────────────────────────────────────────────────────────

  const saveCarry = async () => {
    const qty = parseFloat(carryQty);
    if (!qty || qty <= 0) { Alert.alert('పరిమాణం చేర్చండి', 'నిన్నటి స్టాక్ పరిమాణం నమోదు చేయండి.'); return; }
    setSavingCarry(true);
    const carryData = {
      veg_id:      carryModal.veg_id,
      veg_name_te: carryModal.veg_name_te,
      type:        'carry_over',
      quantity:    qty,
      unit:        carryModal.unit,
      log_date:    todayStr(),
    };

    // 1. Save locally + update UI immediately
    await LocalDB.append('today_stock_log', { ...carryData, saved_at: new Date().toISOString() });
    setRows((prev) => prev.map((r) =>
      r.id === carryModal.veg_id
        ? { ...r, carryQty: r.carryQty + qty, remaining: parseFloat((r.remaining + qty).toFixed(3)) }
        : r
    ));
    setCarryModal(null);
    setCarryQty('');
    setSavingCarry(false);

    // 2. Sync to Firestore in background
    try {
      await addDoc(collection(db, 'stock_log'), { ...carryData, created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({ collectionName: 'stock_log', data: carryData });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const renderRow = ({ item }) => {
    const color   = stockColor(item.remaining, item.unit);
    const unitTe  = UNIT_TE[item.unit] ?? item.unit;
    const isLow   = item.remaining <= (LOW_THRESHOLD[item.unit] ?? 1) && item.remaining > 0;
    const isOut   = item.remaining <= 0;

    return (
      <View style={[styles.card, isOut && styles.cardOut, isLow && styles.cardLow]}>
        <View style={styles.cardTop}>
          <Text style={styles.emoji}>{item.emoji ?? '🥬'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nameTE}>{item.name_te}</Text>
            <Text style={styles.nameEN}>{item.name_en}</Text>
          </View>
          {/* Remaining — big number */}
          <View style={styles.remainWrap}>
            <Text style={[styles.remainNum, { color }]}>
              {item.remaining > 0 ? item.remaining.toFixed(1) : '0'}
            </Text>
            <Text style={[styles.remainUnit, { color }]}>{unitTe}</Text>
          </View>
        </View>

        {/* Detail row */}
        <View style={styles.detailRow}>
          <View style={styles.detailCell}>
            <Text style={styles.detailVal}>{item.carryQty > 0 ? item.carryQty.toFixed(1) : '—'}</Text>
            <Text style={styles.detailLabel}>నిన్న</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailVal}>{item.recvQty > 0 ? item.recvQty.toFixed(1) : '—'}</Text>
            <Text style={styles.detailLabel}>అందింది</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailVal}>{item.soldQty > 0 ? item.soldQty.toFixed(1) : '—'}</Text>
            <Text style={styles.detailLabel}>అమ్మింది</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={[styles.detailVal, item.wasteQty > 0 && { color: '#e74c3c' }]}>
              {item.wasteQty > 0 ? item.wasteQty.toFixed(1) : '—'}
            </Text>
            <Text style={styles.detailLabel}>వేస్ట్</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.carryBtn}
            onPress={() => { setCarryModal({ veg_id: item.id, veg_name_te: item.name_te, unit: item.unit }); setCarryQty(''); }}
          >
            <Text style={styles.carryBtnText}>+ నిన్నటి స్టాక్</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.wasteBtn}
            onPress={() => { setWasteModal({ veg_id: item.id, veg_name_te: item.name_te, unit: item.unit }); setWasteQty(''); }}
          >
            <Text style={styles.wasteBtnText}>🗑 వేస్ట్</Text>
          </TouchableOpacity>
        </View>

        {isOut  && <View style={styles.statusBadge}><Text style={styles.statusBadgeTextOut}>అయిపోయింది / Out of Stock</Text></View>}
        {isLow  && !isOut && <View style={[styles.statusBadge, { backgroundColor: '#fff3cd' }]}><Text style={[styles.statusBadgeTextOut, { color: '#856404' }]}>తక్కువగా ఉంది / Low Stock</Text></View>}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}><Text style={styles.headerTitle}>స్టాక్</Text></View>
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>స్టాక్ — {todayStr()}</Text>
          <Text style={styles.headerSub}>
            {rows.filter((r) => r.remaining <= 0).length} అయిపోయాయి  ·  {rows.filter((r) => r.remaining > 0 && r.remaining <= (LOW_THRESHOLD[r.unit] ?? 1)).length} తక్కువగా ఉన్నాయి
          </Text>
        </View>
        <SyncIndicator />
      </View>

      {rows.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📦</Text>
          <Text style={{ fontSize: 17, color: '#555', textAlign: 'center' }}>
            ఇంకా సరుకు రాలేదు{'\n'}No stock received today yet
          </Text>
          <Text style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
            ఆర్డర్లు అందిన తర్వాత ఇక్కడ కనిపిస్తాయి
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2d6a4f" />}
        />
      )}

      {/* ── Wastage modal ── */}
      <Modal visible={!!wasteModal} transparent animationType="fade" onRequestClose={() => setWasteModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🗑 వేస్ట్ నమోదు</Text>
            <Text style={styles.modalSub}>{wasteModal?.veg_name_te}</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="decimal-pad"
              placeholder={`పరిమాణం (${UNIT_TE[wasteModal?.unit] ?? 'కేజీ'})`}
              placeholderTextColor="#aaa"
              value={wasteQty}
              onChangeText={(v) => /^\d*\.?\d*$/.test(v) && setWasteQty(v)}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setWasteModal(null)}>
                <Text style={styles.modalCancelText}>రద్దు</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, savingWaste && { backgroundColor: '#74c69d' }]} onPress={saveWastage} disabled={savingWaste}>
                <Text style={styles.modalConfirmText}>{savingWaste ? 'నమోదు...' : 'సేవ్'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Carry-over modal ── */}
      <Modal visible={!!carryModal} transparent animationType="fade" onRequestClose={() => setCarryModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📦 నిన్నటి స్టాక్</Text>
            <Text style={styles.modalSub}>{carryModal?.veg_name_te} — నిన్న ఎంత మిగిలింది?</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="decimal-pad"
              placeholder={`పరిమాణం (${UNIT_TE[carryModal?.unit] ?? 'కేజీ'})`}
              placeholderTextColor="#aaa"
              value={carryQty}
              onChangeText={(v) => /^\d*\.?\d*$/.test(v) && setCarryQty(v)}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCarryModal(null)}>
                <Text style={styles.modalCancelText}>రద్దు</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, savingCarry && { backgroundColor: '#74c69d' }]} onPress={saveCarry} disabled={savingCarry}>
                <Text style={styles.modalConfirmText}>{savingCarry ? 'నమోదు...' : 'సేవ్'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f7f0' },

  header: {
    backgroundColor: '#1a472a', paddingVertical: 16, paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#a8d5b5', marginTop: 4 },

  list: { padding: 12, gap: 12, paddingBottom: 48 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#2d6a4f',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  cardLow: { borderLeftColor: '#f6a623' },
  cardOut: { borderLeftColor: '#e74c3c', backgroundColor: '#fff5f5' },

  cardTop:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  emoji:      { fontSize: 30 },
  nameTE:     { fontSize: 17, fontWeight: '700', color: '#1a472a' },
  nameEN:     { fontSize: 12, color: '#666', marginTop: 2 },
  remainWrap: { alignItems: 'center' },
  remainNum:  { fontSize: 28, fontWeight: 'bold' },
  remainUnit: { fontSize: 12, fontWeight: '600', marginTop: -4 },

  detailRow: {
    flexDirection: 'row', backgroundColor: '#f8fff8', borderRadius: 8,
    padding: 8, marginBottom: 10, gap: 4,
  },
  detailCell:  { flex: 1, alignItems: 'center' },
  detailVal:   { fontSize: 14, fontWeight: '700', color: '#1a472a' },
  detailLabel: { fontSize: 10, color: '#888', marginTop: 2 },

  actionRow:   { flexDirection: 'row', gap: 8 },
  carryBtn:    { flex: 1, backgroundColor: '#e8f5ec', borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  carryBtnText: { fontSize: 13, fontWeight: '700', color: '#2d6a4f' },
  wasteBtn:    { flex: 1, backgroundColor: '#fdecea', borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  wasteBtnText: { fontSize: 13, fontWeight: '700', color: '#c0392b' },

  statusBadge:        { marginTop: 8, backgroundColor: '#fdecea', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  statusBadgeTextOut: { fontSize: 11, fontWeight: '700', color: '#c0392b' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalBox:     { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '80%', gap: 12 },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: '#1a472a' },
  modalSub:     { fontSize: 14, color: '#555' },
  modalInput:   {
    borderWidth: 1.5, borderColor: '#b7e4c7', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 18, color: '#1a1a1a', fontWeight: '600', textAlign: 'center',
  },
  modalBtns:        { flexDirection: 'row', gap: 10 },
  modalCancel:      { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCancelText:  { fontSize: 15, fontWeight: '600', color: '#555' },
  modalConfirm:     { flex: 1, backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
