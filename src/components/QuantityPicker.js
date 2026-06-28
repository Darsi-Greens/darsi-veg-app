import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
} from 'react-native';
import { Voice } from '../services/Speak';

const QUICK_QTYS = [1, 2, 5, 10, 20, 50];

export default function QuantityPicker({ value, onChange, unit = 'కేజీ', step = 1 }) {
  const [typing, setTyping] = useState(false);
  const [typingVal, setTypingVal] = useState('');

  const numVal = parseFloat(value) || 0;

  const handleQuick = (q) => { onChange(String(q)); Voice.speak(`${q} ${unit}`); };

  const handleStep = (dir) => {
    const next = Math.max(0, parseFloat((numVal + dir * step).toFixed(2)));
    onChange(String(next));
    Voice.speak(`${next} ${unit}`);
  };

  const finishTyping = () => {
    setTyping(false);
    const v = parseFloat(typingVal);
    if (!isNaN(v) && v >= 0) onChange(String(v));
    else onChange(String(numVal));
  };

  return (
    <View style={styles.root}>
      {/* Quick buttons */}
      <View style={styles.quickRow}>
        {QUICK_QTYS.map((q) => {
          const active = numVal === q;
          return (
            <TouchableOpacity
              key={q}
              style={[styles.quickBtn, active && styles.quickBtnActive]}
              onPress={() => handleQuick(q)}
            >
              <Text style={[styles.quickBtnText, active && styles.quickBtnActiveText]}>{q}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Fine adjust */}
      <View style={styles.adjustRow}>
        <TouchableOpacity style={styles.adjustBtn} onPress={() => handleStep(-1)}>
          <Text style={styles.adjustBtnText}>−</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.currentVal} onPress={() => { setTypingVal(String(numVal)); setTyping(true); }}>
          {typing ? (
            <TextInput
              style={styles.currentValInput}
              value={typingVal}
              onChangeText={setTypingVal}
              onBlur={finishTyping}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
            />
          ) : (
            <Text style={styles.currentValText}>{numVal} {unit}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.adjustBtn} onPress={() => handleStep(1)}>
          <Text style={styles.adjustBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },

  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  quickBtn: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#b7e4c7',
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  quickBtnActive:     { backgroundColor: '#2d6a4f', borderColor: '#2d6a4f' },
  quickBtnText:       { fontSize: 15, fontWeight: '700', color: '#2d6a4f' },
  quickBtnActiveText: { color: '#fff' },

  adjustRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adjustBtn:   { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center' },
  adjustBtnText: { fontSize: 30, color: '#fff', fontWeight: '300', lineHeight: 34 },

  currentVal: {
    flex: 1, height: 56, borderRadius: 12,
    borderWidth: 2, borderColor: '#b7e4c7',
    backgroundColor: '#f8fff8',
    alignItems: 'center', justifyContent: 'center',
  },
  currentValText:  { fontSize: 18, fontWeight: '700', color: '#1a472a' },
  currentValInput: { fontSize: 18, fontWeight: '700', color: '#1a472a', textAlign: 'center', width: '100%' },
});
