import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { collection, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

// Telugu / English vegetable names
const DEFAULT_VEGETABLES = [
  { id: 'tomato',     te: 'టమాటా',       en: 'Tomato' },
  { id: 'onion',      te: 'ఉల్లిపాయ',    en: 'Onion' },
  { id: 'potato',     te: 'బంగాళాదుంప',  en: 'Potato' },
  { id: 'brinjal',    te: 'వంకాయ',       en: 'Brinjal' },
  { id: 'ladyfinger', te: 'బెండకాయ',     en: 'Lady Finger' },
  { id: 'beans',      te: 'చిక్కుడు',    en: 'Beans' },
  { id: 'carrot',     te: 'క్యారెట్',    en: 'Carrot' },
  { id: 'cabbage',    te: 'క్యాబేజీ',    en: 'Cabbage' },
  { id: 'capsicum',   te: 'క్యాప్సికం',  en: 'Capsicum' },
  { id: 'cucumber',   te: 'దోసకాయ',      en: 'Cucumber' },
  { id: 'spinach',    te: 'పాలకూర',      en: 'Spinach' },
  { id: 'coriander',  te: 'కొత్తిమీర',   en: 'Coriander' },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MorningPrices() {
  const [prices, setPrices] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    loadTodayPrices();
  }, []);

  const loadTodayPrices = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'prices', today(), 'vegetables'));
      const loaded = {};
      snapshot.forEach((docSnap) => {
        loaded[docSnap.id] = String(docSnap.data().price ?? '');
      });
      setPrices(loaded);
    } catch (e) {
      // First run or offline — start with empty prices
    }
  };

  const handleChange = (id, value) => {
    // Allow only numbers and one decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setPrices((prev) => ({ ...prev, [id]: value }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateStr = today();
      const batch = DEFAULT_VEGETABLES.map((veg) =>
        setDoc(doc(db, 'prices', dateStr, 'vegetables', veg.id), {
          teluguName: veg.te,
          englishName: veg.en,
          price: parseFloat(prices[veg.id]) || 0,
          unit: 'kg',
          updatedAt: serverTimestamp(),
        })
      );
      await Promise.all(batch);
      setLastSaved(new Date().toLocaleTimeString('te-IN'));
      Alert.alert('సేవ్ అయింది! / Saved!', `${dateStr} ధరలు సేవ్ అయ్యాయి.\nPrices saved for ${dateStr}.`);
    } catch (e) {
      Alert.alert('లోపం / Error', 'సేవ్ చేయడం విఫలమైంది.\nFailed to save. Check connection.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={styles.nameCol}>
        <Text style={styles.teluguName}>{item.te}</Text>
        <Text style={styles.englishName}>{item.en}</Text>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#999"
          value={prices[item.id] ?? ''}
          onChangeText={(val) => handleChange(item.id, val)}
          returnKeyType="next"
        />
        <Text style={styles.unit}>/కేజీ</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ఉదయం ధరలు</Text>
          <Text style={styles.headerSub}>Morning Prices — {today()}</Text>
          {lastSaved && (
            <Text style={styles.savedAt}>చివరిసారి సేవ్: {lastSaved}</Text>
          )}
        </View>

        <FlatList
          data={DEFAULT_VEGETABLES}
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
  container: {
    flex: 1,
    backgroundColor: '#f0f7f0',
  },
  header: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSub: {
    fontSize: 14,
    color: '#a8d5b5',
    marginTop: 2,
  },
  savedAt: {
    fontSize: 12,
    color: '#74c69d',
    marginTop: 4,
  },
  list: {
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  nameCol: {
    flex: 1,
  },
  teluguName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a472a',
  },
  englishName: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  priceCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rupee: {
    fontSize: 18,
    color: '#2d6a4f',
    fontWeight: '600',
  },
  input: {
    width: 72,
    height: 40,
    borderWidth: 1,
    borderColor: '#b7e4c7',
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#1a1a1a',
    backgroundColor: '#f8fff8',
    textAlign: 'right',
  },
  unit: {
    fontSize: 13,
    color: '#555',
    marginLeft: 2,
  },
  saveBtn: {
    margin: 16,
    backgroundColor: '#2d6a4f',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#74c69d',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
