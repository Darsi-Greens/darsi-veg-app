import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, Platform,
} from 'react-native';
import { Voice } from '../services/Speak';
import VegImage from './VegImage';

const UNIT_TE = { kg: 'కేజీ', piece: 'పీస్', bundle: 'కట్ట', dozen: 'డజన్' };

function filterItems(items, searchText) {
  if (!searchText.trim()) return items;
  const lower = searchText.toLowerCase();
  return items.filter((item) =>
    item.name?.includes(searchText) ||
    item.name_en?.toLowerCase().includes(lower) ||
    item.name_te?.includes(searchText) ||
    item.area?.includes(searchText) ||
    item.area_en?.toLowerCase().includes(lower)
  );
}

export default function SelectionSheet({
  visible,
  onClose,
  title,
  items,
  onSelect,
  selectedId,
  type, // 'vendor' | 'vegetable'
}) {
  const [search, setSearch] = useState('');

  const filtered = filterItems(items, search);

  const handleSelect = (item) => {
    // Speak the chosen item (vendor or vegetable)
    if (type === 'vegetable') Voice.speak(item.name_te || item.name_en || '');
    else Voice.speak(`వెండర్, ${item.name || item.name_en || ''}`);
    onSelect(item);
    setSearch('');
    onClose();
  };

  const renderVendorRow = (item) => {
    const isSel = item.id === selectedId;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.row, isSel && styles.rowSel]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowSub}>{item.name_en}{item.area ? `  ·  ${item.area}` : ''}</Text>
          {(item.area_en || item.phone) ? (
            <Text style={styles.rowSub2}>
              {item.area_en ?? ''}{item.phone ? `  ·  ${item.phone}` : ''}
            </Text>
          ) : null}
        </View>
        {isSel && <Text style={styles.tick}>✓</Text>}
      </TouchableOpacity>
    );
  };

  const renderVegRow = (item) => {
    const isSel = item.id === selectedId;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.row, isSel && styles.rowSel]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.75}
      >
        <VegImage veg={item} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.name_te}</Text>
          <Text style={styles.rowSub}>{item.name_en}</Text>
        </View>
        <Text style={styles.unitBadge}>{UNIT_TE[item.unit] ?? item.unit}</Text>
        {isSel && <Text style={[styles.tick, { marginLeft: 6 }]}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.search}
            placeholder="🔍 తెలుగు లేదా English లో వెతకండి"
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => type === 'vegetable' ? renderVegRow(item) : renderVendorRow(item)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {search ? 'ఫలితాలు లేవు · No results' : 'డేటా లేదు · No data'}
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '82%', paddingBottom: 32 },
  handle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 12, marginBottom: 8 },

  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  title:    { flex: 1, fontSize: 18, fontWeight: '700', color: '#1a472a' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 14, color: '#555', fontWeight: '700' },

  search: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#f0f7f0', borderRadius: 10,
    borderWidth: 1, borderColor: '#b7e4c7',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15, color: '#1a1a1a',
  },

  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12, minHeight: 64 },
  rowSel: { backgroundColor: '#e8f5ec' },
  rowName: { fontSize: 18, fontWeight: '700', color: '#1a472a' },
  rowSub:  { fontSize: 13, color: '#666', marginTop: 2 },
  rowSub2: { fontSize: 13, color: '#888', marginTop: 1 },

  unitBadge: { fontSize: 13, fontWeight: '700', color: '#2d6a4f', backgroundColor: '#e8f5ec', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tick:      { fontSize: 18, color: '#2d6a4f', fontWeight: '900' },
  sep:       { height: 1, backgroundColor: '#f0f0f0', marginLeft: 20 },
  empty:     { textAlign: 'center', color: '#888', fontSize: 14, marginTop: 32, paddingHorizontal: 20 },
});
