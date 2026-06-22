import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

const ADMIN_PIN_KEY   = 'pin_admin';
const REGULAR_PIN_KEY = 'pin_regular';
const DEFAULT_ADMIN   = '9999';
const DEFAULT_REGULAR = '1234';

const DIALPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['',  '0', '⌫'],
];

export default function PinLogin({ navigation }) {
  const [pin,       setPin]      = useState('');
  const [error,     setError]    = useState('');
  const [adminPin,  setAdminPin] = useState(DEFAULT_ADMIN);
  const [regPin,    setRegPin]   = useState(DEFAULT_REGULAR);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Initialize PINs on first launch
  useEffect(() => {
    (async () => {
      let ap = await AsyncStorage.getItem(ADMIN_PIN_KEY);
      let rp = await AsyncStorage.getItem(REGULAR_PIN_KEY);
      if (!ap) { ap = DEFAULT_ADMIN;   await AsyncStorage.setItem(ADMIN_PIN_KEY,   DEFAULT_ADMIN); }
      if (!rp) { rp = DEFAULT_REGULAR; await AsyncStorage.setItem(REGULAR_PIN_KEY, DEFAULT_REGULAR); }
      setAdminPin(ap);
      setRegPin(rp);
    })();
  }, []);

  const shake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleKey = (key) => {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      setError('');
      return;
    }
    if (key === '') return;

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      if (next === adminPin) {
        setPin('');
        setError('');
        SecureStore.setItemAsync('authenticated', 'true');
        navigation.replace('AdminPanel');
      } else if (next === regPin) {
        setPin('');
        setError('');
        SecureStore.setItemAsync('authenticated', 'true');
        navigation.replace('Home');
      } else {
        shake();
        setError('తప్పు PIN · Wrong PIN');
        setPin('');
        setTimeout(() => setError(''), 2000);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>దర్శి గ్రీన్స్</Text>
      <Text style={styles.subtitle}>Darsi Greens</Text>

      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
        ))}
      </Animated.View>

      {error
        ? <Text style={styles.errorText}>{error}</Text>
        : <Text style={styles.hint}>పిన్ నమోదు చేయండి · Enter PIN</Text>}

      <View style={styles.dialpad}>
        {DIALPAD.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key, ci) => (
              <TouchableOpacity
                key={ci}
                style={[styles.key, key === '' && styles.keyInvisible]}
                onPress={() => handleKey(key)}
                disabled={key === ''}
                activeOpacity={0.7}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {APP_ENV !== 'production' && (
        <Text style={styles.devHint}>Admin: PIN 9999  ·  Regular: PIN 1234</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#1a472a', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle:   { fontSize: 18, color: '#a8d5b5', marginBottom: 40 },
  dotsRow:    { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot:        { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff', backgroundColor: 'transparent' },
  dotFilled:  { backgroundColor: '#fff' },
  hint:       { color: '#a8d5b5', fontSize: 14, marginBottom: 32 },
  errorText:  { color: '#ff6b6b', fontSize: 15, fontWeight: '600', marginBottom: 32 },
  devHint:    { color: '#74c69d', fontSize: 12, marginTop: 28, opacity: 0.8 },
  dialpad:    { gap: 12 },
  row:        { flexDirection: 'row', gap: 12 },
  key:        { width: 72, height: 72, borderRadius: 36, backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center' },
  keyInvisible: { backgroundColor: 'transparent' },
  keyText:    { fontSize: 24, color: '#fff', fontWeight: '600' },
});
