import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GraphicsChecklistModal } from '@/components/GraphicsChecklistModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { accentBorder } from '@/constants/Accents';
import { SpaceColors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { launchBedrockWithGraphics } from '@/lib/bedrockLaunch';
import { useAccent } from '@/theme/AccentContext';
import { usePhonePerf } from '@/theme/PhonePerfContext';

export default function HomeScreen() {
  const { tier } = usePhonePerf();
  const { accent, accentDim } = useAccent();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [checklistMsg, setChecklistMsg] = useState('');

  const onOpenBedrock = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const result = await launchBedrockWithGraphics(tier);
      if (result.graphics.method === 'checklist' || !result.graphics.applied) {
        setChecklist(result.graphics.checklist);
        setChecklistMsg(result.graphics.message);
        setChecklistOpen(true);
      } else {
        setStatus(result.graphics.message);
      }
      if (!result.opened && result.error) {
        setStatus(result.error);
      } else if (result.opened) {
        setStatus((prev) => prev || 'Opening Minecraft Bedrock…');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      title="Bedrock"
      subtitle="Open Minecraft Bedrock with graphics tuned for your phone. No mods, cosmetics, or Space+."
    >
      <View
        style={[
          styles.tierChip,
          { backgroundColor: accentDim, borderColor: accentBorder(accent.value) },
        ]}
      >
        <Text style={styles.tierLabel}>Phone tier</Text>
        <Text style={[styles.tierValue, { color: accent.value }]}>{tier.toUpperCase()}</Text>
      </View>

      <PrimaryButton label="Open Bedrock" loading={loading} onPress={onOpenBedrock} />
      <PrimaryButton
        label="Join Space Bridge"
        variant="ghost"
        onPress={() => router.push('/bridge')}
      />

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <Text style={styles.hint}>
        Change phone performance and accent colour in Settings.
      </Text>

      <GraphicsChecklistModal
        visible={checklistOpen}
        title="Recommended Video settings"
        message={checklistMsg}
        checklist={checklist}
        onClose={() => setChecklistOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  tierLabel: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 13,
  },
  tierValue: {
    fontFamily: Fonts.ten,
    fontSize: 13,
    letterSpacing: 1,
  },
  status: {
    fontFamily: Fonts.regular,
    color: SpaceColors.ok,
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
