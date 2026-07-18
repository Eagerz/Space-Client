import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { GraphicsChecklistModal } from '@/components/GraphicsChecklistModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SpaceColors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { applyBedrockGraphicsForTier } from '@/lib/bedrockGraphics';
import { openUrl } from '@/lib/bedrockLaunch';
import { buildAddServerUri, resolveBridgeCode } from '@/lib/bridge';
import { usePhonePerf } from '@/theme/PhonePerfContext';

export default function BridgeScreen() {
  const { tier } = usePhonePerf();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [checklistMsg, setChecklistMsg] = useState('');

  const onJoin = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const graphics = await applyBedrockGraphicsForTier(tier);
      if (graphics.method === 'checklist' || !graphics.applied) {
        setChecklist(graphics.checklist);
        setChecklistMsg(graphics.message);
        setChecklistOpen(true);
      }

      const resolved = await resolveBridgeCode(code);
      const host = resolved.host;
      const port = Number(resolved.port);
      if (!host || !Number.isFinite(port)) {
        throw new Error('Bridge response was missing host or port.');
      }
      const uri = buildAddServerUri(host, port, resolved.hostName || 'Space Bridge');
      const opened = await openUrl(uri);
      if (!opened) {
        throw new Error('Could not open Minecraft with the Bridge server link.');
      }
      setStatus(`Added ${host}:${port}. Open Servers in Bedrock if it does not appear.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      title="Space Bridge"
      subtitle="Enter a host code to add the session to Minecraft Bedrock."
    >
      <Text style={styles.label}>Bridge code</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="SP-XXXXXX"
        placeholderTextColor={SpaceColors.textMuted}
        style={styles.input}
      />

      <PrimaryButton label="Connect on Bedrock" loading={loading} onPress={onJoin} />

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Hosting is desktop-only for now. This app joins existing Bridge sessions.
        </Text>
      </View>

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
  label: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: SpaceColors.border,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: SpaceColors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    fontFamily: Fonts.ten,
    letterSpacing: 2,
  },
  status: {
    fontFamily: Fonts.regular,
    color: SpaceColors.ok,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    fontFamily: Fonts.regular,
    color: SpaceColors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  noteText: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
