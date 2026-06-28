import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import SyncIndicator from './SyncIndicator';
import { Voice } from '../services/Speak';
import { colors, spacing, radius, font, teluguDay, friendlyDate } from '../theme';

// One-tap voice mute, available on every screen header.
function VoiceToggle() {
  const [muted, setMuted] = useState(Voice.isMuted());
  const toggle = () => {
    const next = !muted;
    Voice.setMuted(next);
    setMuted(next);
    if (!next) Voice.speak('వాయిస్ ఆన్'); // confirm aloud when turning ON
  };
  return (
    <TouchableOpacity onPress={toggle} style={styles.voiceBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={styles.voiceIcon}>{muted ? '🔇' : '🔊'}</Text>
    </TouchableOpacity>
  );
}

// Unified header used by every screen.
//   title    — big Telugu title (required)
//   subtitle — small English line under it
//   showDate — show the white day/date pill (for date-sensitive screens)
//   right    — optional extra control rendered before the sync dot
export default function AppHeader({ title, subtitle, showDate = false, right = null }) {
  return (
    <View style={styles.header}>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      {showDate && (
        <View style={styles.datePill}>
          <Text style={styles.datePillDay}>{teluguDay()}</Text>
          <Text style={styles.datePillDate}>{friendlyDate()}</Text>
        </View>
      )}

      {right}
      <VoiceToggle />
      <SyncIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.headerBg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleWrap: { flex: 1, flexShrink: 1, minWidth: 64 },
  title: { fontSize: font.h2, fontWeight: '800', color: colors.onDark, letterSpacing: 0.3 },
  sub:   { fontSize: font.tiny, color: colors.subOnDark, marginTop: 2, fontWeight: '600', letterSpacing: 0.3 },

  voiceBtn:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  voiceIcon:    { fontSize: 18 },

  datePill:     { backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 7, alignItems: 'center', minWidth: 92 },
  datePillDay:  { fontSize: font.tiny, color: colors.primary, fontWeight: '700' },
  datePillDate: { fontSize: 14, color: colors.text, fontWeight: '800', marginTop: 1 },
});
