import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const newItem = () => ({ veg: null, qty: '', price: '', lineTotal: 0 });

export default function VendorOrder() {
  const [vendors,    setVendors]   = useState([]);
  const [vegetables, setVegs]      = useState([]);
  const [vendor,     setVendor]    = useState(null);
  const [items,      setItems]     = useState([newItem()]);
  const [loading,    setLoading]   = useState(true);
  const [saving,     setSaving]    = useState(false);
  const [pickerIdx,  setPickerIdx] = useState(null); // item index being edited
  const [vegSearch,  setVegSearch] = useState('');

  useEffect(() => {
    Promise.all([loadVendors(), loadVegetables()]).finally(() => setLoading(false));
  }, []);

  const loadVendors = async () => {
    try {
      const snap = await getDocs(collection(db, 'vendors'));
      setVendors(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((v) => v.active !== false)
      );
    } catch { /* offline */ }
  };

  const loadVegetables = async () => {
    try {
      const snap = await getDocs(collection(db, 'vegetables'));
      setVegs(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((v) => v.active !== false)
          .sort((a, b) => a.name_en.localeCompare(b.name_en))
      );
    } catch { /* offline */ }
  };

  // ── Item editing ──────────────────────────────────────────────────────────────

  const updateField = (idx, field, value) => {
    setItems((prev) => {
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
    setItems((prev) => {
      const next = [...prev];
      next[pickerIdx] = { ...next[pickerIdx], veg };
      return next;
    });
    setPickerIdx(null);
    setVegSearch('');
  };

  const addItem = () => setItems((prev) => [...prev, newItem()]);

  const removeItem = (idx) =>
    setItems((prev) =>
      prev.length === 1 ? [newItem()] : prev.filter((_, i) => i !== idx)
    );

  const grandTotal = items.reduce((s, i) => s + i.lineTotal, 0);

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!vendor) {
      Alert.alert('వెండర్ లేదు', 'ముందు సరఫరాదారుని ఎంచుకోండి.\nSelect a vendor first.');
      return;
    }
    const valid = items.filter((i) => i.veg && parseFloat(i.qty) > 0);
    if (!valid.length) {
      Alert.alert('ఐటమ్స్ లేవు', 'కనీసం ఒక కూరగాయ నమోదు చేయండి.\nAdd at least one vegetable.');
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, 'vendor_orders'), {
        vendor_id:      vendor.id,
        vendor_name:    vendor.name,
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
        payment_status: 'pending',
        created_at:     serverTimestamp(),
      });

      Alert.alert(
        '✓ నమోదు అయింది / Order Saved',
        `${vendor.name} నుండి సరుకు సేవ్ అయింది.\nమొత్తం / Total: ₹${grandTotal.toFixed(2)}`
      );
      setItems([newItem()]);
      setVendor(null);
    } catch {
      Alert.alert('లోపం / Error', 'సేవ్ చేయడం విఫలమైంది.\nFailed to save. Check connection.');
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered veg list for picker ──────────────────────────────────────────────

  const filteredVegs = vegetables.filter((v) => {
    if (!vegSearch.trim()) return true;
    const q = vegSearch.toLowerCase();
    return v.name_te.includes(vegSearch) || v.name_en.toLowerCase().includes(q);
  });

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>సరుకు వచ్చింది</Text>
          <Text style={styles.headerSub}>Vendor Order — {todayStr()}</Text>
        </View>
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>సరుకు వచ్చింది</Text>
        <Text style={styles.headerSub}>Vendor Order — {todayStr()}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Vendor selector ── */}
        <Text style={styles.sectionLabel}>సరఫరాదారుడు / Vendor</Text>

        {vendors.length === 0 ? (
          <Text style={styles.emptyHint}>వెండర్లు లోడ్ అవుతున్నారు...\nLoading vendors...</Text>
        ) : (
          vendors.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[styles.vendorCard, vendor?.id === v.id && styles.vendorCardActive]}
              onPress={() => setVendor(v)}
              activeOpacity={0.8}
            >
              <View style={[styles.radio, vendor?.id === v.id && styles.radioActive]}>
                {vendor?.id === v.id && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.vendorName, vendor?.id === v.id && styles.vendorNameActive]}>
                  {v.name}
                </Text>
                <Text style={styles.vendorArea}>{v.area}</Text>
                {v.phone ? <Text style={styles.vendorPhone}>{v.phone}</Text> : null}
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* ── Item list (shown after vendor selected) ── */}
        {vendor && (
          <>
            <Text style={styles.sectionLabel}>కూరగాయలు / Vegetables</Text>

            {items.map((item, idx) => (
              <View key={idx} style={styles.itemCard}>
                {/* Vegetable picker button */}
                <TouchableOpacity
                  style={[styles.vegPickBtn, item.veg && styles.vegPickBtnFilled]}
                  onPress={() => setPickerIdx(idx)}
                >
                  <Text style={[styles.vegPickText, item.veg && styles.vegPickTextFilled]} numberOfLines={1}>
                    {item.veg
                      ? `${item.veg.emoji ?? '🥬'}  ${item.veg.name_te}  /  ${item.veg.name_en}`
                      : '+ కూరగాయ ఎంచుకోండి / Pick vegetable'}
                  </Text>
                </TouchableOpacity>

                {/* Qty | Price | Line total */}
                <View style={styles.itemRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>పరిమాణం</Text>
                    <View style={styles.inputWithBadge}>
                      <TextInput
                        style={styles.numInput}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#bbb"
                        value={item.qty}
                        onChangeText={(v) => /^\d*\.?\d*$/.test(v) && updateField(idx, 'qty', v)}
                      />
                      <Text style={styles.unitBadge}>
                        {UNIT_TE[item.veg?.unit] ?? 'కేజీ'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
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

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>మొత్తం</Text>
                    <Text style={styles.lineTotal}>₹{item.lineTotal.toFixed(2)}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(idx)}>
                  <Text style={styles.removeBtnText}>✕ తొలగించు / Remove</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Text style={styles.addItemText}>+ వేరొక కూరగాయ చేర్చు / Add Another</Text>
            </TouchableOpacity>

            {/* Grand total */}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>మొత్తం బిల్లు / Grand Total</Text>
              <Text style={styles.grandTotalValue}>₹{grandTotal.toFixed(2)}</Text>
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'సేవ్ అవుతోంది...' : '✓ ఆర్డర్ నమోదు చేయండి / Save Order'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {!vendor && vendors.length > 0 && (
          <Text style={styles.emptyHint}>
            ↑ ముందుగా సరఫరాదారుని ఎంచుకోండి{'\n'}Select a vendor above to continue
          </Text>
        )}
      </ScrollView>

      {/* ── Vegetable picker modal ── */}
      <Modal
        visible={pickerIdx !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setPickerIdx(null); setVegSearch(''); }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>కూరగాయ ఎంచుకోండి / Select Vegetable</Text>
            <TextInput
              style={styles.sheetSearch}
              placeholder="🔍 వెతకండి / Search..."
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
                  <Text style={styles.vegOptionEmoji}>{item.emoji ?? '🥬'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vegOptionTe}>{item.name_te}</Text>
                    <Text style={styles.vegOptionEn}>{item.name_en}</Text>
                  </View>
                  <Text style={styles.vegOptionUnit}>{UNIT_TE[item.unit] ?? item.unit}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f0f7f0' },

  header: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 13, color: '#a8d5b5', marginTop: 2 },

  scrollContent: { padding: 16, paddingBottom: 48 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 10,
  },

  // Vendor card
  vendorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#e0f0e8',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  vendorCardActive: { borderColor: '#2d6a4f', backgroundColor: '#f0fff4' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#b7e4c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive:  { borderColor: '#2d6a4f' },
  radioDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2d6a4f' },
  vendorName:   { fontSize: 17, fontWeight: '700', color: '#1a472a' },
  vendorNameActive: { color: '#2d6a4f' },
  vendorArea:   { fontSize: 13, color: '#666', marginTop: 2 },
  vendorPhone:  { fontSize: 12, color: '#888', marginTop: 1 },

  // Item card
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  vegPickBtn: {
    borderWidth: 2,
    borderColor: '#b7e4c7',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#f8fff8',
  },
  vegPickBtnFilled:  { borderStyle: 'solid', borderColor: '#2d6a4f', backgroundColor: '#e8f5ec' },
  vegPickText:       { fontSize: 14, color: '#888' },
  vegPickTextFilled: { color: '#1a472a', fontWeight: '600' },

  itemRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 11, color: '#666', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  inputWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  numInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#b7e4c7',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    backgroundColor: '#f8fff8',
    textAlign: 'center',
  },
  unitBadge: {
    fontSize: 11,
    color: '#2d6a4f',
    fontWeight: '700',
  },
  lineTotal: {
    height: 44,
    lineHeight: 44,
    fontSize: 16,
    fontWeight: '700',
    color: '#1a472a',
    textAlign: 'center',
  },

  removeBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  removeBtnText: { fontSize: 12, color: '#e74c3c', fontWeight: '600' },

  addItemBtn: {
    borderWidth: 2,
    borderColor: '#2d6a4f',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  addItemText: { fontSize: 15, color: '#2d6a4f', fontWeight: '700' },

  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f5ec',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '600', color: '#444' },
  grandTotalValue: { fontSize: 28, fontWeight: 'bold', color: '#1a472a' },

  saveBtn: {
    backgroundColor: '#2d6a4f',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#74c69d' },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  emptyHint: {
    textAlign: 'center',
    color: '#888',
    fontSize: 15,
    marginTop: 32,
    lineHeight: 26,
  },

  // Veg picker modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginTop: 12, marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18, fontWeight: '700', color: '#1a472a',
    paddingHorizontal: 20, marginBottom: 12,
  },
  sheetSearch: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#f0f7f0',
    borderRadius: 10, borderWidth: 1, borderColor: '#b7e4c7',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15, color: '#1a1a1a',
  },
  vegOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 14,
  },
  vegOptionEmoji: { fontSize: 28 },
  vegOptionTe:    { fontSize: 17, fontWeight: '600', color: '#1a472a' },
  vegOptionEn:    { fontSize: 13, color: '#666', marginTop: 1 },
  vegOptionUnit:  { fontSize: 13, color: '#2d6a4f', fontWeight: '700' },
  sep:            { height: 1, backgroundColor: '#f0f0f0', marginLeft: 62 },
});
