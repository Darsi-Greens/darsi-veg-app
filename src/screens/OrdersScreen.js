import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, Alert, Modal, TextInput, ScrollView,
  ActivityIndicator, Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection, addDoc, updateDoc, getDocs, doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { LocalDB }  from '../services/LocalDB';
import { SyncQueue } from '../services/SyncQueue';
import SyncIndicator from '../components/SyncIndicator';
import SelectionSheet from '../components/SelectionSheet';
import QuantityPicker from '../components/QuantityPicker';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

const FALLBACK_VEGETABLES = [
  { id: 'tomato',       name_te: 'టమాట',         name_en: 'Tomato',        emoji: '🍅', unit: 'kg'     },
  { id: 'onion',        name_te: 'ఉల్లిపాయ',     name_en: 'Onion',         emoji: '🧅', unit: 'kg'     },
  { id: 'potato',       name_te: 'బంగాళదుంప',    name_en: 'Potato',        emoji: '🥔', unit: 'kg'     },
  { id: 'brinjal',      name_te: 'వంకాయ',         name_en: 'Brinjal',       emoji: '🍆', unit: 'kg'     },
  { id: 'okra',         name_te: 'బెండకాయ',       name_en: 'Okra',          emoji: '🌿', unit: 'kg'     },
  { id: 'bittergourd',  name_te: 'కాకరకాయ',       name_en: 'Bitter Gourd',  emoji: '🥒', unit: 'kg'     },
  { id: 'ridgegourd',   name_te: 'బీరకాయ',        name_en: 'Ridge Gourd',   emoji: '🥒', unit: 'kg'     },
  { id: 'bottlegourd',  name_te: 'సొరకాయ',        name_en: 'Bottle Gourd',  emoji: '🎃', unit: 'piece'  },
  { id: 'snakegourd',   name_te: 'పొట్లకాయ',      name_en: 'Snake Gourd',   emoji: '🌿', unit: 'kg'     },
  { id: 'cucumber',     name_te: 'దోసకాయ',        name_en: 'Cucumber',      emoji: '🥒', unit: 'kg'     },
  { id: 'greenchilli',  name_te: 'పచ్చి మిర్చి',  name_en: 'Green Chilli',  emoji: '🌶️', unit: 'kg'    },
  { id: 'capsicum',     name_te: 'క్యాప్సికం',    name_en: 'Capsicum',      emoji: '🫑', unit: 'kg'     },
  { id: 'carrot',       name_te: 'క్యారెట్',       name_en: 'Carrot',        emoji: '🥕', unit: 'kg'     },
  { id: 'cauliflower',  name_te: 'కాలిఫ్లవర్',    name_en: 'Cauliflower',   emoji: '🥦', unit: 'piece'  },
  { id: 'cabbage',      name_te: 'క్యాబేజీ',       name_en: 'Cabbage',       emoji: '🥬', unit: 'piece'  },
  { id: 'spinach',      name_te: 'పాలకూర',         name_en: 'Spinach',       emoji: '🥬', unit: 'bundle' },
  { id: 'fenugreek',    name_te: 'మెంతికూర',       name_en: 'Fenugreek',     emoji: '🌿', unit: 'bundle' },
  { id: 'drumstick',    name_te: 'మునగకాయ',        name_en: 'Drumstick',     emoji: '🌿', unit: 'kg'     },
  { id: 'rawbanana',    name_te: 'అరటికాయ',        name_en: 'Raw Banana',    emoji: '🍌', unit: 'dozen'  },
  { id: 'clusterbeans', name_te: 'గోరుచిక్కుడు',  name_en: 'Cluster Beans', emoji: '🫘', unit: 'kg'     },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const h = d.getHours(), m = d.getMinutes();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr === todayStr()) return 'ఈరోజు';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
const newItem = () => ({ veg: null, qty: '1', price: '', lineTotal: 0 });

