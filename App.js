import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';

import PinLogin    from './src/screens/PinLogin';
import AppNavigator from './src/navigation/AppNavigator';
import AdminPanel  from './src/screens/admin/AdminPanel';
import { SyncQueue } from './src/services/SyncQueue';
import { LocalDB }   from './src/services/LocalDB';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './src/firebase/config';

const Stack = createNativeStackNavigator();
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

const ENV_BANNER = {
  development: { text: '🔧 DEV', bg: '#c62828' },
  staging:     { text: '🧪 BETA - Parents Testing', bg: '#e65100' },
  production:  null,
};

function EnvBanner() {
  const banner = ENV_BANNER[APP_ENV];
  if (!banner) return null;
  return (
    <View style={[styles.banner, { backgroundColor: banner.bg }]}>
      <Text style={styles.bannerText}>{banner.text}</Text>
    </View>
  );
}

// Preload vendors + vegetables into LocalDB cache
async function preloadCache() {
  try {
    const [vSnap, vegSnap] = await Promise.all([
      getDocs(collection(db, 'vendors')),
      getDocs(collection(db, 'vegetables')),
    ]);
    const vendors = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const vegs    = vegSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.active !== false);
    await LocalDB.set('cache_vendors',    vendors);
    await LocalDB.set('cache_vegetables', vegs);
  } catch { /* offline — cache stays as-is */ }
}

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const appState  = useRef(AppState.currentState);
  const syncTimer = useRef(null);

  useEffect(() => {
    SecureStore.getItemAsync('authenticated')
      .then((val) => setInitialRoute(val === 'true' ? 'Home' : 'Login'))
      .catch(() => setInitialRoute('Login'));
  }, []);

  // SyncQueue: run on foreground + every 30s
  useEffect(() => {
    const onStateChange = (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        SyncQueue.process();
      }
      appState.current = nextState;
    };
    const sub = AppState.addEventListener('change', onStateChange);
    syncTimer.current = setInterval(() => SyncQueue.process(), 30_000);
    return () => {
      sub.remove();
      clearInterval(syncTimer.current);
    };
  }, []);

  // Preload cache once on first render
  useEffect(() => {
    if (initialRoute !== null) preloadCache();
  }, [initialRoute]);

  if (initialRoute === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#74c69d" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <EnvBanner />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false, animation: 'fade' }}
        >
          <Stack.Screen name="Login"      component={PinLogin} />
          <Stack.Screen name="Home"       component={AppNavigator} />
          <Stack.Screen name="AdminPanel" component={AdminPanel} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  splash:     { flex: 1, backgroundColor: '#1a472a', alignItems: 'center', justifyContent: 'center' },
  banner:     { paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  bannerText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
});
