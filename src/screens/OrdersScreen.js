import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, Alert, Modal, TextInput, ScrollView,
  ActivityIndicator, Switch, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  collection, addDoc, updateDoc, getDocs, doc, setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { LocalDB }  from '../services/LocalDB';
import { SyncQueue } from '../services/SyncQueue';
import { newId } from '../services/ids';
import { inr } from '../utils/money';
import SyncIndicator from '../components/SyncIndicator';
import AppHeader from '../components/AppHeader';
import SelectionSheet from '../components/SelectionSheet';
import QuantityPicker from '../components/QuantityPicker';
import { colors } from '../theme';

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const UNIT_TE = { kg: 'కేజీ', bundle: 'కట్ట', piece: 'పీస్', dozen: 'డజన్' };
const PAY_MODES = [
  { key: 'cash',   label: 'నగదు',       emoji: '💵' },
  { key: 'upi',    label: 'UPI',        emoji: '📱' },
  { key: 'credit', label: 'క్రెడిట్', emoji: '📋' },
];

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
function fmtPaidDate(ts) {
  if (!ts) return '';
  // Handle both ISO strings (local-first writes) and Firestore Timestamps (after sync/reload)
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = d.getHours(), m = d.getMinutes();
  return `${d.getDate()} ${months[d.getMonth()]} ${String(h%12||12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
const newItem = () => ({ veg: null, qty: '1', price: '', lineTotal: 0 });

// ── Cloudinary unsigned upload (no billing card, free tier) ───────────────────
const CLOUDINARY_CLOUD_NAME    = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function cloudinaryConfigured() {
  return !!CLOUDINARY_CLOUD_NAME && !!CLOUDINARY_UPLOAD_PRESET;
}

async function uploadReceipt(orderId, imageUri) {
  const formData = new FormData();
  formData.append('file', { uri: imageUri, type: 'image/jpeg', name: `${orderId}_${Date.now()}.jpg` });
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `receipts/${orderId}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  const data = await res.json();
  if (!data.secure_url) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }
  return data.secure_url;
}

