import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, Alert, Modal, TextInput, ActivityIndicator,
  Platform, ScrollView, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection, getDocs, doc, setDoc, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { LocalDB }  from '../services/LocalDB';
import { SyncQueue } from '../services/SyncQueue';
import { newId } from '../services/ids';
import { Voice } from '../services/Speak';
import SyncIndicator from '../components/SyncIndicator';
import AppHeader from '../components/AppHeader';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
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

  // Verify-stock flow
  const [priceById,   setPriceById]  = useState({});   // veg_id → sell_price
  const [verifyModal, setVerifyModal] = useState(null); // { row }
  const [actualQty,   setActualQty]  = useState('');
  const [verifyStep,  setVerifyStep] = useState('count'); // 'count' | 'reason'
  const [savingVerify, setSavingVerify] = useState(false);
  const [verified,    setVerified]   = useState({});   // veg_id → true (this session)

  const loadAll = useCallback(async () => {
    const today = todayStr();

    // Today's sell prices (used when a shortfall is a missed sale, not waste).
    const cachedPrices = await LocalDB.get(`prices_${today}`);
    if (cachedPrices) {
      const pmap = {};
      Object.entries(cachedPrices).forEach(([id, d]) => { pmap[id] = d.sell_price ?? d.price ?? 0; });
      setPriceById(pmap);
    }

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
        // carry_over is now a single SET value per veg/day (deterministic doc id),
        // so take the value rather than summing — supports decrease + no doubling.
        if (data.type === 'carry_over') carryOver[id] = (data.quantity || 0);
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

  // Reload on focus so stock reflects sales/orders/wastage logged on other tabs.
  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  // ── Save wastage ─────────────────────────────────────────────────────────────

  const saveWastage = async () => {
    const qty = parseFloat(wasteQty);
    if (!qty || qty <= 0) { Alert.alert('ఎంత? రాయండి', 'ఎంత పాడైందో రాయండి.'); return; }
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
    const logId = newId();
    const stockData = {
      veg_id:      wasteModal.veg_id,
      veg_name_te: wasteModal.veg_name_te,
      type:        'wastage',
      quantity:    qty,
      unit:        wasteModal.unit,
      log_date:    todayStr(),
    };

    // 1. Save locally + update UI immediately
    await LocalDB.append('today_stock_log', { ...stockData, id: logId, saved_at: new Date().toISOString() });
    setRows((prev) => prev.map((r) =>
      r.id === wasteModal.veg_id
        ? { ...r, wasteQty: r.wasteQty + qty, remaining: parseFloat((r.remaining - qty).toFixed(3)) }
        : r
    ));
    setWasteModal(null);
    setWasteQty('');
    setSavingWaste(false);
    Voice.speak(`వేస్ట్ ${qty} ${UNIT_TE[wasteModal.unit] ?? 'కేజీ'} నమోదు అయింది`);

    // 2. Sync to Firestore in background (idempotent — no duplicate on retry)
    try {
      await setDoc(doc(db, 'stock_log', logId), { ...stockData, created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({ type: 'createWithId', collectionName: 'stock_log', docId: logId, data: stockData });
    }
  };

  // ── Carry-over: single SET value per veg/day (deterministic doc id) ──────────
  // Overwrites the same doc, so it supports increase AND decrease and never
  // doubles. Used both for manual entry and auto carry-over from verification.
  const writeCarryOver = async (vegId, name, unit, qty, dateStr) => {
    const docId = `carryover_${dateStr}_${vegId}`;
    const data = {
      veg_id: vegId, veg_name_te: name, type: 'carry_over',
      quantity: qty, unit, log_date: dateStr,
    };
    try {
      await setDoc(doc(db, 'stock_log', docId), { ...data, created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({ type: 'createWithId', collectionName: 'stock_log', docId, data });
    }
  };

  const saveCarry = async () => {
    const target = parseFloat(carryQty);
    if (isNaN(target) || target < 0) { Alert.alert('ఎంత? రాయండి', 'నిన్న ఎంత మిగిలిందో రాయండి.'); return; }
    const current = carryModal.current || 0;
    if (target === current) { setCarryModal(null); setCarryQty(''); return; } // no-op

    setSavingCarry(true);
    const dateStr = todayStr();
    await LocalDB.append('today_stock_log', { veg_id: carryModal.veg_id, type: 'carry_over', quantity: target, log_date: dateStr, set: true, saved_at: new Date().toISOString() });
    // Replace the carry contribution: remaining = remaining - old + new
    setRows((prev) => prev.map((r) =>
      r.id === carryModal.veg_id
        ? { ...r, carryQty: target, remaining: parseFloat((r.remaining - current + target).toFixed(3)) }
        : r
    ));
    setCarryModal(null);
    setCarryQty('');
    setSavingCarry(false);
    Voice.speak(`నిన్న మిగిలింది ${target} ${UNIT_TE[carryModal.unit] ?? 'కేజీ'}`);
    await writeCarryOver(carryModal.veg_id, carryModal.veg_name_te, carryModal.unit, target, dateStr);
  };

  // ── Verify stock: parent counts what's actually left; app reconciles ─────────
  const appendWaste = async (vegId, name, unit, qty) => {
    const logId = newId();
    const data = { veg_id: vegId, veg_name_te: name, type: 'wastage', quantity: qty, unit, log_date: todayStr() };
    await LocalDB.append('today_stock_log', { ...data, id: logId, saved_at: new Date().toISOString() });
    try { await setDoc(doc(db, 'stock_log', logId), { ...data, created_at: serverTimestamp() }); }
    catch { await SyncQueue.add({ type: 'createWithId', collectionName: 'stock_log', docId: logId, data }); }
  };

  const appendSale = async (row, qty) => {
    const price = priceById[row.id] || 0;
    const saleId = newId();
    const data = {
      veg_id: row.id, veg_name_te: row.name_te, veg_name_en: row.name_en ?? '', veg_emoji: row.emoji ?? '',
      sale_date: todayStr(), quantity: qty, unit: row.unit, sell_price: price,
      total_amount: parseFloat((qty * price).toFixed(2)), payment_mode: 'cash',
    };
    await LocalDB.append('today_sales', { ...data, id: saleId, saved_at: new Date().toISOString() });
    try { await setDoc(doc(db, 'sales', saleId), { ...data, created_at: serverTimestamp() }); }
    catch { await SyncQueue.add({ type: 'createWithId', collectionName: 'sales', docId: saleId, data }); }
  };

  const openVerify = (row) => {
    setVerifyModal({ row });
    setActualQty(row.remaining > 0 ? String(row.remaining) : '');
    setVerifyStep('count');
    const u = UNIT_TE[row.unit] ?? 'కేజీ';
    Voice.speak(`${row.name_te}, లెక్క ప్రకారం ${row.remaining > 0 ? row.remaining : 0} ${u}. ఇప్పుడు ఎంత ఉంది?`);
  };

  // Apply the verification outcome: optional waste/sale adjustment + set
  // tomorrow's carry-over to the actual count + mark verified.
  const finishVerify = async (actual, applied) => {
    const row = verifyModal.row;
    if (applied?.type === 'waste') await appendWaste(row.id, row.name_te, row.unit, applied.qty);
    if (applied?.type === 'sale')  await appendSale(row, applied.qty);
    if (actual > 0) await writeCarryOver(row.id, row.name_te, row.unit, actual, tomorrowStr());

    setVerified((v) => ({ ...v, [row.id]: true }));
    setRows((prev) => prev.map((r) => {
      if (r.id !== row.id) return r;
      const nr = { ...r, remaining: actual };
      if (applied?.type === 'waste') nr.wasteQty = parseFloat((r.wasteQty + applied.qty).toFixed(3));
      if (applied?.type === 'sale')  nr.soldQty  = parseFloat((r.soldQty + applied.qty).toFixed(3));
      return nr;
    }));
    setVerifyModal(null);
    setActualQty('');
    setVerifyStep('count');

    // Speak the outcome
    const u = UNIT_TE[row.unit] ?? 'కేజీ';
    if (applied?.type === 'waste')      Voice.speak(`వేస్ట్ ${applied.qty} ${u} నమోదు అయింది`);
    else if (applied?.type === 'sale')  Voice.speak(`అమ్మకం ${applied.qty} ${u} నమోదు అయింది`);
    else                                Voice.speak('లెక్క చూశారు, సరిగ్గా ఉంది');
  };

  const handleVerifyCount = async () => {
    const actual = parseFloat(actualQty);
    if (isNaN(actual) || actual < 0) { Alert.alert('ఎంత? రాయండి', 'ఇప్పుడు ఎంత ఉంది నమోదు చేయండి.'); return; }
    const diff = parseFloat((verifyModal.row.remaining - actual).toFixed(3));
    if (diff === 0) { setSavingVerify(true); await finishVerify(actual, null); setSavingVerify(false); return; }
    if (diff < 0) {
      Alert.alert(
        'ఎక్కువ ఉంది · More than expected',
        'లెక్క కంటే ఎక్కువ స్టాక్ ఉంది — ఆర్డర్ లేదా అమ్మకం నమోదు కాలేదేమో చూడండి.\nMore stock than recorded; check for a missing order/sale.',
        [{ text: 'సరే · OK', onPress: async () => { setSavingVerify(true); await finishVerify(actual, null); setSavingVerify(false); } }]
      );
      return;
    }
    setVerifyStep('reason'); // diff > 0 → ask why it's short
  };

  const handleReason = async (type) => {
    const actual = parseFloat(actualQty);
    const diff = parseFloat((verifyModal.row.remaining - actual).toFixed(3));
    if (type === 'sale' && !(priceById[verifyModal.row.id] > 0)) {
      Alert.alert('ధర లేదు · No price', 'ముందుగా ధరలు స్క్రీన్‌లో ధర సెట్ చేయండి.\nSet a selling price first.');
      return;
    }
    setSavingVerify(true);
    await finishVerify(actual, { type, qty: diff });
    setSavingVerify(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const renderRow = ({ item }) => {
    const color   = stockColor(item.remaining, item.unit);
    const unitTe  = UNIT_TE[item.unit] ?? item.unit;
    const isLow   = item.remaining <= (LOW_THRESHOLD[item.unit] ?? 1) && item.remaining > 0;
    const isOut   = item.remaining <= 0;
    const isVerified = !!verified[item.id];
    // Reorder when out/low; suggest roughly today's demand (what was sold).
    const needReorder = item.remaining <= (LOW_THRESHOLD[item.unit] ?? 1);
    const suggestQty  = Math.max(Math.ceil(item.soldQty || 0), item.unit === 'piece' ? 5 : 2);

    return (
      <View style={[styles.card, isOut && styles.cardOut, isLow && styles.cardLow]}>
        <View style={styles.cardTop}>
          <Text style={styles.emoji}>{item.emoji ?? '🥬'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nameTE}>{item.name_te}</Text>
            <Text style={styles.nameEN}>{item.name_en}</Text>
            {isVerified && <Text style={styles.verifiedTag}>✓ లెక్క చూశారు · Verified</Text>}
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

        {/* Primary action: verify the actual count */}
        <TouchableOpacity
          style={[styles.verifyBtn, isVerified && styles.verifyBtnDone]}
          onPress={() => openVerify(item)}
        >
          <Text style={[styles.verifyBtnText, isVerified && styles.verifyBtnTextDone]}>
            {isVerified ? '✓ లెక్క చూశారు · Verified (మళ్ళీ?)' : '✓ స్టాక్ లెక్క చూడండి · Verify stock'}
          </Text>
        </TouchableOpacity>

        {/* Secondary actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.carryBtn}
            onPress={() => { setCarryModal({ veg_id: item.id, veg_name_te: item.name_te, unit: item.unit, current: item.carryQty }); setCarryQty(item.carryQty ? String(item.carryQty) : ''); }}
          >
            <Text style={styles.carryBtnText}>📦 నిన్న మిగిలింది</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.wasteBtn}
            onPress={() => { setWasteModal({ veg_id: item.id, veg_name_te: item.name_te, unit: item.unit }); setWasteQty(''); }}
          >
            <Text style={styles.wasteBtnText}>🗑 వేస్ట్</Text>
          </TouchableOpacity>
        </View>

        {isOut  && <View style={styles.statusBadge}><Text style={styles.statusBadgeTextOut}>అయిపోయింది / Out of Stock</Text></View>}
        {isLow  && !isOut && <View style={[styles.statusBadge, { backgroundColor: '#fff3cd' }]}><Text style={[styles.statusBadgeTextOut, { color: '#856404' }]}>కొంచెమే ఉంది / Low Stock</Text></View>}

        {needReorder && (
          <View style={styles.reorderHint}>
            <Text style={styles.reorderHintText}>
              🛒 రేపటికి ఆర్డర్ చేయండి · Order for tomorrow (~{suggestQty} {unitTe})
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader title="స్టాక్" subtitle="Stock" showDate />
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="స్టాక్"
        subtitle={`${rows.filter((r) => r.remaining <= 0).length} అయిపోయాయి · ${rows.filter((r) => r.remaining > 0 && r.remaining <= (LOW_THRESHOLD[r.unit] ?? 1)).length} కొంచెమే`}
        showDate
      />

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
            <Text style={styles.modalTitle}>🗑 పాడైంది</Text>
            <Text style={styles.modalSub}>{wasteModal?.veg_name_te}</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="decimal-pad"
              placeholder={`ఎంత (${UNIT_TE[wasteModal?.unit] ?? 'కేజీ'})`}
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
                <Text style={styles.modalConfirmText}>{savingWaste ? 'ఆగండి...' : 'సరే'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Carry-over modal ── */}
      <Modal visible={!!carryModal} transparent animationType="fade" onRequestClose={() => setCarryModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📦 నిన్న మిగిలింది</Text>
            <Text style={styles.modalSub}>{carryModal?.veg_name_te} — నిన్న ఎంత మిగిలింది?</Text>
            {carryModal?.current > 0 ? (
              <Text style={styles.modalNote}>
                ఇప్పటికే ఉంది · Already set: {carryModal.current} {UNIT_TE[carryModal?.unit] ?? 'కేజీ'}
              </Text>
            ) : null}
            <TextInput
              style={styles.modalInput}
              keyboardType="decimal-pad"
              placeholder={`ఎంత (${UNIT_TE[carryModal?.unit] ?? 'కేజీ'})`}
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
                <Text style={styles.modalConfirmText}>{savingCarry ? 'ఆగండి...' : 'సరే'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Verify-stock modal ── */}
      <Modal visible={!!verifyModal} transparent animationType="fade" onRequestClose={() => setVerifyModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {verifyStep === 'count' ? (
              <>
                <Text style={styles.modalTitle}>✓ స్టాక్ లెక్క చూడండి</Text>
                <Text style={styles.modalSub}>{verifyModal?.row?.name_te}</Text>
                <Text style={styles.modalNote}>
                  లెక్క ప్రకారం · Should be: {(verifyModal?.row?.remaining ?? 0).toFixed(1)} {UNIT_TE[verifyModal?.row?.unit] ?? 'కేజీ'}
                </Text>
                <Text style={[styles.modalSub, { marginTop: 8 }]}>ఇప్పుడు నిజంగా ఎంత ఉంది? · Actual count now?</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="decimal-pad"
                  placeholder={`ఎంత (${UNIT_TE[verifyModal?.row?.unit] ?? 'కేజీ'})`}
                  placeholderTextColor="#aaa"
                  value={actualQty}
                  onChangeText={(v) => /^\d*\.?\d*$/.test(v) && setActualQty(v)}
                  autoFocus
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => setVerifyModal(null)}>
                    <Text style={styles.modalCancelText}>రద్దు</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalConfirm, savingVerify && { backgroundColor: '#74c69d' }]} onPress={handleVerifyCount} disabled={savingVerify}>
                    <Text style={styles.modalConfirmText}>{savingVerify ? '...' : 'లెక్క చూడు · Check'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* diff > 0 — ask why it's short */}
                <Text style={styles.modalTitle}>తేడా ఎందుకు?</Text>
                <Text style={styles.modalSub}>
                  {verifyModal?.row?.name_te}: {(verifyModal?.row?.remaining - (parseFloat(actualQty) || 0)).toFixed(1)} {UNIT_TE[verifyModal?.row?.unit] ?? 'కేజీ'} తక్కువ · short
                </Text>
                <TouchableOpacity
                  style={[styles.reasonBtn, { borderColor: '#e74c3c' }]}
                  onPress={() => handleReason('waste')}
                  disabled={savingVerify}
                >
                  <Text style={styles.reasonBtnTitle}>🗑 వేస్ట్ / పాడైంది</Text>
                  <Text style={styles.reasonBtnSub}>Spoiled / wasted — record as wastage (loss)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reasonBtn, { borderColor: '#2d6a4f' }]}
                  onPress={() => handleReason('sale')}
                  disabled={savingVerify}
                >
                  <Text style={styles.reasonBtnTitle}>🛒 అమ్మాను కానీ రాయలేదు</Text>
                  <Text style={styles.reasonBtnSub}>A sale wasn't recorded — add it (revenue)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalCancel, { marginTop: 4 }]} onPress={() => setVerifyStep('count')}>
                  <Text style={styles.modalCancelText}>← వెనక్కి · Back</Text>
                </TouchableOpacity>
              </>
            )}
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

  verifiedTag: { fontSize: 11, color: '#2d6a4f', fontWeight: '700', marginTop: 3 },

  verifyBtn:        { backgroundColor: '#1a472a', borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8, minHeight: 48 },
  verifyBtnDone:    { backgroundColor: '#e8f5ec' },
  verifyBtnText:    { fontSize: 15, fontWeight: '800', color: '#fff' },
  verifyBtnTextDone:{ color: '#2d6a4f' },

  reorderHint:     { marginTop: 8, backgroundColor: '#fff3e0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  reorderHintText: { fontSize: 12, fontWeight: '700', color: '#e65100' },

  reasonBtn:      { borderWidth: 2, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginTop: 10 },
  reasonBtnTitle: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  reasonBtnSub:   { fontSize: 12, color: '#777', marginTop: 2 },

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
  modalNote:    { fontSize: 12, color: '#2d6a4f', fontWeight: '600', backgroundColor: '#e8f5ec', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
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
