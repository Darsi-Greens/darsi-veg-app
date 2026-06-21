import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';

import PinLogin     from './src/screens/PinLogin';
import AppNavigator from './src/navigation/AppNavigator';

const Stack = createNativeStackNavigator();

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

const ENV_BANNER = {
  development: { text: '🔧 DEV MODE', bg: '#e65100' },
  staging:     { text: '🧪 QA - Ghost Testing', bg: '#f57f17' },
  production:  null, // no banner — clean UI for parents
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

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    SecureStore.getItemAsync('authenticated')
      .then((val) => setInitialRoute(val === 'true' ? 'Home' : 'Login'))
      .catch(() => setInitialRoute('Login'));
  }, []);

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
          <Stack.Screen name="Login" component={PinLogin} />
          <Stack.Screen name="Home"  component={AppNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