export default function OrdersScreen() {
  const [orders,       setOrders]     = useState([]);
  const [vegetables,   setVegs]       = useState([]);
  const [vendors,      setVendors]    = useState([]);
  const [loading,      setLoading]    = useState(true);
  const [showAdd,      setShowAdd]    = useState(false);

  // Add-order form state
  const [selectedVendor,   setSelectedVendor]  = useState(null);
  const [vendorSheetOpen,  setVendorSheetOpen] = useState(false);
  const [vegSheetOpenIdx,  setVegSheetOpenIdx] = useState(null);
  const [formItems,        setFormItems]       = useState([newItem()]);
  const [saving,           setSaving]          = useState(false);

  // Payment modal state
  const [payModal,      setPayModal]      = useState(null); // { order } or null
  const [payAmount,     setPayAmount]     = useState('');
  const [payMode,       setPayMode]       = useState('cash');
  const [payReceiptUri, setPayReceiptUri] = useState(null); // proof photo picked in the sheet
  const [payingSave,    setPayingSave]    = useState(false);

  // Receipt viewer state
  const [receiptModal,  setReceiptModal]  = useState(null); // order with receipt_url
  const [uploadingId,   setUploadingId]   = useState(null); // orderId being uploaded

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
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const cached = await LocalDB.get('cache_vendors');
        if (cached) setVendors(cached.filter((v) => v.active !== false));
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

    setOrders((prev) => prev.map((o) => {
      const oId = o.id || o._localId;
      return oId === orderId ? { ...o, status: newStatus, received_at: newReceivedAt } : o;
    }));

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

  // ── Mark as paid ─────────────────────────────────────────────────────────────

  const openPayModal = (order) => {
    setPayAmount(String(order.total_amount || ''));
    setPayMode('cash');
    setPayReceiptUri(null);
    setPayModal({ order });
  };

  // Pick a receipt photo from inside the payment sheet (proof of payment).
  const pickPaymentReceipt = () => {
    if (!cloudinaryConfigured()) {
      Alert.alert(
        'రసీదు సెటప్ కాలేదు · Receipt not set up',
        'Cloudinary keys missing in .env. Add EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET, then restart the app.'
      );
      return;
    }
    Alert.alert(
      '📄 రసీదు ఫోటో · Receipt photo',
      'చెల్లింపు రుజువు · Proof of payment',
      [
        { text: '📷 ఫోటో తీయండి · Camera',    onPress: () => grabPaymentPhoto('camera') },
        { text: '🖼️ గ్యాలరీ నుండి · Gallery', onPress: () => grabPaymentPhoto('gallery') },
        { text: 'రద్దు · Cancel', style: 'cancel' },
      ]
    );
  };

  const grabPaymentPhoto = async (source) => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('అనుమతి అవసరం · Permission needed', 'Settings లో అనుమతి ఇవ్వండి.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPayReceiptUri(result.assets[0].uri);
  };

  const handleMarkPaid = async () => {
    if (!payModal) return;
    setPayingSave(true);
    const order   = payModal.order;
    const orderId = order.id || order._localId;
    const amount  = parseFloat(payAmount) || order.total_amount || 0;
    const paidAt  = new Date().toISOString();
    const receiptUri = payReceiptUri;

    // Update UI immediately — mark paid + show local receipt preview if attached
    setOrders((prev) => prev.map((o) => {
      const oId = o.id || o._localId;
      return oId === orderId
        ? {
            ...o,
            payment_status: 'paid', payment_mode: payMode, paid_at: paidAt, amount_paid: amount,
            receipt_local_uri: receiptUri || o.receipt_local_uri,
            receipt_uploading: !!receiptUri,
          }
        : o;
    }));
    setPayModal(null);
    setPayingSave(false);

    // Background sync — payment fields
    if (order.id && !order.id.startsWith('local_')) {
      updateDoc(doc(db, 'vendor_orders', order.id), {
        payment_status: 'paid',
        payment_mode:   payMode,
        paid_at:        serverTimestamp(),
        amount_paid:    amount,
        updated_at:     serverTimestamp(),
      }).catch(() => {
        SyncQueue.add({
          type: 'updateDoc',
          path: ['vendor_orders', order.id],
          data: { payment_status: 'paid', payment_mode: payMode, paid_at: paidAt, amount_paid: amount },
        });
      });
    }

    // Background — upload receipt proof to Cloudinary, then save its URL
    if (receiptUri) {
      try {
        const url = await uploadReceipt(order.id || orderId, receiptUri);
        setOrders((prev) => prev.map((o) => {
          const oId = o.id || o._localId;
          return oId === orderId ? { ...o, receipt_url: url, receipt_local_uri: null, receipt_uploading: false } : o;
        }));
        if (order.id && !order.id.startsWith('local_')) {
          updateDoc(doc(db, 'vendor_orders', order.id), {
            receipt_url:         url,
            receipt_uploaded_at: serverTimestamp(),
            updated_at:          serverTimestamp(),
          }).catch(() => {});
        }
      } catch {
        setOrders((prev) => prev.map((o) => {
          const oId = o.id || o._localId;
          return oId === orderId ? { ...o, receipt_uploading: false } : o;
        }));
        Alert.alert('Upload లోపం', 'రసీదు అప్‌లోడ్ విఫలమైంది. Paid order లో మళ్ళీ ప్రయత్నించండి.');
      }
    }
  };

  // ── Receipt upload ────────────────────────────────────────────────────────────

  const handleReceiptPress = (order) => {
    const hasReceipt = order.receipt_url || order.receipt_local_uri;
    if (hasReceipt) {
      setReceiptModal(order);
      return;
    }
    if (!cloudinaryConfigured()) {
      Alert.alert(
        'రసీదు సెటప్ కాలేదు · Receipt not set up',
        'Cloudinary keys missing in .env. Add EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET, then restart the app.'
      );
      return;
    }
    Alert.alert(
      '📄 రసీదు · Receipt',
      'ఫోటో ఎంచుకోండి · Choose photo',
      [
        { text: '📷 ఫోటో తీయండి · Camera', onPress: () => pickReceipt(order, 'camera') },
        { text: '🖼️ గ్యాలరీ నుండి · Gallery', onPress: () => pickReceipt(order, 'gallery') },
        { text: 'రద్దు · Cancel', style: 'cancel' },
      ]
    );
  };

  const pickReceipt = async (order, source) => {
    const orderId = order.id || order._localId;

    let permResult;
    if (source === 'camera') {
      permResult = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (permResult.status !== 'granted') {
      Alert.alert('అనుమతి అవసరం · Permission needed', 'Settings లో అనుమతి ఇవ్వండి.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;

    // Show local preview immediately
    setOrders((prev) => prev.map((o) => {
      const oId = o.id || o._localId;
      return oId === orderId ? { ...o, receipt_local_uri: uri, receipt_uploading: true } : o;
    }));

    // Upload to Firebase Storage in background
    setUploadingId(orderId);
    try {
      const url = await uploadReceipt(order.id || orderId, uri);
      setOrders((prev) => prev.map((o) => {
        const oId = o.id || o._localId;
        return oId === orderId ? { ...o, receipt_url: url, receipt_local_uri: null, receipt_uploading: false } : o;
      }));
      if (order.id && !order.id.startsWith('local_')) {
        updateDoc(doc(db, 'vendor_orders', order.id), {
          receipt_url:         url,
          receipt_uploaded_at: serverTimestamp(),
          updated_at:          serverTimestamp(),
        }).catch(() => {});
      }
    } catch {
      Alert.alert('Upload లోపం', 'Receipt upload విఫలమైంది. మళ్ళీ ప్రయత్నించండి.');
      setOrders((prev) => prev.map((o) => {
        const oId = o.id || o._localId;
        return oId === orderId ? { ...o, receipt_local_uri: null, receipt_uploading: false } : o;
      }));
    } finally {
      setUploadingId(null);
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

    // Client-generated ID: the order has a real, stable Firestore ID from the
    // moment it's created — even offline. This makes the create idempotent AND
    // lets "received"/"paid" toggles sync against it before it has reached the
    // server (previously those actions were lost on local-only orders).
    const orderId = newId();
    await LocalDB.append('pending_orders', { ...orderData, id: orderId, saved_at: new Date().toISOString() });

    setOrders((prev) => [{ id: orderId, ...orderData, placed_at: null }, ...prev]);
    setShowAdd(false);
    resetForm();
    setSaving(false);

    try {
      await setDoc(doc(db, 'vendor_orders', orderId), { ...orderData, placed_at: serverTimestamp(), created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({
        type: 'createWithId',
        collectionName: 'vendor_orders',
        docId: orderId,
        data: { ...orderData, placed_at: new Date().toISOString() },
      });
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const pending  = orders.filter((o) => o.status !== 'received');
  const received = orders.filter((o) => o.status === 'received');

  const renderOrder = (order) => {
    const isReceived   = order.status === 'received';
    const isPaid       = order.payment_status === 'paid';
    const orderId      = order.id || order._localId;
    const receiptUri   = order.receipt_url || order.receipt_local_uri;
    const isUploading  = order.receipt_uploading || uploadingId === orderId;

    return (
      <View key={orderId} style={[styles.orderCard, isReceived && styles.orderCardReceived]}>

        {/* Header */}
        <View style={styles.orderHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderVendor}>
              {order.vendor_name_en || order.vendor_name}
              {order.vendor_name_en && order.vendor_name ? `  ·  ${order.vendor_name}` : ''}
            </Text>
            <Text style={styles.orderMeta}>
              {fmtDate(order.order_date)}
              {order.placed_at ? `  ·  ${fmtTime(order.placed_at)}` : '  ·  Local'}
              {isReceived && order.received_at ? `  ·  ✓ ${fmtTime(order.received_at)}` : ''}
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

        {/* Items */}
        {(order.items || []).map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.veg_name_te}</Text>
            <Text style={styles.itemQty}>{item.quantity} {UNIT_TE[item.unit] ?? item.unit}</Text>
            <Text style={styles.itemPrice}>{inr(item.buy_price)}</Text>
            <Text style={styles.itemTotal}>{inr((item.quantity || 0) * (item.buy_price || 0))}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>మొత్తం: {inr(order.total_amount || 0)}</Text>
        </View>

        {/* ── Payment section ── */}
        <View style={styles.payDivider} />
        <View style={styles.paySection}>
          {isPaid ? (
            <>
              {/* Paid state */}
              <View style={styles.payStatusRow}>
                <View style={styles.paidBadge}>
                  <Text style={styles.paidBadgeText}>✓ చెల్లించాం · Paid</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.paidMeta}>
                    {PAY_MODES.find(m => m.key === order.payment_mode)?.emoji ?? '💵'}{' '}
                    {PAY_MODES.find(m => m.key === order.payment_mode)?.label ?? order.payment_mode}
                    {'  ·  '}{inr(order.amount_paid || order.total_amount || 0)}
                  </Text>
                  {order.paid_at ? (
                    <Text style={styles.paidDate}>చెల్లించిన తేదీ: {fmtPaidDate(order.paid_at)}</Text>
                  ) : null}
                </View>
              </View>

              {/* Receipt = proof of payment (only on paid orders) */}
              <TouchableOpacity
                style={[styles.receiptBtn, receiptUri && styles.receiptBtnGreen]}
                onPress={() => handleReceiptPress(order)}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="#2d6a4f" />
                ) : receiptUri ? (
                  <Text style={[styles.receiptBtnText, styles.receiptBtnTextGreen]}>📄 రసీదు చూడు · View proof</Text>
                ) : (
                  <Text style={styles.receiptBtnText}>📷 రసీదు చేర్చు · Add proof</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            /* Pending state — receipt is captured together with payment */
            <View style={styles.payStatusRow}>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>🔴 చెల్లించలేదు · Unpaid</Text>
              </View>
              <TouchableOpacity
                style={styles.markPaidBtn}
                onPress={() => openPayModal(order)}
              >
                <Text style={styles.markPaidBtnText}>💰 చెల్లించాం · Pay</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader title="ఆర్డర్లు" subtitle="Vendor Orders" />
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="ఆర్డర్లు"
        subtitle="Vendor Orders"
        right={(
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addBtnText}>+ ఆర్డర్</Text>
          </TouchableOpacity>
        )}
      />

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

            {selectedVendor && (
              <>
                <Text style={[styles.stepLabel, { marginTop: 20 }]}>STEP 2 · కూరగాయలు</Text>

                {formItems.map((item, idx) => (
                  <View key={idx} style={styles.itemCard}>
                    {item.veg ? (
                      <TouchableOpacity style={styles.vegChip} onPress={() => setVegSheetOpenIdx(idx)}>
                        <Text style={styles.vegChipEmoji}>{item.veg.emoji ?? '🥬'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.vegChipName}>{item.veg.name_te}</Text>
                          <Text style={styles.vegChipSub}>{item.veg.name_en}</Text>
                        </View>
                        <Text style={styles.vegChipUnit}>{UNIT_TE[item.veg.unit] ?? ''}</Text>
                        <Text style={styles.vegChipChange}>✏️</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.vegPickBtn} onPress={() => setVegSheetOpenIdx(idx)}>
                        <Text style={styles.vegPickBtnText}>🥬 కూరగాయ ఎంచుకోండి · Select Vegetable</Text>
                      </TouchableOpacity>
                    )}

                    <Text style={styles.inputLabel}>ఎన్ని {UNIT_TE[item.veg?.unit] ?? 'కేజీ'}?</Text>
                    <QuantityPicker
                      value={item.qty}
                      onChange={(v) => updateField(idx, 'qty', v)}
                      unit={UNIT_TE[item.veg?.unit] ?? 'కేజీ'}
                    />

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
                        <Text style={styles.lineTotal}>{inr(item.lineTotal)}</Text>
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
                  <Text style={styles.grandTotalValue}>{inr(grandTotal)}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && { backgroundColor: '#74c69d' }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>
                    {saving
                      ? 'సేవ్ అవుతోంది...'
                      : `✓ ఆర్డర్ సేవ్ చేయండి · Save Order  ${inr(grandTotal)}`}
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

      {/* ── Payment bottom sheet modal ── */}
      <Modal
        visible={!!payModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPayModal(null)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setPayModal(null)}
        />
        <View style={styles.paySheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>💰 చెల్లింపు · Payment</Text>
          <Text style={styles.sheetVendor}>
            {payModal?.order?.vendor_name_en || payModal?.order?.vendor_name}
          </Text>

          <Text style={styles.sheetLabel}>ఎంత చెల్లించారు? · Amount paid</Text>
          <View style={styles.amtRow}>
            <Text style={styles.amtRupee}>₹</Text>
            <TextInput
              style={styles.amtInput}
              keyboardType="decimal-pad"
              value={payAmount}
              onChangeText={(v) => /^\d*\.?\d*$/.test(v) && setPayAmount(v)}
              selectTextOnFocus
            />
          </View>

          <Text style={styles.sheetLabel}>చెల్లింపు పద్ధతి · Payment mode</Text>
          <View style={styles.modeRow}>
            {PAY_MODES.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.modeBtn, payMode === m.key && styles.modeBtnActive]}
                onPress={() => setPayMode(m.key)}
              >
                <Text style={styles.modeEmoji}>{m.emoji}</Text>
                <Text style={[styles.modeLabel, payMode === m.key && styles.modeLabelActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Receipt photo = proof of this payment (optional) */}
          <Text style={styles.sheetLabel}>రసీదు ఫోటో · Receipt (proof) — ఐచ్ఛికం</Text>
          {payReceiptUri ? (
            <View style={styles.receiptPreviewRow}>
              <Image source={{ uri: payReceiptUri }} style={styles.receiptThumb} />
              <Text style={styles.receiptAttachedText}>✓ ఫోటో జతచేయబడింది · Attached</Text>
              <TouchableOpacity onPress={() => setPayReceiptUri(null)} style={styles.receiptRemoveBtn}>
                <Text style={styles.receiptRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.attachReceiptBtn} onPress={pickPaymentReceipt}>
              <Text style={styles.attachReceiptText}>📷 రసీదు ఫోటో చేర్చు · Add receipt photo</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.confirmPayBtn, payingSave && { backgroundColor: '#74c69d' }]}
            onPress={handleMarkPaid}
            disabled={payingSave}
          >
            <Text style={styles.confirmPayBtnText}>
              {payingSave ? 'నమోదు అవుతోంది...' : '✓ చెల్లింపు నమోదు · Confirm Payment'}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Receipt full-screen viewer ── */}
      <Modal
        visible={!!receiptModal}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setReceiptModal(null)}
      >
        <SafeAreaView style={styles.receiptViewer}>
          <View style={styles.receiptViewerHeader}>
            <Text style={styles.receiptViewerTitle}>📄 రసీదు · Receipt</Text>
            <TouchableOpacity style={styles.receiptCloseBtn} onPress={() => setReceiptModal(null)}>
              <Text style={styles.receiptCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          {(receiptModal?.receipt_url || receiptModal?.receipt_local_uri) ? (
            <Image
              source={{ uri: receiptModal.receipt_url || receiptModal.receipt_local_uri }}
              style={styles.receiptImage}
              resizeMode="contain"
            />
          ) : null}
          <Text style={styles.receiptVendorLabel}>
            {receiptModal?.vendor_name_en || receiptModal?.vendor_name}
            {'  ·  '}
            {fmtDate(receiptModal?.order_date)}
            {'  ·  '}
            {inr(receiptModal?.total_amount || 0)}
          </Text>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f7f2' },

  addBtn:      { backgroundColor: '#52b788', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnText:  { fontSize: 14, fontWeight: '800', color: '#fff' },
  closeBtn:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 16, color: '#fff', fontWeight: '700' },

  testStrip:     { backgroundColor: '#eef3ee', paddingVertical: 6, alignItems: 'center' },
  testStripText: { fontSize: 11, color: '#8a978d', fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingVertical: 16, paddingHorizontal: 16, gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#a8d5b5', marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 48 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionTitle:  { fontSize: 13, fontWeight: '800', color: '#5b6b60', textTransform: 'uppercase', letterSpacing: 0.6 },
  badge:         { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  badgeText:     { fontSize: 13, fontWeight: '800' },

  orderCard:         { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 5, borderLeftColor: '#f6a623', elevation: 2, shadowColor: '#1a472a', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  orderCardReceived: { borderLeftColor: '#2d6a4f', backgroundColor: '#f8fff8' },
  orderHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  orderVendor:  { fontSize: 17, fontWeight: '800', color: '#1a472a' },
  orderMeta:    { fontSize: 12, color: '#8a978d', marginTop: 2 },
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

  // Payment section
  payDivider:    { height: 1, backgroundColor: '#f0f0f0', marginTop: 10, marginBottom: 10 },
  paySection:    { gap: 8 },
  payStatusRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paidBadge:     { backgroundColor: '#d1e7dd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  paidBadgeText: { color: '#0f5132', fontSize: 12, fontWeight: '700' },
  paidMeta:      { fontSize: 12, color: '#2d6a4f', fontWeight: '600' },
  paidDate:      { fontSize: 11, color: '#888', marginTop: 1 },
  pendingBadge:     { backgroundColor: '#fff3cd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pendingBadgeText: { color: '#856404', fontSize: 12, fontWeight: '700' },
  markPaidBtn:      { marginLeft: 'auto', backgroundColor: '#2d6a4f', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  markPaidBtnText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  receiptBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  receiptBtnGreen:  { borderColor: '#2d6a4f', backgroundColor: '#f0fff4' },
  receiptBtnText:   { fontSize: 13, color: '#666', fontWeight: '600' },
  receiptBtnTextGreen: { color: '#2d6a4f' },

  emptyHint: { textAlign: 'center', color: '#888', fontSize: 15, marginTop: 20, marginBottom: 10, lineHeight: 26 },

  // Add order form
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

  // Payment bottom sheet
  sheetOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  paySheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHandle:   { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:    { fontSize: 20, fontWeight: '700', color: '#1a472a', marginBottom: 4 },
  sheetVendor:   { fontSize: 13, color: '#888', marginBottom: 20 },
  sheetLabel:    { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8 },
  amtRow:        { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#2d6a4f', borderRadius: 12, paddingHorizontal: 14, height: 56, marginBottom: 20 },
  amtRupee:      { fontSize: 24, color: '#2d6a4f', fontWeight: '700', marginRight: 6 },
  amtInput:      { flex: 1, fontSize: 28, fontWeight: '700', color: '#1a472a' },
  modeRow:       { flexDirection: 'row', gap: 12, marginBottom: 18 },
  modeBtn:       { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa' },
  modeBtnActive: { borderColor: '#2d6a4f', backgroundColor: '#e8f5ec' },
  modeEmoji:     { fontSize: 24, marginBottom: 4 },
  modeLabel:     { fontSize: 12, fontWeight: '600', color: '#666' },
  modeLabelActive: { color: '#2d6a4f' },

  // Receipt attach (inside payment sheet)
  attachReceiptBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#2d6a4f', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, marginBottom: 24 },
  attachReceiptText: { fontSize: 14, fontWeight: '700', color: '#2d6a4f' },
  receiptPreviewRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#e8f5ec', borderRadius: 12, padding: 10, marginBottom: 24 },
  receiptThumb:       { width: 48, height: 48, borderRadius: 8, backgroundColor: '#ccc' },
  receiptAttachedText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#2d6a4f' },
  receiptRemoveBtn:   { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  receiptRemoveText:  { fontSize: 14, fontWeight: '700', color: '#e74c3c' },

  confirmPayBtn:     { backgroundColor: '#2d6a4f', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  confirmPayBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Receipt viewer
  receiptViewer:       { flex: 1, backgroundColor: '#000' },
  receiptViewerHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a472a', paddingHorizontal: 16, paddingVertical: 14 },
  receiptViewerTitle:  { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  receiptCloseBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  receiptCloseBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  receiptImage:        { flex: 1 },
  receiptVendorLabel:  { color: '#aaa', textAlign: 'center', paddingVertical: 12, fontSize: 13 },
});
