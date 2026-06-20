import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import MorningPrices from '../screens/MorningPrices';
import Sales         from '../screens/Sales';
import VendorOrder   from '../screens/VendorOrder';
import TodaySummary  from '../screens/TodaySummary';

const Tab = createBottomTabNavigator();

const TABS = [
  {
    name:      'ధరలు',
    component: MorningPrices,
    icon:      'sunny',
    iconOff:   'sunny-outline',
    label:     'ధరలు',
  },
  {
    name:      'అమ్మకాలు',
    component: Sales,
    icon:      'cart',
    iconOff:   'cart-outline',
    label:     'అమ్మకాలు',
  },
  {
    name:      'సరుకు',
    component: VendorOrder,
    icon:      'cube',
    iconOff:   'cube-outline',
    label:     'సరుకు',
  },
  {
    name:      'సారాంశం',
    component: TodaySummary,
    icon:      'stats-chart',
    iconOff:   'stats-chart-outline',
    label:     'సారాంశం',
  },
];

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const tab = TABS.find((t) => t.name === route.name);
        return {
          headerShown: false,
          tabBarActiveTintColor:   '#2d6a4f',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            backgroundColor:   '#fff',
            borderTopColor:    '#e0f0e8',
            borderTopWidth:    1,
            paddingBottom:     6,
            paddingTop:        4,
            height:            62,
          },
          tabBarLabelStyle: {
            fontSize:   12,
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
  );
}
