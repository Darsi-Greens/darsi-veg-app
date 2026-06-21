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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LocalDB }  from '../services/LocalDB';
import { SyncQueue } from '../services/SyncQueue';
import SyncIndicator from '../components/SyncIndicator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_WIDTH - 48) / 2;

// ── Unit definitions ────────────────────────────────────────────────────────────
// Telugu labels for the three user-facing units
const UNIT_TE  = { kg: 'కేజీ', gm: 'గ్రాముల', pcs: 'పీస్' };
const UNIT_EN  = { kg: 'kg',   gm: 'gm',      pcs: 'pcs'  };

// Which tabs to show based on the vegetable's base unit in Firestore
const UNIT_TABS = {
  kg:     ['kg', 'gm'],
  piece:  ['pcs'],
  bundle: ['pcs'],
  dozen:  ['pcs'],
};

// Stepper increment per unit
const QTY_STEP = { kg: 0.5, gm: 100, pcs: 1 };

// Convert user qty in selected unit → base unit qty (for total = baseQty × pricePerKg)
const toBaseQty = (qty, unit) => (unit === 'gm' ? qty / 1000 : qty);

// ── Payment modes ───────────────────────────────────────────────────────────────
const PAYMENT_MODES = [
  { key: 'cash',   te: 'నగదు',  en: 'Cash'   },
  { key: 'upi',    te: 'UPI',   en: 'UPI'    },
  { key: 'credit', te: 'అప్పు', en: 'Credit' },
];

// ── Async storage keys ──────────────────────────────────────────────────────────
const CACHE_VEG_KEY     = '@darsi_vegetables_v1';
const OFFLINE_QUEUE_KEY = '@darsi_pending_sales_v1';

