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
  Image,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_WIDTH - 48) / 2;

const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };
const QTY_STEP = { kg: 0.5, bundle: 1, piece: 1, dozen: 1 };

const PAYMENT_MODES = [
  { key: 'cash',   te: 'నగదు',  en: 'Cash'   },
  { key: 'upi',    te: 'UPI',   en: 'UPI'    },
  { key: 'credit', te: 'అప్పు', en: 'Credit' },
];

const FALLBACK_VEGETABLES = [
  { id: 'tomato',       name_te: 'టమాట',         name_en: 'Tomato',           emoji: '🍅', unit: 'kg',     active: true },
  { id: 'onion',        name_te: 'ఉల్లిపాయ',     name_en: 'Onion',            emoji: '🧅', unit: 'kg',     active: true },
  { id: 'potato',       name_te: 'బంగాళదుంప',    name_en: 'Potato',           emoji: '🥔', unit: 'kg',     active: true },
  { id: 'brinjal',      name_te: 'వంకాయ',         name_en: 'Brinjal',          emoji: '🍆', unit: 'kg',     active: true },
  { id: 'okra',         name_te: 'బెండకాయ',       name_en: 'Okra',             emoji: '🌿', unit: 'kg',     active: true },
  { id: 'bittergourd',  name_te: 'కాకరకాయ',       name_en: 'Bitter Gourd',     emoji: '🥒', unit: 'kg',     active: true },
  { id: 'ridgegourd',   name_te: 'బీరకాయ',        name_en: 'Ridge Gourd',      emoji: '🥒', unit: 'kg',     active: true },
  { id: 'bottlegourd',  name_te: 'సొరకాయ',        name_en: 'Bottle Gourd',     emoji: '🎃', unit: 'piece',  active: true },
  { id: 'snakegourd',   name_te: 'పొట్లకాయ',      name_en: 'Snake Gourd',      emoji: '🌿', unit: 'kg',     active: true },
  { id: 'cucumber',     name_te: 'దోసకాయ',        name_en: 'Cucumber',         emoji: '🥒', unit: 'kg',     active: true },
  { id: 'greenchilli',  name_te: 'పచ్చి మిర్చి',  name_en: 'Green Chilli',     emoji: '🌶️', unit: 'kg',    active: true },
  { id: 'capsicum',     name_te: 'క్యాప్సికం',    name_en: 'Capsicum',         emoji: '🫑', unit: 'kg',     active: true },
  { id: 'carrot',       name_te: 'క్యారెట్',       name_en: 'Carrot',           emoji: '🥕', unit: 'kg',     active: true },
  { id: 'cauliflower',  name_te: 'కాలిఫ్లవర్',    name_en: 'Cauliflower',      emoji: '🥦', unit: 'piece',  active: true },
  { id: 'cabbage',      name_te: 'క్యాబేజీ',       name_en: 'Cabbage',          emoji: '🥬', unit: 'piece',  active: true },
  { id: 'spinach',      name_te: 'పాలకూర',         name_en: 'Spinach',          emoji: '🥬', unit: 'bundle', active: true },
  { id: 'fenugreek',    name_te: 'మెంతికూర',       name_en: 'Fenugreek Leaves', emoji: '🌿', unit: 'bundle', active: true },
  { id: 'drumstick',    name_te: 'మునగకాయ',        name_en: 'Drumstick',        emoji: '🌿', unit: 'kg',     active: true },
  { id: 'rawbanana',    name_te: 'అరటికాయ',        name_en: 'Raw Banana',       emoji: '🍌', unit: 'dozen',  active: true },
  { id: 'clusterbeans', name_te: 'గోరుచిక్కుడు',  name_en: 'Cluster Beans',    emoji: '🫘', unit: 'kg',     active: true },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Sales() {
  const [vegetables, setVegetables] = useState([]);
  const [priceMap, setPriceMap]     = useState({});
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [qty, setQty]               = useState('1');
  const [paymentMode, setPayMode]   = useState('cash');
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    const date = todayStr();
    Promise.all([loadVegetables(), loadPrices(date)]).finally(() =>
      setLoading(false)
    );
  }, []);

  const loadVegetables = async () => {
    try {
      const snap = await getDocs(collection(db, 'vegetables'));
      const vegs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => v.active !== false)
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
      setVegetables(vegs.length ? vegs : FALLBACK_VEGETABLES);
    } catch {
      setVegetables(FALLBACK_VEGETABLES);
    }
  };

  const loadPrices = async (date) => {
    try {
      const snap = await getDocs(collection(db, 'prices', date, 'vegetables'));
      const map = {};
      snap.forEach((d) => { map[d.id] = d.data(); });
      setPriceMap(map);
    } catch {
      // offline — cards will show "ధర లేదు"
    }
  };

  const openModal = (veg) => {
    setSelected(veg);
    const step = QTY_STEP[veg.unit] ?? 1;
    setQty(String(step));
    setPayMode('cash');
  };

  const closeModal = () => setSelected(null);

  const stepQty = (dir) => {
    const step = QTY_STEP[selected?.unit] ?? 1;
    const next = Math.max(step, (parseFloat(qty) || 0) + dir * step);
    setQty(step < 1 ? String(next) : String(Math.round(next)));
  };

  const handleConfirm = async () => {
    const quantity = parseFloat(qty);
    if (!quantity || quantity <= 0) {
      Alert.alert(
        'పరిమాణం లోపం',
        'సరైన పరిమాణం నమోదు చేయండి.\nEnter a valid quantity.'
      );
      return;
    }

    const priceData = priceMap[selected.id];
    const sellPrice = priceData?.sell_price ?? priceData?.price ?? 0;
    if (!sellPrice) {
      Alert.alert(
        'ధర లేదు / No Price Set',
        'ఈ రోజు ధర నిర్ణయించబడలేదు.\nముందు ఉదయం ధరలు నిర్ణయించండి.\n\nSet today\'s morning prices first.'
      );
      return;
    }

    setSaving(true);
    try {
      const totalAmount = parseFloat((quantity * sellPrice).toFixed(2));
      await addDoc(collection(db, 'sales'), {
        veg_id:       selected.id,
        veg_name_te:  selected.name_te,
        veg_name_en:  selected.name_en,
        veg_emoji:    selected.emoji ?? '',
        sale_date:    todayStr(),
        quantity,
        unit:         selected.unit ?? 'kg',
        sell_price:   sellPrice,
        total_amount: totalAmount,
        payment_mode: paymentMode,
        created_at:   serverTimestamp(),
      });

      const unitLabel = UNIT_TE[selected.unit] ?? selected.unit;
      closeModal();
      Alert.alert(
        '✓ అమ్మకం నిర్ధారించబడింది / Sale Saved',
        `${selected.name_te} — ${quantity} ${unitLabel}\nమొత్తం / Total: ₹${totalAmount}`
      );
    } catch {
      Alert.alert(
        'లోపం / Error',
        'అమ్మకం సేవ్ చేయడం విఫలమైంది.\nFailed to save. Check connection.'
      );
    } finally {
      setSaving(false);
    }
  };

  const filtered = vegetables.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return v.name_te.includes(search) || v.name_en.toLowerCase().includes(q);
  });

  // ─── Vegetable card ──────────────────────────────────────────────────────────
  const renderCard = ({ item }) => {
    const priceData = priceMap[item.id];
    const sellPrice = priceData?.sell_price ?? priceData?.price;
    const unitLabel = UNIT_TE[item.unit] ?? item.unit;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openModal(item)}
        activeOpacity={0.78}
      >
        {item.photo_url ? (
          <Image
            source={{ uri: item.photo_url }}
            style={styles.cardPhoto}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.cardEmojiBox}>
            <Text style={styles.cardEmoji}>{item.emoji ?? '🥬'}</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardNameTe} numberOfLines={1}>
            {item.name_te}
          </Text>
          <Text style={styles.cardNameEn} numberOfLines={1}>
            {item.name_en}
          </Text>
          <Text style={[styles.cardPrice, !sellPrice && styles.cardNoPrice]}>
            {sellPrice ? `₹${sellPrice}/${unitLabel}` : 'ధర లేదు'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Sale modal ──────────────────────────────────────────────────────────────
  const renderModal = () => {
    if (!selected) return null;

    const priceData = priceMap[selected.id];
    const sellPrice = priceData?.sell_price ?? priceData?.price ?? 0;
    const quantity  = parseFloat(qty) || 0;
    const total     = (quantity * sellPrice).toFixed(2);
    const unitLabel = UNIT_TE[selected.unit] ?? selected.unit;

    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Drag handle */}
              <View style={styles.handle} />

              {/* Photo / emoji */}
              {selected.photo_url ? (
                <Image
                  source={{ uri: selected.photo_url }}
                  style={styles.sheetPhoto}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.sheetEmojiBox}>
                  <Text style={styles.sheetEmoji}>{selected.emoji ?? '🥬'}</Text>
                </View>
              )}

              {/* Names */}
              <Text style={styles.sheetNameTe}>{selected.name_te}</Text>
              <Text style={styles.sheetNameEn}>{selected.name_en}</Text>

              {/* Price */}
              <Text style={sellPrice ? styles.sheetPrice : styles.sheetNoPrice}>
                {sellPrice
                  ? `₹${sellPrice} / ${unitLabel}`
                  : 'ఈ రోజు ధర లేదు / No price set today'}
              </Text>

              {/* Quantity stepper */}
              <Text style={styles.sectionLabel}>పరిమాణం / Quantity</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => stepQty(-1)}>
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="decimal-pad"
                  value={qty}
                  onChangeText={(v) => /^\d*\.?\d*$/.test(v) && setQty(v)}
                  selectTextOnFocus
                />
                <Text style={styles.qtyUnit}>{unitLabel}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => stepQty(1)}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Total */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>మొత్తం / Total</Text>
                <Text style={styles.totalValue}>₹{total}</Text>
              </View>

              {/* Payment mode */}
              <Text style={styles.sectionLabel}>చెల్లింపు / Payment</Text>
              <View style={styles.payRow}>
                {PAYMENT_MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.payBtn, paymentMode === m.key && styles.payBtnActive]}
                    onPress={() => setPayMode(m.key)}
                  >
                    <Text style={[styles.payBtnTe, paymentMode === m.key && styles.payBtnActiveText]}>
                      {m.te}
                    </Text>
                    <Text style={[styles.payBtnEn, paymentMode === m.key && styles.payBtnActiveText]}>
                      {m.en}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                  <Text style={styles.cancelText}>రద్దు / Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, saving && styles.confirmDisabled]}
                  onPress={handleConfirm}
                  disabled={saving}
                >
                  <Text style={styles.confirmText}>
                    {saving ? 'సేవ్...' : '✓ అమ్మకం నిర్ధారించు'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ─── Main render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>అమ్మకాలు</Text>
        <Text style={styles.headerSub}>Sales — {todayStr()}</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  కూరగాయలు వెతకండి / Search vegetables..."
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#2d6a4f" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {search
                ? 'ఫలితాలు లేవు / No results found'
                : 'కూరగాయలు లోడ్ అవుతున్నాయి...\nLoading vegetables...'}
            </Text>
          }
        />
      )}

      {renderModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f7f0',
  },

  // Header
  header: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSub: {
    fontSize: 13,
    color: '#a8d5b5',
    marginTop: 2,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0f0e8',
  },
  searchInput: {
    backgroundColor: '#f0f7f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#b7e4c7',
  },

  loader: {
    marginTop: 48,
  },

  // Grid
  grid: {
    padding: 16,
    paddingBottom: 32,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  // Vegetable card
  card: {
    width: CARD_SIZE,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardPhoto: {
    width: '100%',
    height: CARD_SIZE * 0.75,
  },
  cardEmojiBox: {
    width: '100%',
    height: CARD_SIZE * 0.75,
    backgroundColor: '#e8f5ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: {
    fontSize: 52,
  },
  cardBody: {
    padding: 10,
  },
  cardNameTe: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a472a',
  },
  cardNameEn: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
  },
  cardPrice: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#2d6a4f',
    backgroundColor: '#e8f5ec',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardNoPrice: {
    color: '#999',
    backgroundColor: '#f5f5f5',
  },

  emptyText: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 15,
    color: '#888',
    lineHeight: 24,
  },

  // Modal overlay + sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  sheetContent: {
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    marginBottom: 20,
  },

  sheetPhoto: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 16,
  },
  sheetEmojiBox: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#e8f5ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sheetEmoji: {
    fontSize: 72,
  },

  sheetNameTe: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
  },
  sheetNameEn: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  sheetPrice: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '700',
    color: '#2d6a4f',
    textAlign: 'center',
  },
  sheetNoPrice: {
    marginTop: 10,
    fontSize: 15,
    color: '#c0392b',
    textAlign: 'center',
  },

  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Quantity stepper
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    lineHeight: 32,
  },
  qtyInput: {
    width: 80,
    height: 52,
    borderWidth: 2,
    borderColor: '#b7e4c7',
    borderRadius: 12,
    fontSize: 22,
    fontWeight: '700',
    color: '#1a472a',
    textAlign: 'center',
    backgroundColor: '#f8fff8',
  },
  qtyUnit: {
    fontSize: 16,
    color: '#555',
    fontWeight: '500',
  },

  // Total
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
    backgroundColor: '#f0f7f0',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  totalLabel: {
    fontSize: 16,
    color: '#444',
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a472a',
  },

  // Payment mode
  payRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  payBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#b7e4c7',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  payBtnActive: {
    backgroundColor: '#2d6a4f',
    borderColor: '#2d6a4f',
  },
  payBtnTe: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2d6a4f',
  },
  payBtnEn: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  payBtnActiveText: {
    color: '#fff',
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#b7e4c7',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    color: '#2d6a4f',
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
  },
  confirmDisabled: {
    backgroundColor: '#74c69d',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
