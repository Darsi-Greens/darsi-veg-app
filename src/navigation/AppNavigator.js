import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Keyboard,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import OrdersScreen       from '../screens/OrdersScreen';
import SellingPricesScreen from '../screens/SellingPricesScreen';
import Sales              from '../screens/Sales';
import StockScreen        from '../screens/StockScreen';
import AnalyticsScreen    from '../screens/AnalyticsScreen';

const Tab = createBottomTabNavigator();
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const DEFAULT_ADMIN = '9999';

const TABS = [
  { name: 'ఆర్డర్లు',   component: OrdersScreen,        icon: 'cube',        iconOff: 'cube-outline',        label: 'ఆర్డర్లు' },
  { name: 'ధరలు',       component: SellingPricesScreen,  icon: 'pricetag',    iconOff: 'pricetag-outline',    label: 'ధరలు' },
  { name: 'అమ్మకాలు',   component: Sales,                icon: 'cart',        iconOff: 'cart-outline',        label: 'అమ్మకాలు' },
  { name: 'స్టాక్',     component: StockScreen,          icon: 'layers',      iconOff: 'layers-outline',      label: 'స్టాక్' },
  { name: 'నివేదిక',    component: AnalyticsScreen,      icon: 'stats-chart', iconOff: 'stats-chart-outline', label: 'నివేదిక' },
];

export default function AppNavigator({ navigation }) {
  const [gateOpen, setGateOpen] = useState(false);
  const [pin,      setPin]      = useState('');
  const [error,    setError]    = useState('');

  const openGate = () => {
    setPin('');
    setError('');
    setGateOpen(true);
  };

  const submitPin = async () => {
    const stored = (await AsyncStorage.getItem('pin_admin')) || DEFAULT_ADMIN;
    if (pin === stored) {
      Keyboard.dismiss();
      setGateOpen(false);
      setPin('');
      setError('');
      navigation.navigate('AdminPanel');
    } else {
      setError('తప్పు PIN · Wrong admin PIN');
      setPin('');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => {
          const tab = TABS.find((t) => t.name === route.name);
          return {
            headerShown: false,
            tabBarActiveTintColor:   '#1a472a',
            tabBarInactiveTintColor: '#9bb0a3',
            tabBarStyle: {
              backgroundColor: '#fff',
              borderTopColor:  '#e8f1ea',
              borderTopWidth:  1,
              paddingBottom:   8,
              paddingTop:      6,
              height:          66,
              elevation:       8,
              shadowColor:     '#1a472a',
              shadowOpacity:   0.06,
              shadowRadius:    8,
              shadowOffset:    { width: 0, height: -2 },
            },
            tabBarLabelStyle: {
              fontSize:   11,
              fontWeight: '700',
              marginTop:  0,
            },
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? tab?.icon : tab?.iconOff}
                size={size}
                color={color}
              />
            ),
          };
        }}
      >
        {TABS.map((tab) => (
          <Tab.Screen
            key={tab.name}
            name={tab.name}
            component={tab.component}
            options={{ tabBarLabel: tab.label }}
          />
        ))}
      </Tab.Navigator>

      {/* Admin entry is always available (it is PIN-gated below). In production
          it is rendered as a small, discreet gear so parents aren't tempted to
          tap it, but the owner can still reach Admin — otherwise, once a parent
          logs in, the panel would be permanently unreachable in PROD. */}
      <TouchableOpacity
        style={[styles.adminFab, APP_ENV === 'production' && styles.adminFabProd]}
        onPress={openGate}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={[styles.adminFabText, APP_ENV === 'production' && styles.adminFabTextProd]}>
          {APP_ENV === 'production' ? '⚙️' : '⚙️ Admin'}
        </Text>
      </TouchableOpacity>

      {/* Admin PIN gate — required before opening AdminPanel */}
      <Modal visible={gateOpen} transparent animationType="fade" onRequestClose={() => setGateOpen(false)}>
        <View style={styles.gateOverlay}>
          <View style={styles.gateBox}>
            <Text style={styles.gateTitle}>⚙️ Admin PIN</Text>
            <Text style={styles.gateSub}>అడ్మిన్ PIN నమోదు చేయండి</Text>

            <TextInput
              style={styles.gateInput}
              value={pin}
              onChangeText={(v) => { setPin(v.replace(/[^0-9]/g, '')); setError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              autoFocus
              placeholder="••••"
              placeholderTextColor="#bbb"
              textAlign="center"
              onSubmitEditing={submitPin}
            />

            {error ? <Text style={styles.gateError}>{error}</Text> : null}

            <View style={styles.gateBtns}>
              <TouchableOpacity style={styles.gateCancel} onPress={() => setGateOpen(false)}>
                <Text style={styles.gateCancelText}>రద్దు · Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.gateGo} onPress={submitPin}>
                <Text style={styles.gateGoText}>తెరువు · Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  adminFab: {
    position: 'absolute',
    bottom: 78,
    right: 16,
    zIndex: 999,
    backgroundColor: '#1a472a',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  adminFabText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Discreet variant for production: small, semi-transparent gear in the corner.
  adminFabProd: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 20,
    opacity: 0.35,
    backgroundColor: '#1a472a',
  },
  adminFabTextProd: { fontSize: 15 },

  gateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  gateBox:     { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 },
  gateTitle:   { fontSize: 20, fontWeight: '800', color: '#1a472a', textAlign: 'center' },
  gateSub:     { fontSize: 13, color: '#8a978d', textAlign: 'center', marginTop: 4, marginBottom: 18 },
  gateInput:   { borderWidth: 2, borderColor: '#2d6a4f', borderRadius: 14, height: 60, fontSize: 28, fontWeight: '700', letterSpacing: 8, color: '#1a472a' },
  gateError:   { color: '#e74c3c', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 10 },
  gateBtns:    { flexDirection: 'row', gap: 12, marginTop: 20 },
  gateCancel:     { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  gateCancelText: { fontSize: 14, fontWeight: '600', color: '#555' },
  gateGo:         { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2d6a4f', alignItems: 'center' },
  gateGoText:     { fontSize: 14, fontWeight: '800', color: '#fff' },
});