// ── Fallback vegetable list (matches seed data, used when offline + no cache) ──
const FALLBACK_VEGETABLES = [
  { id: 'tomato',       name_te: 'టమాట',         name_en: 'Tomato',           emoji: '🍅', unit: 'kg'    },
  { id: 'onion',        name_te: 'ఉల్లిపాయ',     name_en: 'Onion',            emoji: '🧅', unit: 'kg'    },
  { id: 'potato',       name_te: 'బంగాళదుంప',    name_en: 'Potato',           emoji: '🥔', unit: 'kg'    },
  { id: 'brinjal',      name_te: 'వంకాయ',         name_en: 'Brinjal',          emoji: '🍆', unit: 'kg'    },
  { id: 'okra',         name_te: 'బెండకాయ',       name_en: 'Okra',             emoji: '🌿', unit: 'kg'    },
  { id: 'bittergourd',  name_te: 'కాకరకాయ',       name_en: 'Bitter Gourd',     emoji: '🥒', unit: 'kg'    },
  { id: 'ridgegourd',   name_te: 'బీరకాయ',        name_en: 'Ridge Gourd',      emoji: '🥒', unit: 'kg'    },
  { id: 'bottlegourd',  name_te: 'సొరకాయ',        name_en: 'Bottle Gourd',     emoji: '🎃', unit: 'piece' },
  { id: 'snakegourd',   name_te: 'పొట్లకాయ',      name_en: 'Snake Gourd',      emoji: '🌿', unit: 'kg'    },
  { id: 'cucumber',     name_te: 'దోసకాయ',        name_en: 'Cucumber',         emoji: '🥒', unit: 'kg'    },
  { id: 'greenchilli',  name_te: 'పచ్చి మిర్చి',  name_en: 'Green Chilli',     emoji: '🌶️', unit: 'kg'   },
  { id: 'capsicum',     name_te: 'క్యాప్సికం',    name_en: 'Capsicum',         emoji: '🫑', unit: 'kg'    },
  { id: 'carrot',       name_te: 'క్యారెట్',       name_en: 'Carrot',           emoji: '🥕', unit: 'kg'    },
  { id: 'cauliflower',  name_te: 'కాలిఫ్లవర్',    name_en: 'Cauliflower',      emoji: '🥦', unit: 'piece' },
  { id: 'cabbage',      name_te: 'క్యాబేజీ',       name_en: 'Cabbage',          emoji: '🥬', unit: 'piece' },
  { id: 'spinach',      name_te: 'పాలకూర',         name_en: 'Spinach',          emoji: '🥬', unit: 'bundle'},
  { id: 'fenugreek',    name_te: 'మెంతికూర',       name_en: 'Fenugreek Leaves', emoji: '🌿', unit: 'bundle'},
  { id: 'drumstick',    name_te: 'మునగకాయ',        name_en: 'Drumstick',        emoji: '🌿', unit: 'kg'    },
  { id: 'rawbanana',    name_te: 'అరటికాయ',        name_en: 'Raw Banana',       emoji: '🍌', unit: 'dozen' },
  { id: 'clusterbeans', name_te: 'గోరుచిక్కుడు',  name_en: 'Cluster Beans',    emoji: '🫘', unit: 'kg'    },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Component ───────────────────────────────────────────────────────────────────
export default function Sales() {
  const [vegetables,   setVegetables]  = useState([]);
  const [priceById,    setPriceById]   = useState({});  // Firestore veg ID → price doc
  const [priceByName,  setPriceByName] = useState({});  // English name (lower) → price doc
  const [search,       setSearch]      = useState('');
  const [loading,      setLoading]     = useState(true);
  const [pendingCount, setPending]     = useState(0);

  // Modal state
  const [selected,   setSelected]  = useState(null);
  const [activeUnit, setActiveUnit] = useState('kg');
  const [qty,        setQty]       = useState('1');
  const [payMode,    setPayMode]   = useState('cash');
  const [saving,     setSaving]    = useState(false);

  useEffect(() => {
    const date = todayStr();
    Promise.all([
      loadVegetables(),
      loadPrices(date),
      flushOfflineQueue(),
    ]).finally(() => setLoading(false));
  }, []);

  // ── Data loaders ──────────────────────────────────────────────────────────────

  const loadVegetables = async () => {
    try {
      const snap = await getDocs(collection(db, 'vegetables'));
      const vegs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => v.active !== false)
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
      const list = vegs.length ? vegs : FALLBACK_VEGETABLES;
      setVegetables(list);
      await AsyncStorage.setItem(CACHE_VEG_KEY, JSON.stringify(list));
    } catch {
      // Offline: try cache, fall back to hardcoded list
      try {
        const cached = await AsyncStorage.getItem(CACHE_VEG_KEY);
        setVegetables(cached ? JSON.parse(cached) : FALLBACK_VEGETABLES);
      } catch {
        setVegetables(FALLBACK_VEGETABLES);
      }
    }
  };

  const loadPrices = async (date) => {
    // 1. Load from LocalDB instantly (set by SellingPricesScreen)
    const cached = await LocalDB.get(`prices_${date}`);
    if (cached) {
      const byId = {}, byName = {};
      Object.entries(cached).forEach(([id, data]) => {
        byId[id] = data;
        const nameKey = (data.englishName || data.veg_name_en || '').toLowerCase().trim();
        if (nameKey) byName[nameKey] = data;
      });
      setPriceById(byId);
      setPriceByName(byName);
    }

    // 2. Refresh from Firestore in background
    try {
      const snap = await getDocs(collection(db, 'prices', date, 'vegetables'));
      const byId = {}, byName = {};
      snap.forEach((d) => {
        const data = d.data();
        byId[d.id] = data;
        const nameKey = (data.englishName || data.veg_name_en || '').toLowerCase().trim();
        if (nameKey) byName[nameKey] = data;
      });
      setPriceById(byId);
      setPriceByName(byName);
    } catch {
      // Offline — use LocalDB prices above
    }
  };

  // ── Offline sales queue ───────────────────────────────────────────────────────

  const flushOfflineQueue = async () => {
    try {
      const raw   = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      if (!queue.length) { setPending(0); return; }

      const failed = [];
      for (const { queued_at, ...sale } of queue) {
        try {
          await addDoc(collection(db, 'sales'), {
            ...sale,
            created_at:          serverTimestamp(),
            synced_from_offline: true,
          });
        } catch {
          failed.push({ ...sale, queued_at });
        }
      }
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
      setPending(failed.length);
    } catch {
      /* storage error — ignore */
    }
  };

  const queueOfflineSale = async (saleData) => {
    try {
      const raw   = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      queue.push({ ...saleData, queued_at: new Date().toISOString() });
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      setPending(queue.length);
    } catch { /* storage error */ }
  };

  // ── Price helpers ─────────────────────────────────────────────────────────────

  // Look up by Firestore ID first; fall back to English name for MorningPrices compat
  const getPriceData = (veg) =>
    priceById[veg.id] ?? priceByName[veg.name_en.toLowerCase().trim()];

  const getSellPrice = (veg) => {
    const d = getPriceData(veg);
    return d?.sell_price ?? d?.price ?? 0;
  };

  const calcTotal = (veg, rawQty, unit) => {
    const price = getSellPrice(veg);
    const base  = toBaseQty(parseFloat(rawQty) || 0, unit);
    return (base * price).toFixed(2);
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────────

  const openModal = (veg) => {
    const tabs = UNIT_TABS[veg.unit] ?? ['pcs'];
    setSelected(veg);
    setActiveUnit(tabs[0]);
    setQty(String(QTY_STEP[tabs[0]] ?? 1));
    setPayMode('cash');
  };

  const closeModal = () => setSelected(null);

  const switchUnit = (unit) => {
    setActiveUnit(unit);
    setQty(String(QTY_STEP[unit] ?? 1));
  };

  const stepQty = (dir) => {
    const step = QTY_STEP[activeUnit] ?? 1;
    const next = Math.max(step, (parseFloat(qty) || 0) + dir * step);
    // For gm keep integer; for kg allow one decimal
    setQty(activeUnit === 'kg' ? String(next) : String(Math.round(next)));
  };

  const handleConfirm = async () => {
    const quantity = parseFloat(qty);
    if (!quantity || quantity <= 0) {
      Alert.alert('పరిమాణం లోపం', 'సరైన పరిమాణం నమోదు చేయండి.\nEnter a valid quantity.');
      return;
    }

    const sellPrice = getSellPrice(selected);
    if (!sellPrice) {
      Alert.alert(
        'ధర లేదు / No Price',
        'ధరలు స్క్రీన్‌లో ఈ కూరగాయకి ధర సెట్ చేయండి.\nSet price in the Prices tab first.'
      );
      return;
    }

    const totalAmount = parseFloat(calcTotal(selected, qty, activeUnit));
    const saleDoc = {
      veg_id:       selected.id,
      veg_name_te:  selected.name_te,
      veg_name_en:  selected.name_en,
      veg_emoji:    selected.emoji ?? '',
      sale_date:    todayStr(),
      quantity,
      unit:         activeUnit,           // kg / gm / pcs
      sell_price:   sellPrice,            // always price per kg (or per piece)
      total_amount: totalAmount,
      payment_mode: payMode,
    };

    setSaving(true);

    // 1. Save to LocalDB immediately
    await LocalDB.append('today_sales', { ...saleDoc, saved_at: new Date().toISOString() });

    // 2. Update UI immediately
    closeModal();
    Alert.alert(
      '✓ అమ్మకం నమోదు · Record Sale',
      `${selected.name_te} — ${quantity} ${UNIT_TE[activeUnit]}\nమొత్తం · Total amount: ₹${totalAmount}`
    );
    setSaving(false);

    // 3. Sync to Firestore in background
    try {
      await addDoc(collection(db, 'sales'), { ...saleDoc, created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({ collectionName: 'sales', data: saleDoc });
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = vegetables.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return v.name_te.includes(search) || v.name_en.toLowerCase().includes(q);
  });

  // ── Render: vegetable card ────────────────────────────────────────────────────

  const renderCard = ({ item }) => {
    const sellPrice  = getSellPrice(item);
    const baseUnit   = UNIT_TABS[item.unit]?.[0] ?? 'pcs';
    const unitLabel  = UNIT_TE[baseUnit];

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openModal(item)}
        activeOpacity={0.78}
      >
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.cardPhoto} resizeMode="cover" />
        ) : (
          <View style={styles.cardEmojiBox}>
            <Text style={styles.cardEmoji}>{item.emoji ?? '🥬'}</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardNameTe} numberOfLines={1}>{item.name_te}</Text>
          <Text style={styles.cardNameEn} numberOfLines={1}>{item.name_en}</Text>
          <Text style={[styles.cardPrice, !sellPrice && styles.cardNoPrice]}>
            {sellPrice ? `₹${sellPrice}/${unitLabel}` : 'ధర సెట్ చేయండి ⚠️'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render: sale modal ────────────────────────────────────────────────────────

  const renderModal = () => {
    if (!selected) return null;

    const unitTabs   = UNIT_TABS[selected.unit] ?? ['pcs'];
    const sellPrice  = getSellPrice(selected);
    const total      = calcTotal(selected, qty, activeUnit);

    return (
      <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.handle} />

              {/* Photo / emoji */}
              {selected.photo_url ? (
                <Image source={{ uri: selected.photo_url }} style={styles.sheetPhoto} resizeMode="cover" />
              ) : (
                <View style={styles.sheetEmojiBox}>
                  <Text style={styles.sheetEmoji}>{selected.emoji ?? '🥬'}</Text>
                </View>
              )}

              {/* Names */}
              <Text style={styles.sheetNameTe}>{selected.name_te}</Text>
              <Text style={styles.sheetNameEn}>{selected.name_en}</Text>

              {/* Today's price */}
              <Text style={sellPrice ? styles.sheetPrice : styles.sheetNoPrice}>
                {sellPrice
                  ? `₹${sellPrice} / ${UNIT_TE[UNIT_TABS[selected.unit]?.[0] ?? 'pcs']}`
                  : 'ఈ రోజు ధర లేదు / No price set today'}
              </Text>

              {/* Unit selector — only shown when veg has multiple units (kg/gm) */}
              {unitTabs.length > 1 && (
                <>
                  <Text style={styles.sectionLabel}>యూనిట్ / Unit</Text>
                  <View style={styles.unitTabs}>
                    {unitTabs.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.unitTab, activeUnit === u && styles.unitTabActive]}
                        onPress={() => switchUnit(u)}
                      >
                        <Text style={[styles.unitTabTe, activeUnit === u && styles.unitTabActiveText]}>
                          {UNIT_TE[u]}
                        </Text>
                        <Text style={[styles.unitTabEn, activeUnit === u && styles.unitTabActiveText]}>
                          {UNIT_EN[u]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Quantity stepper */}
              <Text style={styles.sectionLabel}>ఎంత కావాలి? · How much?</Text>
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
                <Text style={styles.qtyUnit}>{UNIT_TE[activeUnit]}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => stepQty(1)}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Total */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>మొత్తం · Total amount</Text>
                <Text style={styles.totalValue}>₹{total}</Text>
              </View>

              {/* Payment mode */}
              <Text style={styles.sectionLabel}>చెల్లింపు / Payment</Text>
              <View style={styles.payRow}>
                {PAYMENT_MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.payBtn, payMode === m.key && styles.payBtnActive]}
                    onPress={() => setPayMode(m.key)}
                  >
                    <Text style={[styles.payBtnTe, payMode === m.key && styles.payBtnActiveText]}>
                      {m.te}
                    </Text>
                    <Text style={[styles.payBtnEn, payMode === m.key && styles.payBtnActiveText]}>
                      {m.en}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action buttons */}
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
                    {saving ? 'సేవ్...' : 'అమ్మకం నమోదు · Record Sale'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>అమ్మకాలు</Text>
            <Text style={styles.headerSub}>Sales — {todayStr()}</Text>
          </View>
          <SyncIndicator />
        </View>
      </View>

      {/* Search bar */}
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

      {/* Grid */}
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

// ── Styles ────────────────────────────────────────────────────────────────────
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  syncBadge: {
    backgroundColor: '#f4a261',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  syncBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
    maxHeight: '94%',
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

  // Sheet veg display
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
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Unit selector tabs
  unitTabs: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
  },
  unitTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#b7e4c7',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  unitTabActive: {
    backgroundColor: '#1a472a',
    borderColor: '#1a472a',
  },
  unitTabTe: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d6a4f',
  },
  unitTabEn: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  unitTabActiveText: {
    color: '#fff',
  },

  // Quantity stepper
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 30,
    color: '#fff',
    fontWeight: '300',
    lineHeight: 34,
  },
  qtyInput: {
    width: 88,
    height: 56,
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
    fontWeight: '600',
    minWidth: 40,
  },

  // Total
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
    backgroundColor: '#e8f5ec',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  totalLabel: {
    fontSize: 17,
    color: '#444',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#1a472a',
  },

  // Payment mode
  payRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
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
    alignSelf: 'stretch',
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
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
