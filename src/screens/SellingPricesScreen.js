import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection, doc, setDoc, getDocs, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { LocalDB }  from '../services/LocalDB';
import { SyncQueue } from '../services/SyncQueue';
import SyncIndicator from '../components/SyncIndicator';
import AppHeader from '../components/AppHeader';
import { Voice } from '../services/Speak';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

const DEFAULT_VEGETABLES = [
  { id: 'tomato',       name_te: 'టమాటా',        name_en: 'Tomato',        emoji: '🍅', unit: 'kg'     },
  { id: 'onion',        name_te: 'ఉల్లిపాయ',     name_en: 'Onion',         emoji: '🧅', unit: 'kg'     },
  { id: 'potato',       name_te: 'బంగాళాదుంప',   name_en: 'Potato',        emoji: '🥔', unit: 'kg'     },
  { id: 'brinjal',      name_te: 'వంకాయ',         name_en: 'Brinjal',       emoji: '🍆', unit: 'kg'     },
  { id: 'ladyfinger',   name_te: 'బెండకాయ',       name_en: 'Lady Finger',   emoji: '🫛', unit: 'kg'     },
  { id: 'beans',        name_te: 'చిక్కుడు',      name_en: 'Beans',         emoji: '🫘', unit: 'kg'     },
  { id: 'carrot',       name_te: 'క్యారెట్',       name_en: 'Carrot',        emoji: '🥕', unit: 'kg'     },
  { id: 'cabbage',      name_te: 'క్యాబేజీ',       name_en: 'Cabbage',       emoji: '🥬', unit: 'kg'     },
  { id: 'capsicum',     name_te: 'క్యాప్సికం',    name_en: 'Capsicum',      emoji: '🫑', unit: 'kg'     },
  { id: 'cucumber',     name_te: 'దోసకాయ',        name_en: 'Cucumber',      emoji: '🥒', unit: 'kg'     },
  { id: 'spinach',      name_te: 'పాలకూర',         name_en: 'Spinach',       emoji: '🥬', unit: 'bundle' },
  { id: 'coriander',    name_te: 'కొత్తిమీర',      name_en: 'Coriander',     emoji: '🌿', unit: 'bundle' },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TE_DAYS   = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Friendly "21 Jun 2026" for the date pill
function friendlyDate() {
  const d = new Date();
  return `${d.getDate()} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function teluguDay() {
  return TE_DAYS[new Date().getDay()];
}

function buildEditMode(vegList, priceMap) {
  const initEdit = {};
  vegList.forEach((v) => {
    if (!priceMap[v.id] || !parseFloat(priceMap[v.id])) initEdit[v.id] = true;
  });
  return initEdit;
}

export default function SellingPricesScreen() {
  const [vegetables, setVegetables] = useState(DEFAULT_VEGETABLES);
  const [sellPrices, setSellPrices] = useState({});
  const [buyPrices,  setBuyPrices]  = useState({});
  const [editMode,   setEditMode]   = useState({}); // { veg_id: true } = row is in edit mode
  const [saving,     setSaving]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [lastSaved,  setLastSaved]  = useState(null);

  // Reload on focus so newly-received vendor orders (buy-price hints) and any
  // prices set elsewhere show up without needing an app restart.
  useFocusEffect(useCallback(() => { loadAll(); }, []));

  const loadAll = async () => {
    const date = todayStr();

    // ── 1. INSTANT: render from local cache (no spinner wait) ────────────────
    const cachedVegs = await LocalDB.get('cache_vegetables');
    let vegList = (cachedVegs?.length ? cachedVegs : DEFAULT_VEGETABLES)
      .filter((v) => v.active !== false)
      .sort((a, b) => (a.name_en ?? '').localeCompare(b.name_en ?? ''));
    setVegetables(vegList);

    const cachedPrices = await LocalDB.get(`prices_${date}`);
    let loaded = {};
    if (cachedPrices) {
      Object.entries(cachedPrices).forEach(([id, data]) => {
        loaded[id] = String(data.sell_price ?? data.price ?? '');
      });
      setSellPrices(loaded);
      setEditMode(buildEditMode(vegList, loaded));
    }

    // Show the UI immediately — Firestore refines in the background
    setLoading(false);

    // ── 2. BACKGROUND: refresh from Firestore in parallel ────────────────────
    try {
      const [vegSnap, priceSnap, ordSnap] = await Promise.all([
        getDocs(collection(db, 'vegetables')),
        getDocs(collection(db, 'prices', date, 'vegetables')),
        getDocs(query(
          collection(db, 'vendor_orders'),
          where('order_date', '==', date),
          where('status', '==', 'received'),
        )),
      ]);

      if (vegSnap.docs.length > 0) {
        vegList = vegSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((v) => v.active !== false)
          .sort((a, b) => (a.name_en ?? '').localeCompare(b.name_en ?? ''));
        setVegetables(vegList);
        await LocalDB.set('cache_vegetables', vegList);
      }

      if (priceSnap.docs.length > 0) {
        loaded = {};
        priceSnap.forEach((d) => {
          const data = d.data();
          loaded[d.id] = String(data.sell_price ?? data.price ?? '');
        });
        setSellPrices(loaded);
      }
      setEditMode(buildEditMode(vegList, loaded));

      const buyMap = {};
      ordSnap.docs.forEach((d) => {
        (d.data().items || []).forEach((item) => {
          if (item.veg_id && item.buy_price) {
            if (!buyMap[item.veg_id] || item.buy_price < buyMap[item.veg_id]) {
              buyMap[item.veg_id] = item.buy_price;
            }
          }
        });
      });
      setBuyPrices(buyMap);
    } catch { /* offline — cached values already shown */ }
  };

  const handleChange = (id, value) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setSellPrices((prev) => ({ ...prev, [id]: value }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const dateStr = todayStr();

    // Build prices data
    const pricesMap = {};
    vegetables.forEach((veg) => {
      pricesMap[veg.id] = {
        veg_id:      veg.id,
        teluguName:  veg.name_te,
        englishName: veg.name_en,
        sell_price:  parseFloat(sellPrices[veg.id]) || 0,
        price:       parseFloat(sellPrices[veg.id]) || 0,
        unit:        veg.unit ?? 'kg',
      };
    });

    // 1. Save to LocalDB immediately
    await LocalDB.set(`prices_${dateStr}`, pricesMap);

    // 2. Update UI immediately
    const now = new Date().toLocaleTimeString('te-IN', { hour: '2-digit', minute: '2-digit' });
    setLastSaved(now);
    setEditMode({});
    setSaving(false);
    Voice.speak('ధరలు సేవ్ అయ్యాయి'); // "prices saved"

    // 3. Sync to Firestore in background
    try {
      await Promise.all(
        vegetables.map((veg) =>
          setDoc(doc(db, 'prices', dateStr, 'vegetables', veg.id), {
            ...pricesMap[veg.id],
            updatedAt: serverTimestamp(),
          })
        )
      );
    } catch {
      // Queue each price doc for retry
      for (const veg of vegetables) {
        await SyncQueue.add({
          type:  'setDoc',
          path:  ['prices', dateStr, 'vegetables', veg.id],
          data:  pricesMap[veg.id],
          merge: true,
        });
      }
    }
  };

  const renderItem = ({ item }) => {
    const buyPrice  = buyPrices[item.id];
    const sellVal   = sellPrices[item.id] ?? '';
    const margin    = buyPrice && parseFloat(sellVal) ? parseFloat(sellVal) - buyPrice : null;
    const isEditing = editMode[item.id] === true;

    return (
      <View style={styles.row}>
        <Text style={styles.emoji}>{item.emoji ?? '🥬'}</Text>
        <View style={styles.nameCol}>
          <Text style={styles.teluguName}>{item.name_te}</Text>
          <Text style={styles.englishName}>{item.name_en}</Text>
          {buyPrice ? (
            <Text style={styles.buyHint}>
              కొనుగోలు ధర: ₹{buyPrice}{margin !== null ? `  ·  లాభం: ₹${margin.toFixed(0)}` : ''}
            </Text>
          ) : null}
        </View>

        {isEditing ? (
          // Edit mode — show TextInput
          <View style={styles.priceCol}>
            <View>
              <Text style={styles.priceLabel}>అమ్మకపు ధర · Selling price per kg</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  style={[styles.input, margin !== null && margin < 0 && styles.inputLoss]}
                  keyboardType="decimal-pad"
                  placeholder={buyPrice ? `కొనుగోలు ధర: ₹${buyPrice}` : '0'}
                  placeholderTextColor="#aaa"
                  value={sellVal}
                  onChangeText={(v) => handleChange(item.id, v)}
                  onBlur={() => { if (parseFloat(sellVal) > 0) Voice.speak(`${item.name_te}, ${Voice.money(sellVal)}`); }}
                  returnKeyType="next"
                />
                <Text style={styles.unit}>/{UNIT_TE[item.unit] ?? 'కేజీ'}</Text>
              </View>
            </View>
          </View>
        ) : (
          // View mode — show price text + pencil edit button
          <View style={styles.priceViewCol}>
            <Text style={styles.priceViewText}>
              ₹{sellVal || '0'}/{UNIT_TE[item.unit] ?? 'కేజీ'}
            </Text>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => { setEditMode((prev) => ({ ...prev, [item.id]: true })); Voice.speak(item.name_te); }}
            >
              <Text style={styles.editBtnText}>✏️</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader title="ధరలు" subtitle="Today's Selling Prices" showDate />
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <AppHeader
          title="ధరలు"
          subtitle={lastSaved ? `✓ సేవ్ అయింది ${lastSaved}` : "Today's Selling Prices"}
          showDate
        />

        {Object.keys(buyPrices).length === 0 && (
          <View style={styles.hintBanner}>
            <Text style={styles.hintBannerText}>
              💡 ఆర్డర్లు అందిన తర్వాత కొనుగోలు ధర సూచన కనిపిస్తుంది
            </Text>
          </View>
        )}

        <FlatList
          data={vegetables}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'సేవ్ అవుతోంది...' : '✓  ధరలు సేవ్ చేయండి / Save Prices'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f7f0' },

  header: {
    backgroundColor: '#1a472a',
    paddingVertical: 16, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  headerSub:   { fontSize: 12, color: '#a8d5b5', marginTop: 2 },
  savedAt:     { fontSize: 12, color: '#9be7b4', marginTop: 5, fontWeight: '600' },

  datePill:     { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 7, alignItems: 'center', minWidth: 92 },
  datePillDay:  { fontSize: 11, color: '#2d6a4f', fontWeight: '700' },
  datePillDate: { fontSize: 14, color: '#1a472a', fontWeight: '800', marginTop: 1 },

  hintBanner: {
    backgroundColor: '#fff3cd', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#ffc107',
  },
  hintBannerText: { fontSize: 12, color: '#856404' },

  list: { padding: 12, gap: 8, paddingBottom: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    gap: 10,
  },
  emoji:       { fontSize: 26 },
  nameCol:     { flex: 1 },
  teluguName:  { fontSize: 16, fontWeight: '600', color: '#1a472a' },
  englishName: { fontSize: 12, color: '#666', marginTop: 1 },
  buyHint:     { fontSize: 11, color: '#2d6a4f', marginTop: 3, fontWeight: '500' },

  // Edit mode — TextInput
  priceCol:   { alignItems: 'flex-end' },
  priceLabel: { fontSize: 10, color: '#888', marginBottom: 4, textAlign: 'right' },
  rupee:      { fontSize: 18, color: '#2d6a4f', fontWeight: '600' },
  input: {
    width: 72, height: 44,
    borderWidth: 1.5, borderColor: '#b7e4c7', borderRadius: 8,
    paddingHorizontal: 8, fontSize: 16, color: '#1a1a1a',
    backgroundColor: '#f8fff8', textAlign: 'right', fontWeight: '600',
  },
  inputLoss: { borderColor: '#e74c3c', color: '#e74c3c' },
  unit:      { fontSize: 12, color: '#555' },

  // View mode — price text + pencil
  priceViewCol:  { alignItems: 'flex-end', gap: 6 },
  priceViewText: { fontSize: 17, fontWeight: '700', color: '#2d6a4f' },
  editBtn:       { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f0fff4', borderRadius: 8, borderWidth: 1, borderColor: '#b7e4c7' },
  editBtnText:   { fontSize: 16 },

  saveBtn:         { margin: 16, backgroundColor: '#2d6a4f', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#74c69d' },
  saveBtnText:     { color: '#fff', fontSize: 17, fontWeight: '700' },
});
