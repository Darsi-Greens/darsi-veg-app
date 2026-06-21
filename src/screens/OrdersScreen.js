import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, Alert, Modal, TextInput, ScrollView,
  ActivityIndicator, Platform, Switch,
} from 'react-native';
import {
  collection, addDoc, updateDoc, getDocs, doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

const FALLBACK_VEGETABLES = [
  { id: 'tomato',       name_te: 'టమాట',        name_en: 'Tomato',        emoji: '🍅', unit: 'kg'     },
  { id: 'onion',        name_te: 'ఉల్లిపాయ',    name_en: 'Onion',         emoji: '🧅', unit: 'kg'     },
  { id: 'potato',       name_te: 'బంగాళదుంప',   name_en: 'Potato',        emoji: '🥔', unit: 'kg'     },
  { id: 'brinjal',      name_te: 'వంకాయ',        name_en: 'Brinjal',       emoji: '🍆', unit: 'kg'     },
  { id: 'okra',         name_te: 'బెండకాయ',      name_en: 'Okra',          emoji: '🌿', unit: 'kg'     },
  { id: 'bittergourd',  name_te: 'కాకరకాయ',      name_en: 'Bitter Gourd',  emoji: '🥒', unit: 'kg'     },
  { id: 'ridgegourd',   name_te: 'బీరకాయ',       name_en: 'Ridge Gourd',   emoji: '🥒', unit: 'kg'     },
  { id: 'bottlegourd',  name_te: 'సొరకాయ',       name_en: 'Bottle Gourd',  emoji: '🎃', unit: 'piece'  },
  { id: 'snakegourd',   name_te: 'పొట్లకాయ',     name_en: 'Snake Gourd',   emoji: '🌿', unit: 'kg'     },
  { id: 'cucumber',     name_te: 'దోసకాయ',       name_en: 'Cucumber',      emoji: '🥒', unit: 'kg'     },
  { id: 'greenchilli',  name_te: 'పచ్చి మిర్చి', name_en: 'Green Chilli',  emoji: '🌶️', unit: 'kg'    },
  { id: 'capsicum',     name_te: 'క్యాప్సికం',   name_en: 'Capsicum',      emoji: '🫑', unit: 'kg'     },
  { id: 'carrot',       name_te: 'క్యారెట్',      name_en: 'Carrot',        emoji: '🥕', unit: 'kg'     },
  { id: 'cauliflower',  name_te: 'కాలిఫ్లవర్',   name_en: 'Cauliflower',   emoji: '🥦', unit: 'piece'  },
  { id: 'cabbage',      name_te: 'క్యాబేజీ',      name_en: 'Cabbage',       emoji: '🥬', unit: 'piece'  },
  { id: 'spinach',      name_te: 'పాలకూర',        name_en: 'Spinach',       emoji: '🥬', unit: 'bundle' },
  { id: 'fenugreek',    name_te: 'మెంతికూర',      name_en: 'Fenugreek',     emoji: '🌿', unit: 'bundle' },
  { id: 'drumstick',    name_te: 'మునగకాయ',       name_en: 'Drumstick',     emoji: '🌿', unit: 'kg'     },
  { id: 'rawbanana',    name_te: 'అరటికాయ',       name_en: 'Raw Banana',    emoji: '🍌', unit: 'dozen'  },
  { id: 'clusterbeans', name_te: 'గోరుచిక్కుడు', name_en: 'Cluster Beans', emoji: '🫘', unit: 'kg'     },
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

const newItem = () => ({ veg: null, qty: '', price: '', lineTotal: 0 });

export default function OrdersScreen() {
  const [orders,         setOrders]        = useState([]);
  const [vegetables,     setVegs]          = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [toggling,       setToggling]      = useState(null);
  const [showAdd,        setShowAdd]       = useState(false);

  // Add-order form state
  const [formVendorName, setFormVendorName] = useState('');
  const [formItems,      setFormItems]      = useState([newItem()]);
  const [saving,         setSaving]         = useState(false);
  const [pickerIdx,      setPickerIdx]      = useState(null);
  const [vegSearch,      setVegSearch]      = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);

    // Load vegetables — fall back to hardcoded list if Firestore empty or offline
    try {
      const snap = await getDocs(collection(db, 'vegetables'));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => v.active !== false)
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
      setVegs(list.length ? list : FALLBACK_VEGETABLES);
    } catch {
      setVegs(FALLBACK_VEGETABLES);
    }

    // Load orders — no orderBy to avoid requiring a Firestore index; sort client-side
    try {
      const snap = await getDocs(collection(db, 'vendor_orders'));
      const today = todayStr();
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.placed_at?.toMillis?.() ?? 0) - (a.placed_at?.toMillis?.() ?? 0));
      setOrders(all.filter((o) => o.status !== 'received' || o.order_date === today));
    } catch {
      /* offline — show empty */
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Toggle received ───────────────────────────────────────────────────────────

  const toggleReceived = async (order) => {
    const newStatus = order.status === 'received' ? 'placed' : 'received';
    setToggling(order.id);
    try {
      await updateDoc(doc(db, 'vendor_orders', order.id), {
        status:      newStatus,
        received_at: newStatus === 'received' ? serverTimestamp() : null,
      });
      setOrders((prev) =>
        prev.map((o) => o.id === order.id ? { ...o, status: newStatus } : o)
      );
    } catch {
      Alert.alert('లోపం', 'అప్‌డేట్ విఫలమైంది. Connection check చేయండి.');
    } finally {
      setToggling(null);
    }
  };

  // ── Add order form helpers ────────────────────────────────────────────────────

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
    setFormItems((prev) => {
      const next = [...prev];
      next[pickerIdx] = { ...next[pickerIdx], veg };
      return next;
    });
    setPickerIdx(null);
    setVegSearch('');
  };

  const grandTotal = formItems.reduce((s, i) => s + i.lineTotal, 0);

  const resetForm = () => {
    setFormVendorName('');
    setFormItems([newItem()]);
  };

  const handleSave = async () => {
    if (!formVendorName.trim()) {
      Alert.alert('వెండర్ లేదు', 'సరఫరాదారుడి పేరు నమోదు చేయండి.');
      return;
    }
    const valid = formItems.filter((i) => i.veg && parseFloat(i.qty) > 0);
    if (!valid.length) {
      Alert.alert('ఐటమ్స్ లేవు', 'కనీసం ఒక కూరగాయ చేర్చండి.');
      return;
    }
    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'vendor_orders'), {
        vendor_id:      '',
        vendor_name:    formVendorName.trim(),
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
        placed_at:      serverTimestamp(),
        received_at:    null,
        payment_status: 'pending',
        created_at:     serverTimestamp(),
      });
      setOrders((prev) => [{
        id:           docRef.id,
        vendor_name:  formVendorName.trim(),
        order_date:   todayStr(),
        items: valid.map((i) => ({
          veg_name_te: i.veg.name_te,
          quantity:    parseFloat(i.qty),
          unit:        i.veg.unit ?? 'kg',
          buy_price:   parseFloat(i.price) || 0,
        })),
        total_amount: parseFloat(grandTotal.toFixed(2)),
        status:       'placed',
        placed_at:    null,
      }, ...prev]);
      setShowAdd(false);
      resetForm();
    } catch {
      Alert.alert('లోపం', 'సేవ్ విఫలమైంది. Connection check చేయండి.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const pending  = orders.filter((o) => o.status !== 'received');
  const received = orders.filter((o) => o.status === 'received');

  const filteredVegs = vegetables.filter((v) =>
    !vegSearch.trim() ||
    v.name_te.includes(vegSearch) ||
    v.name_en.toLowerCase().includes(vegSearch.toLowerCase())
  );

  const renderOrder = (order) => {
    const isReceived = order.status === 'received';
    const isToggling = toggling === order.id;
    return (
      <View key={order.id} style={[styles.orderCard, isReceived && styles.orderCardReceived]}>
        <View style={styles.orderHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderVendor}>{order.vendor_name}</Text>
            <Text style={styles.orderMeta}>
              {fmtDate(order.order_date)}
              {order.placed_at ? `  ·  ఆర్డర్: ${fmtTime(order.placed_at)}` : ''}
              {isReceived && order.received_at ? `  ·  అందింది: ${fmtTime(order.received_at)}` : ''}
            </Text>
          </View>
          <View style={styles.toggleWrap}>
            {isToggling ? (
              <ActivityIndicator size="small" color="#2d6a4f" />
            ) : (
              <>
                <Text style={[styles.toggleLabel, isReceived && styles.toggleLabelOn]}>
                  {isReceived ? 'అందింది ✓' : 'రాలేదు'}
                </Text>
                <Switch
                  value={isReceived}
                  onValueChange={() => toggleReceived(order)}
                  trackColor={{ false: '#ddd', true: '#74c69d' }}
                  thumbColor={isReceived ? '#2d6a4f' : '#aaa'}
                />
              </>
            )}
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}><Text style={styles.headerTitle}>ఆర్డర్లు</Text></View>
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
        {pending.length === 0 ? (
          <Text style={styles.emptyHint}>అన్నీ అందాయి 🎉{'\n'}No pending orders</Text>
        ) : (
          pending.map(renderOrder)
        )}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>అందిన ఆర్డర్లు / Received Today</Text>
          <View style={[styles.badge, { backgroundColor: '#d1e7dd' }]}>
            <Text style={[styles.badgeText, { color: '#0f5132' }]}>{received.length}</Text>
          </View>
        </View>
        {received.length === 0 ? (
          <Text style={styles.emptyHint}>ఇంకా అందలేదు{'\n'}None received yet today</Text>
        ) : (
          received.map(renderOrder)
        )}
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
            <TouchableOpacity
              onPress={() => { setShowAdd(false); resetForm(); }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Vendor — free text input, no Firestore lookup required */}
            <Text style={styles.label}>సరఫరాదారుడు / Vendor</Text>
            <TextInput
              style={styles.vendorInput}
              placeholder="వెండర్ పేరు టైప్ చేయండి (ఉదా: రాజు వెజ్)"
              placeholderTextColor="#888"
              value={formVendorName}
              onChangeText={setFormVendorName}
              returnKeyType="next"
              autoCapitalize="words"
            />

            {/* Items */}
            <Text style={[styles.label, { marginTop: 20 }]}>కూరగాయలు / Vegetables</Text>
            {formItems.map((item, idx) => (
              <View key={idx} style={styles.itemCard}>
                <TouchableOpacity
                  style={[styles.vegPickBtn, item.veg && styles.vegPickBtnFilled]}
                  onPress={() => setPickerIdx(idx)}
                >
                  <Text
                    style={[styles.vegPickText, item.veg && styles.vegPickTextFilled]}
                    numberOfLines={1}
                  >
                    {item.veg
                      ? `${item.veg.emoji ?? '🥬'}  ${item.veg.name_te}  /  ${item.veg.name_en}`
                      : '+ కూరగాయ ఎంచుకోండి'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>పరిమాణం</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={[styles.numInput, { flex: 1 }]}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#bbb"
                        value={item.qty}
                        onChangeText={(v) => {
                          const clean = v.replace(',', '.');
                          if (/^\d*\.?\d*$/.test(clean)) updateField(idx, 'qty', clean);
                        }}
                      />
                      <Text style={{ fontSize: 11, color: '#2d6a4f', fontWeight: '700' }}>
                        {UNIT_TE[item.veg?.unit] ?? 'కేజీ'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>కొనుగోలు ₹</Text>
                    <TextInput
                      style={styles.numInput}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="#bbb"
                      value={item.price}
                      onChangeText={(v) => {
                        const clean = v.replace(',', '.');
                        if (/^\d*\.?\d*$/.test(clean)) updateField(idx, 'price', clean);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>మొత్తం</Text>
                    <Text style={styles.lineTotal}>₹{item.lineTotal.toFixed(0)}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setFormItems((p) =>
                    p.length === 1 ? [newItem()] : p.filter((_, i) => i !== idx)
                  )}
                  style={{ alignSelf: 'flex-end', marginTop: 8 }}
                >
                  <Text style={{ fontSize: 12, color: '#e74c3c', fontWeight: '600' }}>✕ తొలగించు</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addItemBtn}
              onPress={() => setFormItems((p) => [...p, newItem()])}
            >
              <Text style={styles.addItemText}>+ వేరొక కూరగాయ</Text>
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
                {saving ? 'సేవ్ అవుతోంది...' : '✓ ఆర్డర్ పెట్టండి / Place Order'}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* ── Veg picker sheet — nested INSIDE Add Order Modal so Android renders it correctly ── */}
          <Modal
            visible={pickerIdx !== null}
            transparent
            animationType="slide"
            onRequestClose={() => { setPickerIdx(null); setVegSearch(''); }}
          >
            <View style={styles.overlay}>
              <View style={styles.sheet}>
                <View style={styles.handle} />
                <Text style={styles.sheetTitle}>కూరగాయ ఎంచుకోండి</Text>
                <TextInput
                  style={styles.sheetSearch}
                  placeholder="🔍 వెతకండి..."
                  placeholderTextColor="#888"
                  value={vegSearch}
                  onChangeText={setVegSearch}
                  clearButtonMode="while-editing"
                  autoFocus
                />
                <FlatList
                  data={filteredVegs}
                  keyExtractor={(v) => v.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.vegOption} onPress={() => pickVeg(item)}>
                      <Text style={{ fontSize: 28 }}>{item.emoji ?? '🥬'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.vegOptionTe}>{item.name_te}</Text>
                        <Text style={styles.vegOptionEn}>{item.name_en}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#2d6a4f', fontWeight: '700' }}>
                        {UNIT_TE[item.unit] ?? item.unit}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => (
                    <View style={{ height: 1, backgroundColor: '#f0f0f0', marginLeft: 62 }} />
                  )}
                />
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f7f0' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingVertical: 16, paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 13, color: '#a8d5b5', marginTop: 2 },

  addBtn:       { backgroundColor: '#52b788', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
  closeBtn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 16, color: '#fff', fontWeight: '700' },

  scroll: { padding: 16, paddingBottom: 48 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  badge:         { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:     { fontSize: 13, fontWeight: '700' },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    borderLeftWidth: 4, borderLeftColor: '#f6a623',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  orderCardReceived: { borderLeftColor: '#2d6a4f', backgroundColor: '#f8fff8' },
  orderHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  orderVendor:  { fontSize: 17, fontWeight: '700', color: '#1a472a' },
  orderMeta:    { fontSize: 12, color: '#888', marginTop: 2 },
  toggleWrap:   { alignItems: 'center', gap: 2 },
  toggleLabel:  { fontSize: 11, color: '#888', fontWeight: '600' },
  toggleLabelOn: { color: '#2d6a4f' },

  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    gap: 8,
  },
  itemName:  { flex: 2, fontSize: 14, fontWeight: '600', color: '#1a472a' },
  itemQty:   { flex: 1, fontSize: 13, color: '#555', textAlign: 'center' },
  itemPrice: { flex: 1, fontSize: 13, color: '#666', textAlign: 'center' },
  itemTotal: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1a472a', textAlign: 'right' },

  orderFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  orderTotal:  { fontSize: 15, fontWeight: '700', color: '#1a472a' },

  // Form
  label: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  vendorInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: '#b7e4c7',
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16, color: '#1a1a1a', marginBottom: 4,
  },

  itemCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  vegPickBtn:        { borderWidth: 2, borderColor: '#b7e4c7', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, backgroundColor: '#f8fff8' },
  vegPickBtnFilled:  { borderStyle: 'solid', borderColor: '#2d6a4f', backgroundColor: '#e8f5ec' },
  vegPickText:       { fontSize: 14, color: '#888' },
  vegPickTextFilled: { color: '#1a472a', fontWeight: '600' },

  inputRow:   { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  inputLabel: { fontSize: 11, color: '#666', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  numInput:   { height: 44, borderWidth: 1.5, borderColor: '#b7e4c7', borderRadius: 8, paddingHorizontal: 10, fontSize: 16, fontWeight: '600', color: '#1a1a1a', backgroundColor: '#f8fff8', textAlign: 'center' },
  lineTotal:  { height: 44, lineHeight: 44, fontSize: 16, fontWeight: '700', color: '#1a472a', textAlign: 'center' },

  addItemBtn:  { borderWidth: 2, borderColor: '#2d6a4f', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addItemText: { fontSize: 15, color: '#2d6a4f', fontWeight: '700' },

  grandTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e8f5ec', borderRadius: 12, padding: 18, marginBottom: 16 },
  grandTotalLabel: { fontSize: 16, fontWeight: '600', color: '#444' },
  grandTotalValue: { fontSize: 28, fontWeight: 'bold', color: '#1a472a' },

  saveBtn:     { backgroundColor: '#2d6a4f', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  emptyHint: { textAlign: 'center', color: '#888', fontSize: 15, marginTop: 20, marginBottom: 10, lineHeight: 26 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 24 },
  handle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 12, marginBottom: 12 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: '#1a472a', paddingHorizontal: 20, marginBottom: 12 },
  sheetSearch: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#f0f7f0', borderRadius: 10, borderWidth: 1, borderColor: '#b7e4c7', paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 15, color: '#1a1a1a' },
  vegOption:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  vegOptionTe: { fontSize: 17, fontWeight: '600', color: '#1a472a' },
  vegOptionEn: { fontSize: 13, color: '#666', marginTop: 1 },
});
