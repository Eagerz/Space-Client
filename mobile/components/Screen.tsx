import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpaceColors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { SpaceBackground } from '@/components/SpaceBackground';
import { useAccent } from '@/theme/AccentContext';
import { usePhonePerf } from '@/theme/PhonePerfContext';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function Screen({ title, subtitle, children }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = usePhonePerf();
  const { accent } = useAccent();

  return (
    <SpaceBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.brand, { color: accent.value }]}>SPACE</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View
          style={[
            styles.panel,
            {
              backgroundColor: profile.blur
                ? `rgba(11, 18, 32, ${profile.panelOpacity})`
                : SpaceColors.bgPanelSolid,
              borderColor: SpaceColors.border,
            },
          ]}
        >
          {children}
        </View>
      </ScrollView>
    </SpaceBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },
  brand: {
    fontFamily: Fonts.ten,
    fontSize: 14,
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontFamily: Fonts.ten,
    color: SpaceColors.text,
    fontSize: 34,
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 360,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
});
