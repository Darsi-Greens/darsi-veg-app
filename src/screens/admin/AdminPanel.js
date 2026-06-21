import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal,
  StyleSheet, SafeAreaView, Alert, Switch, ScrollView, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, getDocs, addDoc, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { LocalDB } from '../../services/LocalDB';

const ADMIN_PIN_KEY   = 'pin_admin';
const REGULAR_PIN_KEY = 'pin_regular';
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const UNITS = ['kg', 'piece', 'bundle', 'dozen'];

async function translateToTelugu(text) {
  if (!text.trim()) return '';
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=te&dt=t&q=${encodeURIComponent(text)}`
    );
    const data = await res.json();
    return data[0]?.[0]?.[0] ?? '';
  } catch {
    return '';
  }
}

// ── Vendors Tab ──────────────────────────────────────────────────────────────

function VendorsTab() {
  const [vendors,      setVendors]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [form,         setForm]         = useState({
    name: '', name_en: '', phone: '', area: '', area_en: '', active: true,
  });
  const [saving,       setSaving]       = useState(false);
  const [translating,  setTranslating]  = useState({ name: false, area: false });

  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'vendors'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setVendors(list);
      await LocalDB.set('cache_vendors', list);
    } catch {
      const cached = await LocalDB.get('cache_vendors');
      if (cached) setVendors(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  const openAdd = () => {
    setEditTarget(null);
    setForm({ name: '', name_en: '', phone: '', area: '', area_en: '', active: true });
    setModalOpen(true);
  };

  const openEdit = (v) => {
    setEditTarget(v);
    setForm({
      name:    v.name ?? '',
      name_en: v.name_en ?? '',
      phone:   v.phone ?? '',
      area:    v.area ?? '',
      area_en: v.area_en ?? '',
      active:  v.active !== false,
    });
    setModalOpen(true);
  };

  const handleNameEnBlur = async () => {
    if (!form.name_en.trim() || form.name) return;
    setTranslating((p) => ({ ...p, name: true }));
    const te = await translateToTelugu(form.name_en);
    if (te) setForm((p) => ({ ...p, name: te }));
    setTranslating((p) => ({ ...p, name: false }));
  };

  const handleAreaEnBlur = async () => {
    if (!form.area_en.trim() || form.area) return;
    setTranslating((p) => ({ ...p, area: true }));
    const te = await translateToTelugu(form.area_en);
    if (te) setForm((p) => ({ ...p, area: te }));
    setTranslating((p) => ({ ...p, area: false }));
  };

  const retranslate = async (field) => {
    const src = field === 'name' ? form.name_en : form.area_en;
    if (!src.trim()) return;
    setTranslating((p) => ({ ...p, [field]: true }));
    const te = await translateToTelugu(src);
    if (te) setForm((p) => ({ ...p, [field]: te }));
    setTranslating((p) => ({ ...p, [field]: false }));
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) { Alert.alert('పేరు అవసరం', 'Enter English name first.'); return; }
    setSaving(true);
    try {
      const data = {
        name:       form.name.trim() || form.name_en.trim(),
        name_en:    form.name_en.trim(),
        phone:      form.phone.trim(),
        area:       form.area.trim(),
        area_en:    form.area_en.trim(),
        active:     form.active,
        updated_at: serverTimestamp(),
      };
      if (editTarget) {
        await updateDoc(doc(db, 'vendors', editTarget.id), data);
      } else {
        data.created_at = serverTimestamp();
        await addDoc(collection(db, 'vendors'), data);
      }
      setModalOpen(false);
      await loadVendors();
    } catch {
      Alert.alert('లోపం', 'Save failed. Check internet.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (v) => {
    Alert.alert(
      `${v.name} తొలగించాలా?`,
      'Soft delete — vendor will be hidden.',
      [
        { text: 'రద్దు · Cancel', style: 'cancel' },
        {
          text: 'తొలగించు · Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'vendors', v.id), { active: false, updated_at: serverTimestamp() });
              await loadVendors();
            } catch { Alert.alert('లోపం', 'Delete failed.'); }
          },
        },
      ]
    );
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#2e7d32" />;

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Text style={styles.addBtnText}>+ వెండర్ చేర్చండి · Add Vendor</Text>
      </TouchableOpacity>

      <FlatList
        data={vendors}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.vendorCard, !item.active && styles.inactiveCard]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.vendorName}>{item.name}</Text>
              <Text style={styles.vendorSub}>
                {item.name_en}{item.area ? `  ·  ${item.area}` : ''}
              </Text>
              {item.area_en ? <Text style={styles.vendorSub2}>{item.area_en}</Text> : null}
              {item.phone ? <Text style={styles.vendorPhone}>{item.phone}</Text> : null}
              {!item.active && <Text style={styles.inactiveLabel}>నిష్క్రియ · Inactive</Text>}
            </View>
            <View style={styles.vendorActions}>
              <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
                <Text style={styles.editBtnText}>✏️</Text>
              </TouchableOpacity>
              {item.active && (
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.delBtn}>
                  <Text style={styles.delBtnText}>🗑️</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>వెండర్లు లేరు · No vendors</Text>}
      />

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalBox} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>
              {editTarget ? 'వెండర్ సవరించండి · Edit' : 'వెండర్ చేర్చండి · Add'}
            </Text>

            {/* English name first — translates to Telugu */}
            <Text style={styles.fieldLabel}>వెండర్ పేరు (English) · name_en *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Raju, Suresh, Murali"
              value={form.name_en}
              onChangeText={(v) => setForm((p) => ({ ...p, name_en: v }))}
              onBlur={handleNameEnBlur}
            />

            {/* Telugu name — auto-filled, editable */}
            <View style={styles.transRow}>
              <Text style={styles.fieldLabel}>వెండర్ పేరు (తెలుగు) · name</Text>
              <TouchableOpacity onPress={() => retranslate('name')} style={styles.retransBtn}>
                <Text style={styles.retransBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>
            {translating.name ? (
              <View style={[styles.input, styles.transPlaceholder]}>
                <ActivityIndicator size="small" color="#2e7d32" />
                <Text style={{ marginLeft: 8, color: '#888' }}>అనువదిస్తున్నాం...</Text>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="తెలుగు పేరు (auto-filled)"
                value={form.name}
                onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              />
            )}

            {/* English area — translates to Telugu */}
            <Text style={styles.fieldLabel}>ప్రాంతం (English) · area_en</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Darsi Market, Kandukur"
              value={form.area_en}
              onChangeText={(v) => setForm((p) => ({ ...p, area_en: v }))}
              onBlur={handleAreaEnBlur}
            />

            {/* Telugu area — auto-filled, editable */}
            <View style={styles.transRow}>
              <Text style={styles.fieldLabel}>ప్రాంతం (తెలుగు) · area</Text>
              <TouchableOpacity onPress={() => retranslate('area')} style={styles.retransBtn}>
                <Text style={styles.retransBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>
            {translating.area ? (
              <View style={[styles.input, styles.transPlaceholder]}>
                <ActivityIndicator size="small" color="#2e7d32" />
                <Text style={{ marginLeft: 8, color: '#888' }}>అనువదిస్తున్నాం...</Text>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="తెలుగు ప్రాంతం (auto-filled)"
                value={form.area}
                onChangeText={(v) => setForm((p) => ({ ...p, area: v }))}
              />
            )}

            <Text style={styles.fieldLabel}>ఫోన్ నంబర్ · Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="9848012345"
              value={form.phone}
              keyboardType="phone-pad"
              onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>సక్రియం · Active</Text>
              <Switch
                value={form.active}
                onValueChange={(v) => setForm((p) => ({ ...p, active: v }))}
                thumbColor={form.active ? '#2e7d32' : '#aaa'}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.cancelBtn}>
                <Text>రద్దు</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>సేవ్</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Vegetables Tab ───────────────────────────────────────────────────────────

function VegetablesTab() {
  const [vegs,       setVegs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState({ name_te: '', name_en: '', emoji: '', unit: 'kg', active: true });
  const [saving,     setSaving]     = useState(false);
  const [translating, setTranslating] = useState(false);

  const loadVegs = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'vegetables'));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name_en ?? '').localeCompare(b.name_en ?? ''));
      setVegs(list);
      await LocalDB.set('cache_vegetables', list);
    } catch {
      const cached = await LocalDB.get('cache_vegetables');
      if (cached) setVegs(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVegs(); }, [loadVegs]);

  const toggleActive = async (veg) => {
    try {
      await updateDoc(doc(db, 'vegetables', veg.id), { active: !veg.active, updated_at: serverTimestamp() });
      setVegs((prev) => prev.map((v) => v.id === veg.id ? { ...v, active: !veg.active } : v));
    } catch { Alert.alert('లోపం', 'Update failed.'); }
  };

  const openAdd = () => {
    setEditTarget(null);
    setForm({ name_te: '', name_en: '', emoji: '🥬', unit: 'kg', active: true });
    setModalOpen(true);
  };

  const openEdit = (v) => {
    setEditTarget(v);
    setForm({ name_te: v.name_te, name_en: v.name_en, emoji: v.emoji ?? '', unit: v.unit ?? 'kg', active: v.active !== false });
    setModalOpen(true);
  };

  const handleNameEnBlur = async () => {
    if (!form.name_en.trim() || form.name_te) return;
    setTranslating(true);
    const te = await translateToTelugu(form.name_en);
    if (te) setForm((p) => ({ ...p, name_te: te }));
    setTranslating(false);
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) { Alert.alert('పేరు అవసరం', 'Enter English name.'); return; }
    setSaving(true);
    try {
      const data = {
        name_te:    form.name_te.trim() || form.name_en.trim(),
        name_en:    form.name_en.trim(),
        emoji:      form.emoji.trim() || '🥬',
        unit:       form.unit,
        active:     form.active,
        updated_at: serverTimestamp(),
      };
      if (editTarget) {
        await updateDoc(doc(db, 'vegetables', editTarget.id), data);
      } else {
        data.created_at = serverTimestamp();
        await addDoc(collection(db, 'vegetables'), data);
      }
      setModalOpen(false);
      await loadVegs();
    } catch {
      Alert.alert('లోపం', 'Save failed. Check internet.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#2e7d32" />;

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Text style={styles.addBtnText}>+ కూరగాయ చేర్చండి · Add Vegetable</Text>
      </TouchableOpacity>

      <FlatList
        data={vegs}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.vegRow, !item.active && styles.inactiveCard]}>
            <Text style={styles.vegEmoji}>{item.emoji ?? '🥬'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.vegNameTe}>{item.name_te}</Text>
              <Text style={styles.vegNameEn}>{item.name_en}  ·  {item.unit}</Text>
            </View>
            <Switch
              value={item.active !== false}
              onValueChange={() => toggleActive(item)}
              thumbColor={item.active !== false ? '#2e7d32' : '#aaa'}
            />
            <TouchableOpacity onPress={() => openEdit(item)} style={{ marginLeft: 8 }}>
              <Text style={{ fontSize: 18 }}>✏️</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>కూరగాయలు లేవు · No vegetables</Text>}
      />

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalBox} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editTarget ? 'కూరగాయ సవరించండి' : 'కూరగాయ చేర్చండి'}</Text>

            <Text style={styles.fieldLabel}>English name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Tomato, Onion"
              value={form.name_en}
              onChangeText={(v) => setForm((p) => ({ ...p, name_en: v }))}
              onBlur={handleNameEnBlur}
            />

            <View style={styles.transRow}>
              <Text style={styles.fieldLabel}>తెలుగు పేరు · name_te</Text>
              <TouchableOpacity
                onPress={async () => {
                  setTranslating(true);
                  const te = await translateToTelugu(form.name_en);
                  if (te) setForm((p) => ({ ...p, name_te: te }));
                  setTranslating(false);
                }}
                style={styles.retransBtn}
              >
                <Text style={styles.retransBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>
            {translating ? (
              <View style={[styles.input, styles.transPlaceholder]}>
                <ActivityIndicator size="small" color="#2e7d32" />
                <Text style={{ marginLeft: 8, color: '#888' }}>అనువదిస్తున్నాం...</Text>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="తెలుగు పేరు (auto-filled)"
                value={form.name_te}
                onChangeText={(v) => setForm((p) => ({ ...p, name_te: v }))}
              />
            )}

            <Text style={styles.fieldLabel}>Emoji</Text>
            <TextInput
              style={styles.input}
              placeholder="🍅"
              value={form.emoji}
              onChangeText={(v) => setForm((p) => ({ ...p, emoji: v }))}
            />

            <Text style={styles.fieldLabel}>Unit / యూనిట్</Text>
            <View style={styles.unitRow}>
              {UNITS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitChip, form.unit === u && styles.unitChipSel]}
                  onPress={() => setForm((p) => ({ ...p, unit: u }))}
                >
                  <Text style={[styles.unitChipText, form.unit === u && { color: '#fff' }]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Active</Text>
              <Switch
                value={form.active}
                onValueChange={(v) => setForm((p) => ({ ...p, active: v }))}
                thumbColor={form.active ? '#2e7d32' : '#aaa'}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.cancelBtn}>
                <Text>రద్దు</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>సేవ్</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ navigation }) {
  const [adminPin,   setAdminPin]   = useState('');
  const [regularPin, setRegularPin] = useState('');
  const [shopName,   setShopName]   = useState('');
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    (async () => {
      const ap = await AsyncStorage.getItem(ADMIN_PIN_KEY);
      const rp = await AsyncStorage.getItem(REGULAR_PIN_KEY);
      const sn = await AsyncStorage.getItem('shop_name');
      setAdminPin(ap ?? '9999');
      setRegularPin(rp ?? '1234');
      setShopName(sn ?? 'Darsi Greens');
    })();
  }, []);

  const handleSave = async () => {
    if (adminPin.length < 4 || regularPin.length < 4) {
      Alert.alert('PIN చిన్నది', 'PINs must be at least 4 digits.');
      return;
    }
    if (adminPin === regularPin) {
      Alert.alert('PIN తప్పు', 'Admin PIN and regular PIN must be different.');
      return;
    }
    setSaving(true);
    await AsyncStorage.setItem(ADMIN_PIN_KEY, adminPin);
    await AsyncStorage.setItem(REGULAR_PIN_KEY, regularPin);
    await AsyncStorage.setItem('shop_name', shopName.trim() || 'Darsi Greens');
    setSaving(false);
    Alert.alert('సేవ్ అయింది ✓', 'Settings saved successfully.');
  };

  const handleLogout = () => {
    Alert.alert('లాగ్ అవుట్', 'Admin panel నుండి బయటకు వెళ్ళాలా?', [
      { text: 'రద్దు', style: 'cancel' },
      { text: 'లాగ్ అవుట్', onPress: () => navigation.replace('Login') },
    ]);
  };

  const envLabels = { development: '🔧 DEV', staging: '🧪 STG/BETA', production: '✅ PROD' };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.sectionTitle}>🔐 PIN మార్చండి · Change PINs</Text>

      <Text style={styles.fieldLabel}>Admin PIN (current admin access)</Text>
      <TextInput
        style={styles.input}
        value={adminPin}
        onChangeText={setAdminPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="Admin PIN"
      />

      <Text style={styles.fieldLabel}>Regular PIN (parents use this)</Text>
      <TextInput
        style={styles.input}
        value={regularPin}
        onChangeText={setRegularPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="Regular PIN"
      />

      <Text style={styles.sectionTitle}>🏪 Shop Name</Text>
      <TextInput
        style={styles.input}
        value={shopName}
        onChangeText={setShopName}
        placeholder="Shop name"
      />

      <TouchableOpacity
        style={[styles.saveBtn, { marginTop: 16 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>సేవ్ చేయండి · Save Settings</Text>}
      </TouchableOpacity>

      <View style={styles.envBox}>
        <Text style={styles.envLabel}>Environment: {envLabels[APP_ENV] ?? APP_ENV}</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>🚪 Admin Panel నుండి బయటకు · Exit Admin</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Main AdminPanel ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'vendors',   label: 'వెండర్లు' },
  { key: 'vegs',     label: 'కూరగాయలు' },
  { key: 'settings', label: 'సెట్టింగులు' },
];

export default function AdminPanel({ navigation }) {
  const [activeTab, setActiveTab] = useState('vendors');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚙️ Admin Panel</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'vendors'  && <VendorsTab />}
        {activeTab === 'vegs'     && <VegetablesTab />}
        {activeTab === 'settings' && <SettingsTab navigation={navigation} />}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#f4f6f4' },
  header:       { backgroundColor: '#1a472a', paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  headerTitle:  { color: '#fff', fontSize: 20, fontWeight: '700' },
  tabBar:       { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#ddd' },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:    { borderBottomWidth: 3, borderColor: '#2e7d32' },
  tabText:      { fontSize: 14, color: '#666' },
  tabTextActive: { color: '#2e7d32', fontWeight: '700' },

  addBtn:     { margin: 12, backgroundColor: '#2e7d32', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  vendorCard:    { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  inactiveCard:  { opacity: 0.5 },
  vendorName:    { fontSize: 17, fontWeight: '700', color: '#1a472a' },
  vendorSub:     { fontSize: 13, color: '#555', marginTop: 2 },
  vendorSub2:    { fontSize: 12, color: '#888', marginTop: 1 },
  vendorPhone:   { fontSize: 13, color: '#777', marginTop: 2 },
  inactiveLabel: { fontSize: 12, color: '#e53935', marginTop: 4 },
  vendorActions: { flexDirection: 'row', gap: 8 },
  editBtn:       { padding: 6 },
  editBtnText:   { fontSize: 20 },
  delBtn:        { padding: 6 },
  delBtnText:    { fontSize: 20 },

  vegRow:     { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 1 },
  vegEmoji:   { fontSize: 28 },
  vegNameTe:  { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  vegNameEn:  { fontSize: 12, color: '#666', marginTop: 2 },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox:       { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle:     { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 16, textAlign: 'center' },
  input:          { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 10 },
  transRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  transPlaceholder: { flexDirection: 'row', alignItems: 'center' },
  retransBtn:     { padding: 4 },
  retransBtnText: { fontSize: 18 },
  switchRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  switchLabel:    { fontSize: 15, color: '#333' },
  fieldLabel:     { fontSize: 13, color: '#555', marginBottom: 6 },
  unitRow:        { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  unitChip:       { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  unitChipSel:    { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  unitChipText:   { fontSize: 13, color: '#333' },
  modalBtns:      { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:      { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  saveBtn:        { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
  saveBtnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a472a', marginTop: 20, marginBottom: 10 },
  envBox:       { marginTop: 28, padding: 14, backgroundColor: '#e8f5e9', borderRadius: 10, alignItems: 'center' },
  envLabel:     { fontSize: 14, color: '#2e7d32', fontWeight: '600' },
  logoutBtn:    { marginTop: 20, padding: 14, backgroundColor: '#fff3e0', borderRadius: 10, alignItems: 'center' },
  logoutText:   { fontSize: 14, color: '#e65100', fontWeight: '600' },

  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
});
