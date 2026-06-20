import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CORRECT_PIN = process.env.EXPO_PUBLIC_APP_PIN || '1234';

const DIALPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

export default function PinLogin({ navigation }) {
  const [pin, setPin] = useState('');

  const handleKey = (key) => {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === '') return;

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      if (next === CORRECT_PIN) {
        SecureStore.setItemAsync('authenticated', 'true');
        navigation.replace('Home');
      } else {
        Alert.alert('తప్పు పిన్ / Wrong PIN', 'దయచేసి మళ్ళీ ప్రయత్నించండి.\nPlease try again.');
        setPin('');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>దర్శి గ్రీన్స్</Text>
      <Text style={styles.subtitle}>Darsi Greens</Text>

      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
        ))}
      </View>

      <Text style={styles.hint}>పిన్ నమోదు చేయండి / Enter PIN</Text>

      <View style={styles.dialpad}>
        {DIALPAD.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key, ci) => (
              <TouchableOpacity
                key={ci}
                style={[styles.key, key === '' && styles.keyInvisible]}
                onPress={() => handleKey(key)}
                disabled={key === ''}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#a8d5b5',
    marginBottom: 40,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#fff',
  },
  hint: {
    color: '#a8d5b5',
    fontSize: 14,
    marginBottom: 32,
  },
  dialpad: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyInvisible: {
    backgroundColor: 'transparent',
  },
  keyText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '600',
  },
});
