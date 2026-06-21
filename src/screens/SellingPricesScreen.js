import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import {
  collection, doc, setDoc, getDocs, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };

const DEFAULT_VEGETABLES = [
  { id: 'tomato',     name_te: 'టమాటా',       name_en: 'Tomato',       emoji: '🍅', unit: 'kg' },
  { id: 'onion',      name_te: 'ఉల్లిపాయ',    name_en: 'Onion',        emoji: '🧅', unit: 'kg' },
  { id: 'potato',     name_te: 'బంగాళాదుంప',  name_en: 'Potato',       emoji: '🥔', unit: 'kg' },
  { id: 'brinjal',    name_te: 'వంకాయ',       name_en: 'Brinjal',      emoji: '🍆', unit: 'kg' },
  { id: 'ladyfinger', name_te: 'బెండకాయ',     name_en: 'Lady Finger',  emoji: '🫛', unit: 'kg' },
  { id: 'beans',      name_te: 'చిక్కుడు',    name_en: 'Beans',        emoji: '🫘', unit: 'kg' },
  { id: 'carrot',     name_te: 'క్యారెట్',    name_en: 'Carrot',       emoji: '🥕', unit: 'kg' },
  { id: 'cabbage',    name_te: 'క్యాబేజీ',    name_en: 'Cabbage',      emoji: '🥬', unit: 'kg' },
  { id: 'capsicum',   name_te: 'క్యాప్సికం',  name_en: 'Capsicum',     emoji: '🫑', unit: 'kg' },
  { id: 'cucumber',   name_te: 'దోసకాయ',      name_en: 'Cucumber',     emoji: '🥒', unit: 'kg' },
  { id: 'spinach',    name_te: 'పాలకూర',      name_en: 'Spinach',      emoji: '🥬', unit: 'bundle' },
  { id: 'coriander',  name_te: 'కొత్తిమీర',   name_en: 'Coriander',    emoji: '🌿', unit: 'bundle' },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SellingPricesScreen() {
  const [vegetables, setVegetables] = useState(DEFAULT_VEGETABLES);
  const [sellPrices, setSellPrices] = useState({});
  const [buyPrices,  setBuyPrices]  = useState({}); // from today's received orders
  const [saving,     setSaving]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [lastSaved,  setLastSaved]  = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      // Load vegetable master list
      const vegSnap = await getDocs(collection(db, 'vegetables'));
      if (vegSnap.docs.length > 0) {
        setVegetables(
          vegSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((v) => v.active !== false)
            .sort((a, b) => (a.name_en ?? '').localeCompare(b.name_en ?? ''))
        );
      }
    } catch { /* use defaults */ }

    try {
      // Load today's existing sell prices
      const priceSnap = await getDocs(collection(db, 'prices', todayStr(), 'vegetables'));
      const loaded = {};
      priceSnap.forEach((d) => {
        const data = d.data();
        loaded[d.id] = String(data.sell_price ?? data.price ?? '');
      });
      setSellPrices(loaded);
    } catch { /* first run or offline */ }

    try {
      // Load today's RECEIVED orders to show buy price hints
      const ordSnap = await getDocs(
        query(
          collection(db, 'vendor_orders'),
          where('order_date', '==', todayStr()),
          where('status', '==', 'received'),
        )
      );
      const buyMap = {};
      ordSnap.docs.forEach((d) => {
        (d.data().items || []).forEach((item) => {
          if (item.veg_id && item.buy_price) {
            // Keep lowest buy price if multiple vendors
            if (!buyMap[item.veg_id] || item.buy_price < buyMap[item.veg_id]) {
              buyMap[item.veg_id] = item.buy_price;
            }
          }
        });
      });
      setBuyPrices(buyMap);
    } catch { /* no orders yet */ }

    setLoading(false);
  };

  const handleChange = (id, value) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setSellPrices((prev) => ({ ...prev, [id]: value }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateStr = todayStr();
      await Promise.all(
        vegetables.map((veg) =>
          setDoc(doc(db, 'prices', dateStr, 'vegetables', veg.id), {
            veg_id:      veg.id,
            teluguName:  veg.name_te,
            englishName: veg.name_en,
            sell_price:  parseFloat(sellPrices[veg.id]) || 0,
            price:       parseFloat(sellPrices[veg.id]) || 0, // keep for Sales screen compat
            unit:        veg.unit ?? 'kg',
            updatedAt:   serverTimestamp(),
          })
        )
      );
      const now = new Date().toLocaleTimeString('te-IN', { hour: '2-digit', minute: '2-digit' });
      setLastSaved(now);
      Alert.alert('సేవ్ అయింది! ✓', `ఈరోజు అమ్మకం ధరలు సేవ్ అయ్యాయి.\nSelling prices saved for ${dateStr}.`);
    } catch {
      Alert.alert('లోపం', 'సేవ్ విఫలమైంది. Connection check చేయండి.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => {
    const buyPrice = buyPrices[item.id];
    const sellVal  = sellPrices[item.id] ?? '';
    const margin   = buyPrice && parseFloat(sellVal) ? parseFloat(sellVal) - buyPrice : null;

    return (
      <View style={styles.row}>
        <Text style={styles.emoji}>{item.emoji ?? '🥬'}</Text>
        <View style={styles.nameCol}>
          <Text style={styles.teluguName}>{item.name_te}</Text>
          <Text style={styles.englishName}>{item.name_en}</Text>
          {buyPrice ? (
            <Text style={styles.buyHint}>
              కొన్న ధర: ₹{buyPrice}{margin !== null ? `  ·  లాభం: ₹${margin.toFixed(0)}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            style={[styles.input, margin !== null && margin < 0 && styles.inputLoss]}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#aaa"
            value={sellVal}
            onChangeText={(v) => handleChange(item.id, v)}
            returnKeyType="next"
          />
          <Text style={styles.unit}>/{UNIT_TE[item.unit] ?? 'కేజీ'}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ఈరోజు ధరలు</Text>
          <Text style={styles.headerSub}>Today's Selling Prices</Text>
        </View>
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ఈరోజు ధరలు</Text>
          <Text style={styles.headerSub}>Today's Selling Prices — {todayStr()}</Text>
          {lastSaved ? <Text style={styles.savedAt}>చివరిసారి సేవ్: {lastSaved}</Text> : null}
        </View>

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
    paddingVertical: 16, paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 13, color: '#a8d5b5', marginTop: 2 },
  savedAt:     { fontSize: 12, color: '#74c69d', marginTop: 4 },

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
  emoji: { fontSize: 26 },
  nameCol: { flex: 1 },
  teluguName:  { fontSize: 16, fontWeight: '600', color: '#1a472a' },
  englishName: { fontSize: 12, color: '#666', marginTop: 1 },
  buyHint:     { fontSize: 11, color: '#2d6a4f', marginTop: 3, fontWeight: '500' },

  priceCol: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rupee:    { fontSize: 18, color: '#2d6a4f', fontWeight: '600' },
  input: {
    width: 72, height: 44,
    borderWidth: 1.5, borderColor: '#b7e4c7', borderRadius: 8,
    paddingHorizontal: 8, fontSize: 16, color: '#1a1a1a',
    backgroundColor: '#f8fff8', textAlign: 'right', fontWeight: '600',
  },
  inputLoss: { borderColor: '#e74c3c', color: '#e74c3c' },
  unit:      { fontSize: 12, color: '#555' },

  saveBtn:         { margin: 16, backgroundColor: '#2d6a4f', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#74c69d' },
  saveBtnText:     { color: '#fff', fontSize: 17, fontWeight: '700' },
});
