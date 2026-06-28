import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { vegImageSource } from '../assets/vegImages';

// One vegetable visual, used everywhere a veg appears. Resolution order:
//   1. bundled local photo (assets/veg, via vegImages.js)
//   2. veg.photo_url (Cloudinary, set in Admin)
//   3. emoji (last resort)
// This is the single source of truth for "what a vegetable looks like" so the
// duplicate-emoji problem disappears as real photos are added.
export default function VegImage({ veg, size = 48, rounded = true, style }) {
  const local  = vegImageSource(veg?.name_en);
  const uri    = veg?.photo_url;
  const radius = rounded ? Math.round(size / 2) : Math.round(size * 0.18);
  const box    = { width: size, height: size, borderRadius: radius };

  if (local) {
    return <Image source={local} style={[box, style]} resizeMode="cover" />;
  }
  if (uri) {
    return <Image source={{ uri }} style={[box, style]} resizeMode="cover" />;
  }
  return (
    <View style={[box, styles.fallback, style]}>
      <Text style={{ fontSize: Math.round(size * 0.55) }}>{veg?.emoji || '🥬'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#e8f5ec', alignItems: 'center', justifyContent: 'center' },
});
