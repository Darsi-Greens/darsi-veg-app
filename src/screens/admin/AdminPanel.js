import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal,
  StyleSheet, SafeAreaView, Alert, Switch, ScrollView, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import {
  collection, getDocs, addDoc, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { LocalDB } from '../../services/LocalDB';
import { Voice } from '../../services/Speak';
import VegImage from '../../components/VegImage';
import { uploadImage, cloudinaryConfigured } from '../../services/cloudinary';

const ADMIN_PIN_KEY   = 'pin_admin';
const REGULAR_PIN_KEY = 'pin_regular';
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const UNITS = ['kg', 'piece', 'bundle', 'dozen'];

// Andhra Pradesh locations for area suggestions
const AP_LOCATIONS = [
  'Darsi', 'Darsi Market', 'Ongole', 'Kandukur', 'Chirala', 'Markapur',
  'Giddalur', 'Podili', 'Kanigiri', 'Addanki', 'Pamuru',
  'Cumbum', 'Yerragondapalem', 'Kurichedu', 'Santhanuthalapadu',
  'Hyderabad', 'Vijayawada', 'Guntur', 'Tirupati', 'Nellore',
  'Kurnool', 'Kadapa', 'Anantapur', 'Vizag', 'Kakinada',
  'Rajahmundry', 'Eluru', 'Machilipatnam', 'Tenali', 'Narasaraopet',
];

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
  const [vendors,       setVendors]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editTarget,    setEditTarget]    = useState(null);
  const [form,          setForm]          = useState({
    name: '', name_en: '', phone: '', area: '', area_en: '', active: true,
  });
  const [saving,        setSaving]        = useState(false);
  const [translating,   setTranslating]   = useState({ name: false, area: false });
  const [areaSuggestions, setAreaSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'vendors'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name_en || a.name || '').localeCompare(b.name_en || b.name || ''));
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

  const handleAreaEnChange = (v) => {
    setForm((p) => ({ ...p, area_en: v }));
    if (v.trim().length >= 2) {
      const lower = v.toLowerCase();
      const filtered = AP_LOCATIONS.filter((loc) =>
        loc.toLowerCase().includes(lower)
      ).slice(0, 5);
      setAreaSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectAreaSuggestion = async (loc) => {
    setForm((p) => ({ ...p, area_en: loc }));
    setShowSuggestions(false);
    // Auto-translate selected location to Telugu
    if (!form.area) {
      setTranslating((p) => ({ ...p, area: true }));
      const te = await translateToTelugu(loc);
      if (te) setForm((p) => ({ ...p, area: te }));
      setTranslating((p) => ({ ...p, area: false }));
    }
  };

  const handleAreaEnBlur = async () => {
    setTimeout(() => setShowSuggestions(false), 150);
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

      let savedId = editTarget?.id;
      if (editTarget) {
        await updateDoc(doc(db, 'vendors', editTarget.id), data);
      } else {
        data.created_at = serverTimestamp();
        const ref = await addDoc(collection(db, 'vendors'), data);
        savedId = ref.id;
      }

      // Immediately update LocalDB cache so OrdersScreen picks it up on focus
      const cached = (await LocalDB.get('cache_vendors')) || [];
      const serializableData = { ...data, updated_at: new Date().toISOString(), created_at: data.created_at ? new Date().toISOString() : undefined };
      let updatedCache;
      if (editTarget) {
        updatedCache = cached.map((v) => v.id === editTarget.id ? { id: editTarget.id, ...serializableData } : v);
      } else {
        updatedCache = [...cached, { id: savedId, ...serializableData }];
      }
      await LocalDB.set('cache_vendors', updatedCache);

      setModalOpen(false);
      await loadVendors(); // refresh from Firestore to get server timestamps
    } catch {
      Alert.alert('లోపం', 'Save failed. Check internet.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (v) => {
    Alert.alert(
      `${v.name_en || v.name} తొలగించాలా?`,
      'Soft delete — vendor will be hidden.',
      [
        { text: '✕ వద్దు · Cancel', style: 'cancel' },
        {
          text: 'తొలగించు · Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'vendors', v.id), { active: false, updated_at: serverTimestamp() });
              // Update cache immediately
              const cached = (await LocalDB.get('cache_vendors')) || [];
              await LocalDB.set('cache_vendors', cached.map((c) => c.id === v.id ? { ...c, active: false } : c));
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
        <Text style={styles.addBtnText}>➕ వెండర్ చేర్చండి · Add Vendor</Text>
      </TouchableOpacity>

      <FlatList
        data={vendors}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.vendorCard, !item.active && styles.inactiveCard]}>
            <View style={{ flex: 1 }}>
              {/* Admin sees English first */}
              <Text style={styles.vendorNameEn}>{item.name_en || item.name}</Text>
              <Text style={styles.vendorSub}>
                {item.name ? `${item.name}` : ''}{item.area ? `  ·  ${item.area}` : ''}
              </Text>
              {(item.area_en || item.phone) ? (
                <Text style={styles.vendorSub2}>
                  {item.area_en ?? ''}{item.phone ? `  ·  ${item.phone}` : ''}
                </Text>
              ) : null}
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
              {editTarget ? 'వెండర్ మార్చండి · Edit' : 'వెండర్ చేర్చండి · Add'}
            </Text>

            {/* 1. English name */}
            <Text style={styles.fieldLabel}>వెండర్ పేరు (English) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Raju, Suresh, Murali"
              value={form.name_en}
              onChangeText={(v) => setForm((p) => ({ ...p, name_en: v }))}
              onBlur={handleNameEnBlur}
            />

            {/* 2. Telugu name — auto-translated */}
            <View style={styles.transRow}>
              <Text style={styles.fieldLabel}>వెండర్ పేరు (తెలుగు)</Text>
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

            {/* 3. English area — with AP location suggestions */}
            <Text style={styles.fieldLabel}>ప్రాంతం / Location (English)</Text>
            <View style={{ zIndex: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="e.g. Darsi Market, Kandukur, Podili"
                value={form.area_en}
                onChangeText={handleAreaEnChange}
                onBlur={handleAreaEnBlur}
                onFocus={() => { if (form.area_en.length >= 2) setShowSuggestions(areaSuggestions.length > 0); }}
              />
              {showSuggestions && (
                <View style={styles.suggestionBox}>
                  {areaSuggestions.map((loc) => (
                    <TouchableOpacity
                      key={loc}
                      style={styles.suggestionRow}
                      onPress={() => selectAreaSuggestion(loc)}
                    >
                      <Text style={styles.suggestionText}>📍 {loc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* 4. Telugu area — auto-translated */}
            <View style={styles.transRow}>
              <Text style={styles.fieldLabel}>ప్రాంతం (తెలుగు)</Text>
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

            {/* 5. Phone */}
            <Text style={styles.fieldLabel}>ఫోన్ నంబర్ · Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="9848012345"
              value={form.phone}
              keyboardType="phone-pad"
              onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
            />

            {/* 6. Active toggle */}
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
                <Text>✕ వద్దు</Text>
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
  const [vegs,        setVegs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState({ name_te: '', name_en: '', emoji: '', photo_url: '', unit: 'kg', active: true });
  const [saving,      setSaving]      = useState(false);
  const [translating, setTranslating] = useState(false);
  const [photoBusy,   setPhotoBusy]   = useState(false);

  const pickVegPhoto = () => {
    if (!cloudinaryConfigured()) {
      Alert.alert('సెటప్ కాలేదు · Not set up', 'Cloudinary keys missing in .env.');
      return;
    }
    Alert.alert('📷 కూరగాయ ఫోటో · Vegetable photo', 'ఫోటో ఎంచుకోండి · Choose photo', [
      { text: '📷 ఫోటో తీయండి · Camera',    onPress: () => grabVegPhoto('camera') },
      { text: '🖼️ గ్యాలరీ నుండి · Gallery', onPress: () => grabVegPhoto('gallery') },
      { text: '✕ వద్దు · Cancel', style: 'cancel' },
    ]);
  };

  const grabVegPhoto = async (source) => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('అనుమతి కావాలి · Permission needed', 'ఫోన్ Settings లో అనుమతి ఇవ్వండి.');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) { Alert.alert('ఫోటో రాలేదు · No photo'); return; }
      setPhotoBusy(true);
      const url = await uploadImage(uri, 'vegetables');
      setForm((p) => ({ ...p, photo_url: url }));
    } catch (e) {
      Alert.alert('ఫోటో లోపం · Photo error', String(e?.message || e));
    } finally {
      setPhotoBusy(false);
    }
  };

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
    setForm({ name_te: '', name_en: '', emoji: '🥬', photo_url: '', unit: 'kg', active: true });
    setModalOpen(true);
  };

  const openEdit = (v) => {
    setEditTarget(v);
    setForm({ name_te: v.name_te, name_en: v.name_en, emoji: v.emoji ?? '', photo_url: v.photo_url ?? '', unit: v.unit ?? 'kg', active: v.active !== false });
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
        photo_url:  form.photo_url.trim(),
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
        <Text style={styles.addBtnText}>➕ కూరగాయ చేర్చండి · Add Vegetable</Text>
      </TouchableOpacity>

      <FlatList
        data={vegs}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.vegRow, !item.active && styles.inactiveCard]}>
            <VegImage veg={item} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.vegNameEn}>{item.name_en}</Text>
              <Text style={styles.vegNameTe}>{item.name_te}  ·  {item.unit}</Text>
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
            <Text style={styles.modalTitle}>{editTarget ? 'కూరగాయ మార్చండి' : 'కూరగాయ చేర్చండి'}</Text>

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

            <Text style={styles.fieldLabel}>ఫోటో · Photo</Text>
            <View style={styles.photoRow}>
              <VegImage veg={form} size={64} rounded={false} />
              <TouchableOpacity style={styles.photoBtn} onPress={pickVegPhoto} disabled={photoBusy}>
                {photoBusy
                  ? <ActivityIndicator color="#2e7d32" />
                  : <Text style={styles.photoBtnText}>📷 ఫోటో తీయండి / ఎంచుకోండి</Text>}
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="లేదా లింక్ అతికించండి · or paste URL"
              autoCapitalize="none"
              value={form.photo_url}
              onChangeText={(v) => setForm((p) => ({ ...p, photo_url: v }))}
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
                <Text>✕ వద్దు</Text>
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
  const [voiceOn,    setVoiceOn]    = useState(!Voice.isMuted());
  const [teVoice,    setTeVoice]    = useState(null); // null=checking, true/false

  useEffect(() => {
    (async () => {
      const ap = await AsyncStorage.getItem(ADMIN_PIN_KEY);
      const rp = await AsyncStorage.getItem(REGULAR_PIN_KEY);
      const sn = await AsyncStorage.getItem('shop_name');
      setAdminPin(ap ?? '9999');
      setRegularPin(rp ?? '1234');
      setShopName(sn ?? 'Darsi Greens');
      setTeVoice(await Voice.hasTeluguVoice());
    })();
  }, []);

  const toggleVoice = (v) => { setVoiceOn(v); Voice.setMuted(!v); if (v) Voice.speak('వాయిస్ ఆన్ అయింది'); };
  const testVoice   = () => { Voice.setMuted(false); setVoiceOn(true); Voice.speak('నమస్తే, ఇది దర్శి గ్రీన్స్. టమాట, నలభై రూపాయలు.'); };

  const handleSave = async () => {
    const onlyDigits = (s) => /^[0-9]+$/.test(s);
    if (adminPin.length < 4 || regularPin.length < 4 || adminPin.length > 8 || regularPin.length > 8) {
      Alert.alert('PIN పొడవు తప్పు', 'PINs must be 4 to 8 digits.');
      return;
    }
    if (!onlyDigits(adminPin) || !onlyDigits(regularPin)) {
      Alert.alert('PIN తప్పు', 'PINs must contain digits only.');
      return;
    }
    if (adminPin === regularPin) {
      Alert.alert('PIN తప్పు', 'Admin PIN and regular PIN must be different.');
      return;
    }
    // One PIN must not be a prefix of the other, otherwise the login screen's
    // auto-submit would always match the shorter one first and the longer PIN
    // could never be entered.
    if (adminPin.startsWith(regularPin) || regularPin.startsWith(adminPin)) {
      Alert.alert('PIN తప్పు', 'One PIN cannot be the start of the other. Choose distinct PINs.');
      return;
    }
    setSaving(true);
    await AsyncStorage.setItem(ADMIN_PIN_KEY, adminPin);
    await AsyncStorage.setItem(REGULAR_PIN_KEY, regularPin);
    await AsyncStorage.setItem('shop_name', shopName.trim() || 'Darsi Greens');
    setSaving(false);
    Alert.alert('సేవ్ అయింది ✓', 'Settings saved successfully.');
  };

  const backToApp = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const handleLogout = () => {
    Alert.alert('లాగౌట్ · Logout', 'PIN స్క్రీన్‌కి వెళ్ళాలా? · Go to PIN screen?', [
      { text: '✕ వద్దు · Cancel', style: 'cancel' },
      {
        text: 'లాగౌట్ · Logout',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.setItemAsync('authenticated', 'false');
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const envLabels = { development: '🔧 DEV', staging: '🧪 STG/BETA', production: '✅ PROD' };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.sectionTitle}>🔐 PIN మార్చండి · Change PINs</Text>

      <Text style={styles.fieldLabel}>Admin PIN</Text>
      <TextInput
        style={styles.input}
        value={adminPin}
        onChangeText={setAdminPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="Admin PIN"
      />

      <Text style={styles.fieldLabel}>Regular PIN (parents)</Text>
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

      <Text style={styles.sectionTitle}>🔊 వాయిస్ · Voice</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>తెలుగు వాయిస్ · Speak in Telugu</Text>
        <Switch value={voiceOn} onValueChange={toggleVoice} thumbColor={voiceOn ? '#2e7d32' : '#aaa'} />
      </View>
      <TouchableOpacity style={styles.testVoiceBtn} onPress={testVoice}>
        <Text style={styles.testVoiceText}>🔊 వాయిస్ పరీక్ష · Test voice</Text>
      </TouchableOpacity>
      <Text style={styles.voiceStatus}>
        {teVoice === null
          ? 'తనిఖీ చేస్తోంది... · checking…'
          : teVoice
            ? '✅ తెలుగు వాయిస్ అందుబాటులో ఉంది · Telugu voice available'
            : '⚠️ తెలుగు వాయిస్ లేదు — ఫోన్ Settings → Text-to-speech లో install చేయండి · Telugu voice not found; install it in phone TTS settings'}
      </Text>

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

      <TouchableOpacity style={styles.backAppBtn} onPress={backToApp}>
        <Text style={styles.backAppText}>← యాప్‌కి తిరిగి · Back to App</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>🚪 లాగౌట్ · Logout (PIN screen)</Text>
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
      {/* Header — close returns to the app (Home tabs), NOT the login screen */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.exitBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
        >
          <Text style={styles.exitBtnText}>← యాప్‌కి · App</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ Admin Panel</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Tab bar */}
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

      {/* Tab content */}
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
  root:    { flex: 1, backgroundColor: '#f4f6f4' },
  header:  {
    backgroundColor: '#1a472a',
    paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', flex: 1 },
  exitBtn:     { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  exitBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#ddd' },
  tab:           { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:     { borderBottomWidth: 3, borderColor: '#2e7d32' },
  tabText:       { fontSize: 14, color: '#666' },
  tabTextActive: { color: '#2e7d32', fontWeight: '700' },

  addBtn:     { margin: 12, backgroundColor: '#2e7d32', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  vendorCard:    { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  inactiveCard:  { opacity: 0.5 },
  vendorNameEn:  { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  vendorSub:     { fontSize: 13, color: '#555', marginTop: 2 },
  vendorSub2:    { fontSize: 12, color: '#888', marginTop: 1 },
  inactiveLabel: { fontSize: 12, color: '#e53935', marginTop: 4 },
  vendorActions: { flexDirection: 'row', gap: 8 },
  editBtn:       { padding: 6 },
  editBtnText:   { fontSize: 20 },
  delBtn:        { padding: 6 },
  delBtnText:    { fontSize: 20 },

  vegRow:    { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 1 },
  vegEmoji:  { fontSize: 28 },
  vegNameEn: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  vegNameTe: { fontSize: 12, color: '#666', marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox:     { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 16, textAlign: 'center' },
  input:        { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 10 },
  transRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  transPlaceholder: { flexDirection: 'row', alignItems: 'center' },
  retransBtn:   { padding: 4 },
  retransBtnText: { fontSize: 18 },

  suggestionBox: {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ccc',
    marginTop: -8, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4, zIndex: 100,
  },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', minHeight: 44, justifyContent: 'center' },
  suggestionText: { fontSize: 14, color: '#1a472a' },

  switchRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  switchLabel:  { fontSize: 15, color: '#333' },
  fieldLabel:   { fontSize: 13, color: '#555', marginBottom: 6 },
  unitRow:      { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  unitChip:     { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  unitChipSel:  { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  unitChipText: { fontSize: 13, color: '#333' },
  modalBtns:    { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:    { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  saveBtn:      { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
  saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a472a', marginTop: 20, marginBottom: 10 },
  photoRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  photoBtn:     { flex: 1, backgroundColor: '#e8f5ec', borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: '#2e7d32' },
  testVoiceBtn:  { marginTop: 4, padding: 12, backgroundColor: '#e8f5ec', borderRadius: 10, alignItems: 'center' },
  testVoiceText: { fontSize: 15, color: '#2e7d32', fontWeight: '700' },
  voiceStatus:   { fontSize: 12, color: '#666', marginTop: 8, lineHeight: 18 },
  envBox:       { marginTop: 28, padding: 14, backgroundColor: '#e8f5e9', borderRadius: 10, alignItems: 'center' },
  envLabel:     { fontSize: 14, color: '#2e7d32', fontWeight: '600' },
  backAppBtn:   { marginTop: 20, padding: 14, backgroundColor: '#e8f5ec', borderRadius: 10, alignItems: 'center' },
  backAppText:  { fontSize: 15, color: '#2e7d32', fontWeight: '700' },
  logoutBtn:    { marginTop: 12, padding: 14, backgroundColor: '#fff3e0', borderRadius: 10, alignItems: 'center' },
  logoutText:   { fontSize: 14, color: '#e65100', fontWeight: '600' },

  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
});