export default function OrdersScreen() {
  const [orders,       setOrders]     = useState([]);
  const [vegetables,   setVegs]       = useState([]);
  const [vendors,      setVendors]    = useState([]);
  const [loading,      setLoading]    = useState(true);
  const [showAdd,      setShowAdd]    = useState(false);

  // Add-order form state
  const [selectedVendor,   setSelectedVendor]  = useState(null);
  const [vendorSheetOpen,  setVendorSheetOpen] = useState(false);
  const [vegSheetOpenIdx,  setVegSheetOpenIdx] = useState(null); // index of item picking veg
  const [formItems,        setFormItems]       = useState([newItem()]);
  const [saving,           setSaving]          = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);

    // Vendors — cached first, background refresh
    const cachedVendors = await LocalDB.get('cache_vendors');
    if (cachedVendors) setVendors(cachedVendors.filter((v) => v.active !== false));

    // Vegetables — cached first
    const cachedVegs = await LocalDB.get('cache_vegetables');
    if (cachedVegs?.length) setVegs(cachedVegs);
    else setVegs(FALLBACK_VEGETABLES);

    // Orders — sort client-side, no orderBy
    try {
      const snap = await getDocs(collection(db, 'vendor_orders'));
      const today = todayStr();
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.placed_at?.toMillis?.() ?? 0) - (a.placed_at?.toMillis?.() ?? 0));
      setOrders(all.filter((o) => o.status !== 'received' || o.order_date === today));
    } catch { /* offline */ }

    // Background vendor refresh
    try {
      const snap = await getDocs(collection(db, 'vendors'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.active !== false);
      setVendors(list);
      await LocalDB.set('cache_vendors', snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {}

    // Background veg refresh
    try {
      const snap = await getDocs(collection(db, 'vegetables'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.active !== false);
      if (list.length) {
        setVegs(list);
        await LocalDB.set('cache_vegetables', list);
      }
    } catch {}

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload vendors from cache whenever this screen gets focus
  // (picks up changes made in AdminPanel without a full reload)
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const cached = await LocalDB.get('cache_vendors');
        if (cached) setVendors(cached.filter((v) => v.active !== false));
        // Background Firestore refresh — updates cache for next focus too
        try {
          const snap = await getDocs(collection(db, 'vendors'));
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((v) => v.active !== false);
          setVendors(list);
          await LocalDB.set('cache_vendors', snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch {}
      })();
    }, [])
  );

  // ── Toggle received — local-first, no revert ─────────────────────────────────

  const toggleReceived = (order) => {
    const orderId = order.id || order._localId;
    const newStatus = order.status === 'received' ? 'placed' : 'received';
    const newReceivedAt = newStatus === 'received' ? new Date().toISOString() : null;

    // Update UI immediately
    setOrders((prev) => prev.map((o) => {
      const oId = o.id || o._localId;
      return oId === orderId ? { ...o, status: newStatus, received_at: newReceivedAt } : o;
    }));

    // Background sync — only for real Firestore docs
    if (order.id && !order.id.startsWith('local_')) {
      updateDoc(doc(db, 'vendor_orders', order.id), {
        status:      newStatus,
        received_at: newStatus === 'received' ? serverTimestamp() : null,
      }).catch(() => {
        SyncQueue.add({
          type: 'updateDoc',
          path: ['vendor_orders', order.id],
          data: { status: newStatus, received_at: newReceivedAt },
        });
      });
    }
  };

  // ── Test Firebase write ──────────────────────────────────────────────────────

  const handleTestWrite = async () => {
    const start = Date.now();
    try {
      await addDoc(collection(db, '_test_writes'), { msg: 'OrdersScreen test', ts: serverTimestamp() });
      Alert.alert('Firebase OK ✅', `Write succeeded in ${Date.now() - start}ms`);
    } catch (e) {
      Alert.alert('Firebase FAIL ❌', e.message);
    }
  };

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const updateField = (idx, field, value) => {
    setFormItems((prev) => {
      const next = [...prev];
      const item = { ...next[idx], [field]: value };
      const q = parseFloat(field === 'qty'   ? value : item.qty)   || 0;
      const p = parseFloat(field === 'price' ? value : item.price) || 0;
      item.lineTotal = parseFloat((q * p).toFixed(2));
      next[idx] = item;
      return next;
    });
  };

  const pickVeg = (veg) => {
    if (vegSheetOpenIdx === null) return;
    setFormItems((prev) => {
      const next = [...prev];
      next[vegSheetOpenIdx] = { ...next[vegSheetOpenIdx], veg };
      return next;
    });
    setVegSheetOpenIdx(null);
  };

  const grandTotal = formItems.reduce((s, i) => s + i.lineTotal, 0);

  const resetForm = () => {
    setSelectedVendor(null);
    setFormItems([newItem()]);
  };

  // ── Local-first save ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedVendor) {
      Alert.alert('వెండర్ ఎంచుకోండి', 'సరఫరాదారుని ఎంచుకోండి.');
      return;
    }
    const valid = formItems.filter((i) => i.veg && parseFloat(i.qty) > 0);
    if (!valid.length) {
      Alert.alert('ఐటమ్స్ లేవు', 'కనీసం ఒక కూరగాయ చేర్చండి.');
      return;
    }
    setSaving(true);

    const orderData = {
      vendor_id:      selectedVendor.id,
      vendor_name:    selectedVendor.name,
      vendor_name_en: selectedVendor.name_en ?? '',
      order_date:     todayStr(),
      items: valid.map((i) => ({
        veg_id:      i.veg.id,
        veg_name_en: i.veg.name_en,
        veg_name_te: i.veg.name_te,
        quantity:    parseFloat(i.qty),
        unit:        i.veg.unit ?? 'kg',
        buy_price:   parseFloat(i.price) || 0,
        line_total:  i.lineTotal,
      })),
      total_amount:   parseFloat(grandTotal.toFixed(2)),
      status:         'placed',
      payment_status: 'pending',
      received_at:    null,
    };

    // 1. Save locally
    const localId = `local_${Date.now()}`;
    await LocalDB.append('pending_orders', { ...orderData, localId, saved_at: new Date().toISOString() });

    // 2. Update UI immediately
    setOrders((prev) => [{ id: localId, ...orderData, placed_at: null }, ...prev]);
    setShowAdd(false);
    resetForm();
    setSaving(false);

    // 3. Background Firestore sync
    try {
      await addDoc(collection(db, 'vendor_orders'), { ...orderData, placed_at: serverTimestamp(), created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({ collectionName: 'vendor_orders', data: { ...orderData, placed_at: new Date().toISOString() } });
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const pending  = orders.filter((o) => o.status !== 'received');
  const received = orders.filter((o) => o.status === 'received');

  const renderOrder = (order) => {
    const isReceived = order.status === 'received';
    return (
      <View key={order.id} style={[styles.orderCard, isReceived && styles.orderCardReceived]}>
        <View style={styles.orderHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderVendor}>{order.vendor_name}</Text>
            <Text style={styles.orderMeta}>
              {fmtDate(order.order_date)}
              {order.placed_at ? `  ·  ఆర్డర్: ${fmtTime(order.placed_at)}` : '  ·  స్థానికంగా సేవ్'}
              {isReceived && order.received_at ? `  ·  అందింది: ${fmtTime(order.received_at)}` : ''}
            </Text>
          </View>
          <View style={styles.toggleWrap}>
            <Text style={[styles.toggleLabel, isReceived && styles.toggleLabelOn]}>
              {isReceived ? 'అందింది ✓' : 'రాలేదు'}
            </Text>
            <Switch
              value={isReceived}
              onValueChange={() => toggleReceived(order)}
              trackColor={{ false: '#ddd', true: '#74c69d' }}
              thumbColor={isReceived ? '#2d6a4f' : '#aaa'}
            />
          </View>
        </View>

        {(order.items || []).map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.veg_name_te}</Text>
            <Text style={styles.itemQty}>{item.quantity} {UNIT_TE[item.unit] ?? item.unit}</Text>
            <Text style={styles.itemPrice}>₹{item.buy_price}</Text>
            <Text style={styles.itemTotal}>₹{((item.quantity || 0) * (item.buy_price || 0)).toFixed(0)}</Text>
          </View>
        ))}

        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>మొత్తం: ₹{(order.total_amount || 0).toFixed(2)}</Text>
        </View>
      </View>
    );
  };

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ఆర్డర్లు</Text>
          <SyncIndicator />
        </View>
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>ఆర్డర్లు</Text>
          <Text style={styles.headerSub}>Orders — {todayStr()}</Text>
        </View>
        <TouchableOpacity style={styles.testBtn} onPress={handleTestWrite}>
          <Text style={styles.testBtnText}>🔧 Test</Text>
        </TouchableOpacity>
        <SyncIndicator />
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ ఆర్డర్</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>రాని ఆర్డర్లు / Pending</Text>
          <View style={[styles.badge, { backgroundColor: '#fff3cd' }]}>
            <Text style={[styles.badgeText, { color: '#856404' }]}>{pending.length}</Text>
          </View>
        </View>
        {pending.length === 0
          ? <Text style={styles.emptyHint}>అన్నీ అందాయి 🎉{'\n'}No pending orders</Text>
          : pending.map(renderOrder)}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>అందిన ఆర్డర్లు / Received Today</Text>
          <View style={[styles.badge, { backgroundColor: '#d1e7dd' }]}>
            <Text style={[styles.badgeText, { color: '#0f5132' }]}>{received.length}</Text>
          </View>
        </View>
        {received.length === 0
          ? <Text style={styles.emptyHint}>ఇంకా అందలేదు{'\n'}None received yet today</Text>
          : received.map(renderOrder)}
      </ScrollView>

      {/* ── Add Order Modal ── */}
      <Modal
        visible={showAdd}
        animationType="slide"
        onRequestClose={() => { setShowAdd(false); resetForm(); }}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>కొత్త ఆర్డర్</Text>
              <Text style={styles.headerSub}>New Order</Text>
            </View>
            <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

            {/* STEP 1: Vendor */}
            <Text style={styles.stepLabel}>STEP 1 · వెండర్</Text>
            {selectedVendor ? (
              <View style={styles.selectedBar}>
                <Text style={styles.selectedBarText}>
                  ✓ {selectedVendor.name}  ·  {selectedVendor.area_en ?? selectedVendor.area ?? ''}
                </Text>
                <TouchableOpacity onPress={() => setSelectedVendor(null)} style={styles.deselectBtn}>
                  <Text style={styles.deselectText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              vendors.length === 0 ? (
                <View style={styles.noVendorBox}>
                  <Text style={styles.noVendorText}>వెండర్లు లేరు · No vendors</Text>
                  <Text style={styles.noVendorSub}>Admin ని సంప్రదించండి · Contact admin</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.selectBtn} onPress={() => setVendorSheetOpen(true)}>
                  <Text style={styles.selectBtnText}>🏪 వెండర్ ఎంచుకోండి · Select Vendor</Text>
                </TouchableOpacity>
              )
            )}

            {/* STEP 2+: Vegetables — only visible after vendor selected */}
            {selectedVendor && (
              <>
                <Text style={[styles.stepLabel, { marginTop: 20 }]}>STEP 2 · కూరగాయలు</Text>

                {formItems.map((item, idx) => (
                  <View key={idx} style={styles.itemCard}>
                    {/* Veg picker button */}
                    {item.veg ? (
                      <TouchableOpacity
                        style={styles.vegChip}
                        onPress={() => setVegSheetOpenIdx(idx)}
                      >
                        <Text style={styles.vegChipEmoji}>{item.veg.emoji ?? '🥬'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.vegChipName}>{item.veg.name_te}</Text>
                          <Text style={styles.vegChipSub}>{item.veg.name_en}</Text>
                        </View>
                        <Text style={styles.vegChipUnit}>{UNIT_TE[item.veg.unit] ?? ''}</Text>
                        <Text style={styles.vegChipChange}>✏️</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.vegPickBtn}
                        onPress={() => setVegSheetOpenIdx(idx)}
                      >
                        <Text style={styles.vegPickBtnText}>🥬 కూరగాయ ఎంచుకోండి · Select Vegetable</Text>
                      </TouchableOpacity>
                    )}

                    {/* Quantity picker */}
                    <Text style={styles.inputLabel}>ఎన్ని {UNIT_TE[item.veg?.unit] ?? 'కేజీ'}?</Text>
                    <QuantityPicker
                      value={item.qty}
                      onChange={(v) => updateField(idx, 'qty', v)}
                      unit={UNIT_TE[item.veg?.unit] ?? 'కేజీ'}
                    />

                    {/* Price input */}
                    <View style={styles.priceRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>కొనుగోలు ధర · Buying price per {UNIT_TE[item.veg?.unit] ?? 'కేజీ'}</Text>
                        <View style={styles.priceInputWrap}>
                          <Text style={styles.rupee}>₹</Text>
                          <TextInput
                            style={styles.priceInput}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#bbb"
                            value={item.price}
                            onChangeText={(v) => {
                              const clean = v.replace(',', '.');
                              if (/^\d*\.?\d*$/.test(clean)) updateField(idx, 'price', clean);
                            }}
                          />
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                        <Text style={styles.inputLabel}>మొత్తం</Text>
                        <Text style={styles.lineTotal}>₹{item.lineTotal.toFixed(0)}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => setFormItems((p) => p.length === 1 ? [newItem()] : p.filter((_, i) => i !== idx))}
                      style={{ alignSelf: 'flex-end', marginTop: 8 }}
                    >
                      <Text style={styles.removeText}>✕ తొలగించు</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={styles.addItemBtn} onPress={() => setFormItems((p) => [...p, newItem()])}>
                  <Text style={styles.addItemText}>+ వేరొక కూరగాయ చేర్చు</Text>
                </TouchableOpacity>

                <View style={styles.grandTotalRow}>
                  <Text style={styles.grandTotalLabel}>మొత్తం బిల్లు</Text>
                  <Text style={styles.grandTotalValue}>₹{grandTotal.toFixed(2)}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && { backgroundColor: '#74c69d' }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>
                    {saving
                      ? 'సేవ్ అవుతోంది...'
                      : `✓ ఆర్డర్ సేవ్ చేయండి · Save Order  ₹${grandTotal.toFixed(0)}`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Vendor selection sheet */}
      <SelectionSheet
        visible={vendorSheetOpen}
        onClose={() => setVendorSheetOpen(false)}
        title="వెండర్ ఎంచుకోండి · Select Vendor"
        items={vendors}
        onSelect={(v) => { setSelectedVendor(v); setVendorSheetOpen(false); }}
        selectedId={selectedVendor?.id}
        type="vendor"
      />

      {/* Vegetable selection sheet */}
      <SelectionSheet
        visible={vegSheetOpenIdx !== null}
        onClose={() => setVegSheetOpenIdx(null)}
        title="కూరగాయ ఎంచుకోండి · Select Vegetable"
        items={vegetables}
        onSelect={pickVeg}
        selectedId={formItems[vegSheetOpenIdx ?? 0]?.veg?.id}
        type="vegetable"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f7f0' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingVertical: 16, paddingHorizontal: 16, gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#a8d5b5', marginTop: 2 },

  testBtn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  testBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  addBtn:      { backgroundColor: '#52b788', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
  closeBtn:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 16, color: '#fff', fontWeight: '700' },

  scroll: { padding: 16, paddingBottom: 48 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  badge:         { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:     { fontSize: 13, fontWeight: '700' },

  orderCard:         { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#f6a623', elevation: 1 },
  orderCardReceived: { borderLeftColor: '#2d6a4f', backgroundColor: '#f8fff8' },
  orderHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  orderVendor:  { fontSize: 17, fontWeight: '700', color: '#1a472a' },
  orderMeta:    { fontSize: 12, color: '#888', marginTop: 2 },
  toggleWrap:   { alignItems: 'center', gap: 2 },
  toggleLabel:  { fontSize: 11, color: '#888', fontWeight: '600' },
  toggleLabelOn: { color: '#2d6a4f' },

  itemRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 8 },
  itemName:  { flex: 2, fontSize: 14, fontWeight: '600', color: '#1a472a' },
  itemQty:   { flex: 1, fontSize: 13, color: '#555', textAlign: 'center' },
  itemPrice: { flex: 1, fontSize: 13, color: '#666', textAlign: 'center' },
  itemTotal: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1a472a', textAlign: 'right' },
  orderFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  orderTotal:  { fontSize: 15, fontWeight: '700', color: '#1a472a' },

  emptyHint: { textAlign: 'center', color: '#888', fontSize: 15, marginTop: 20, marginBottom: 10, lineHeight: 26 },

  // Form
  stepLabel: { fontSize: 11, fontWeight: '800', color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  selectBtn:     { backgroundColor: '#2d6a4f', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 8 },
  selectBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  selectedBar:     { backgroundColor: '#2d6a4f', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  selectedBarText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  deselectBtn:     { padding: 4 },
  deselectText:    { color: '#fff', fontSize: 16, fontWeight: '700' },

  noVendorBox:  { backgroundColor: '#fff3e0', borderRadius: 10, padding: 20, alignItems: 'center', marginBottom: 12 },
  noVendorText: { fontSize: 16, fontWeight: '700', color: '#e65100' },
  noVendorSub:  { fontSize: 13, color: '#888', marginTop: 4 },

  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 1 },

  vegPickBtn:     { borderWidth: 2, borderColor: '#2d6a4f', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  vegPickBtnText: { fontSize: 15, fontWeight: '700', color: '#2d6a4f' },

  vegChip:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5ec', borderRadius: 12, padding: 12, marginBottom: 12, gap: 10 },
  vegChipEmoji: { fontSize: 28 },
  vegChipName:  { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  vegChipSub:   { fontSize: 12, color: '#666', marginTop: 1 },
  vegChipUnit:  { fontSize: 13, fontWeight: '700', color: '#2d6a4f', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  vegChipChange: { fontSize: 16, marginLeft: 4 },

  inputLabel: { fontSize: 11, color: '#666', fontWeight: '600', marginBottom: 6, marginTop: 10 },

  priceRow:      { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 4 },
  priceInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#b7e4c7', borderRadius: 8, backgroundColor: '#f8fff8', paddingHorizontal: 10, height: 44 },
  rupee:         { fontSize: 18, color: '#2d6a4f', fontWeight: '600', marginRight: 4 },
  priceInput:    { flex: 1, fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  lineTotal:     { fontSize: 20, fontWeight: '700', color: '#1a472a', paddingVertical: 10 },

  removeText: { fontSize: 12, color: '#e74c3c', fontWeight: '600' },

  addItemBtn:  { borderWidth: 2, borderColor: '#2d6a4f', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addItemText: { fontSize: 15, color: '#2d6a4f', fontWeight: '700' },

  grandTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e8f5ec', borderRadius: 12, padding: 18, marginBottom: 16 },
  grandTotalLabel: { fontSize: 16, fontWeight: '600', color: '#444' },
  grandTotalValue: { fontSize: 28, fontWeight: 'bold', color: '#1a472a' },

  saveBtn:     { backgroundColor: '#2d6a4f', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 16 },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
