import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import OrdersScreen       from '../screens/OrdersScreen';
import SellingPricesScreen from '../screens/SellingPricesScreen';
import Sales              from '../screens/Sales';
import StockScreen        from '../screens/StockScreen';
import AnalyticsScreen    from '../screens/AnalyticsScreen';

const Tab = createBottomTabNavigator();
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

const TABS = [
  { name: 'ఆర్డర్లు',   component: OrdersScreen,        icon: 'cube',        iconOff: 'cube-outline',        label: 'ఆర్డర్లు' },
  { name: 'ధరలు',       component: SellingPricesScreen,  icon: 'pricetag',    iconOff: 'pricetag-outline',    label: 'ధరలు' },
  { name: 'అమ్మకాలు',   component: Sales,                icon: 'cart',        iconOff: 'cart-outline',        label: 'అమ్మకాలు' },
  { name: 'స్టాక్',     component: StockScreen,          icon: 'layers',      iconOff: 'layers-outline',      label: 'స్టాక్' },
  { name: 'నివేదిక',    component: AnalyticsScreen,      icon: 'stats-chart', iconOff: 'stats-chart-outline', label: 'నివేదిక' },
];

export default function AppNavigator({ navigation }) {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => {
          const tab = TABS.find((t) => t.name === route.name);
          return {
            headerShown: false,
            tabBarActiveTintColor:   '#2d6a4f',
            tabBarInactiveTintColor: '#999',
            tabBarStyle: {
              backgroundColor: '#fff',
              borderTopColor:  '#e0f0e8',
              borderTopWidth:  1,
              paddingBottom:   6,
              paddingTop:      4,
              height:          62,
            },
            tabBarLabelStyle: {
              fontSize:   11,
              fontWeight: '600',
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

      {APP_ENV !== 'production' && (
        <TouchableOpacity
          style={styles.adminFab}
          onPress={() => navigation.navigate('AdminPanel')}
          activeOpacity={0.8}
        >
          <Text style={styles.adminFabText}>⚙️ Admin</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  adminFab: {
    position: 'absolute',
    bottom: 70,
    right: 16,
    zIndex: 999,
    backgroundColor: '#555',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  adminFabText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
