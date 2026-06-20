import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';

import PinLogin    from './src/screens/PinLogin';
import AppNavigator from './src/navigation/AppNavigator';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null); // null = still checking

  useEffect(() => {
    SecureStore.getItemAsync('authenticated')
      .then((val) => setInitialRoute(val === 'true' ? 'Home' : 'Login'))
      .catch(() => setInitialRoute('Login'));
  }, []);

  // Splash: show green screen while SecureStore is checked
  if (initialRoute === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#74c69d" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        {/* PinLogin calls navigation.replace('Home') on success */}
        <Stack.Screen name="Login" component={PinLogin} />
        <Stack.Screen name="Home"  component={AppNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
