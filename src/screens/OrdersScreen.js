import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, Alert, Modal, TextInput, ScrollView,
  ActivityIndicator, Platform, Switch,
} from 'react-native';
import {
  collection, addDoc, updateDoc, getDocs, doc,
  serverTimestamp, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const today = todayStr();
  if (dateStr === today) return 'ఈరోజు';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const newItem = () => ({ veg: null, qty: '', price: '', lineTotal: 0 });

export default function OrdersScreen() {
  const [orders,     setOrders]     = useState([]);
  const [vendors,    setVendors]    = useState([]);
  const [vegetables, setVegs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [toggling,   setToggling]   = useState(null); // order id being toggled
  const [showAdd,    setShowAdd]    = useState(false);

  // Add-order form state
  const [formVendor,  setFormVendor]  = useState(null);
  const [formItems,   setFormItems]   = useState([newItem()]);
  const [saving,      setSaving]      = useState(false);
  const [pickerIdx,   setPickerIdx]   = useState(null);
  const [vegSearch,   setVegSearch]   = useState('');
  const [vendorSearch, setVendorSearch] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [vSnap, vegSnap, ordSnap] = await Promise.all([
        getDocs(collection(db, 'vendors')),
        getDocs(collection(db, 'vegetables')),
        getDocs(query(
          collection(db, 'vendor_orders'),
          orderBy('placed_at', 'desc'),
        )),
      ]);
      setVendors(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.active !== false));
      setVegs(vegSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.active !== false).sort((a, b) => a.name_en.localeCompare(b.name_en)));

      const today = todayStr();
      const all = ordSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Show: all pending orders (any date) + today's received orders
      const visible = all.filter(
        (o) => o.status !== 'received' || o.order_date === today
      );
      setOrders(visible);
    } catch (e) {
      console.warn('OrdersScreen load error:', e);
    } finally {
      setLoading(false);
    }
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
        prev.map((o) =>
          o.id === order.id ? { ...o, status: newStatus } : o
        )
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
    setFormVendor(null);
    setFormItems([newItem()]);
    setVendorSearch('');
  };

  const handleSave = async () => {
    if (!formVendor) {
      Alert.alert('వెండర్ లేదు', 'సరఫరాదారుని ఎంచుకోండి.');
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
        vendor_id:      formVendor.id,
        vendor_name:    formVendor.name,
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
        id:          docRef.id,
        vendor_name: formVendor.name,
        order_date:  todayStr(),
        items:       valid.map((i) => ({ veg_name_te: i.veg.name_te, quantity: parseFloat(i.qty), unit: i.veg.unit ?? 'kg', buy_price: parseFloat(i.price) || 0 })),
        total_amount: parseFloat(grandTotal.toFixed(2)),
        status:      'placed',
        placed_at:   null,
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

  const filteredVegs    = vegetables.filter((v) => !vegSearch.trim() || v.name_te.includes(vegSearch) || v.name_en.toLowerCase().includes(vegSearch.toLowerCase()));
  const filteredVendors = vendors.filter((v) => !vendorSearch.trim() || v.name.toLowerCase().includes(vendorSearch.toLowerCase()));

  const renderOrder = (order) => {
    const isReceived = order.status === 'received';
    const isToggling = toggling === order.id;
    return (
      <View key={order.id} style={[styles.orderCard, isReceived && styles.orderCardReceived]}>
        {/* Header row */}
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

        {/* Items */}
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
      {/* Header */}
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
        {/* Pending section */}
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

        {/* Received section */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>అందిన ఆర్డర్లు / Received Today</Text>
          <View style={[styles.badge, { backgroundColor: '#d1e7dd' }]}>
            <Text style={[styles.badgeText, { color: '#0f5132' }]}>{received.length}</Text>
          </View>
        </View>
        {received.length === 0 ? (
          <Text style={styles.emptyHint}>ఇంకా అందలేదు\nNone received yet today</Text>
        ) : (
          received.map(renderOrder)
        )}
      </ScrollView>

      {/* ── Add Order Modal ── */}
      <Modal visible={showAdd} animationType="slide" onRequestClose={() => { setShowAdd(false); resetForm(); }}>
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
            {/* Vendor picker */}
            <Text style={styles.label}>సరఫరాదారుడు / Vendor</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 వెండర్ వెతకండి..."
              placeholderTextColor="#888"
              value={vendorSearch}
              onChangeText={setVendorSearch}
            />
            {filteredVendors.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.vendorCard, formVendor?.id === v.id && styles.vendorCardActive]}
                onPress={() => setFormVendor(v)}
              >
                <View style={[styles.radio, formVendor?.id === v.id && styles.radioActive]}>
                  {formVendor?.id === v.id && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.vendorName, formVendor?.id === v.id && { color: '#2d6a4f' }]}>{v.name}</Text>
                  <Text style={styles.vendorArea}>{v.area}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Items */}
            <Text style={[styles.label, { marginTop: 20 }]}>కూరగాయలు / Vegetables</Text>
            {formItems.map((item, idx) => (
              <View key={idx} style={styles.itemCard}>
                <TouchableOpacity
                  style={[styles.vegPickBtn, item.veg && styles.vegPickBtnFilled]}
                  onPress={() => setPickerIdx(idx)}
                >
                  <Text style={[styles.vegPickText, item.veg && styles.vegPickTextFilled]} numberOfLines={1}>
                    {item.veg ? `${item.veg.emoji ?? '🥬'}  ${item.veg.name_te}  /  ${item.veg.name_en}` : '+ కూరగాయ ఎంచుకోండి'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>పరిమాణం</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={[styles.numInput, { flex: 1 }]}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#bbb"
                        value={item.qty}
                        onChangeText={(v) => /^\d*\.?\d*$/.test(v) && updateField(idx, 'qty', v)}
                      />
                      <Text style={{ fontSize: 11, color: '#2d6a4f', fontWeight: '700' }}>{UNIT_TE[item.veg?.unit] ?? 'కేజీ'}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>కొనుగోలు ₹</Text>
                    <TextInput
                      style={styles.numInput}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#bbb"
                      value={item.price}
                      onChangeText={(v) => /^\d*\.?\d*$/.test(v) && updateField(idx, 'price', v)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>మొత్తం</Text>
                    <Text style={styles.lineTotal}>₹{item.lineTotal.toFixed(0)}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setFormItems((p) => p.length === 1 ? [newItem()] : p.filter((_, i) => i !== idx))} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: '#e74c3c', fontWeight: '600' }}>✕ తొలగించు</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={() => setFormItems((p) => [...p, newItem()])}>
              <Text style={styles.addItemText}>+ వేరొక కూరగాయ</Text>
            </TouchableOpacity>

            {/* Grand total */}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>మొత్తం బిల్లు</Text>
              <Text style={styles.grandTotalValue}>₹{grandTotal.toFixed(2)}</Text>
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { backgroundColor: '#74c69d' }]} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'సేవ్ అవుతోంది...' : '✓ ఆర్డర్ పెట్టండి / Place Order'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Veg picker sheet ── */}
      <Modal visible={pickerIdx !== null} transparent animationType="slide" onRequestClose={() => { setPickerIdx(null); setVegSearch(''); }}>
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
                  <Text style={{ fontSize: 12, color: '#2d6a4f', fontWeight: '700' }}>{UNIT_TE[item.unit] ?? item.unit}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f0f0f0', marginLeft: 62 }} />}
            />
          </View>
        </View>
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

  addBtn:     { backgroundColor: '#52b788', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  closeBtn:   { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 16, color: '#fff', fontWeight: '700' },

  scroll: { padding: 16, paddingBottom: 48 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  badge:         { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:     { fontSize: 13, fontWeight: '700' },

  // Order card
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
  label:       { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5, borderColor: '#b7e4c7',
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15, color: '#1a1a1a', marginBottom: 10,
  },
  vendorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 2, borderColor: '#e0f0e8',
  },
  vendorCardActive: { borderColor: '#2d6a4f', backgroundColor: '#f0fff4' },
  radio:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#b7e4c7', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#2d6a4f' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2d6a4f' },
  vendorName: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  vendorArea: { fontSize: 12, color: '#666', marginTop: 2 },

  itemCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  vegPickBtn:       { borderWidth: 2, borderColor: '#b7e4c7', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, backgroundColor: '#f8fff8' },
  vegPickBtnFilled: { borderStyle: 'solid', borderColor: '#2d6a4f', backgroundColor: '#e8f5ec' },
  vegPickText:      { fontSize: 14, color: '#888' },
  vegPickTextFilled: { color: '#1a472a', fontWeight: '600' },

  inputRow:   { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  inputLabel: { fontSize: 11, color: '#666', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  numInput:   { height: 44, borderWidth: 1.5, borderColor: '#b7e4c7', borderRadius: 8, paddingHorizontal: 10, fontSize: 16, fontWeight: '600', color: '#1a1a1a', backgroundColor: '#f8fff8', textAlign: 'center' },
  lineTotal:  { height: 44, lineHeight: 44, fontSize: 16, fontWeight: '700', color: '#1a472a', textAlign: 'center' },

  addItemBtn:  { borderWidth: 2, borderColor: '#2d6a4f', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addItemText: { fontSize: 15, color: '#2d6a4f', fontWeight: '700' },

  grandTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e8f5ec', borderRadius: 12, padding: 18, marginBottom: 16 },
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
