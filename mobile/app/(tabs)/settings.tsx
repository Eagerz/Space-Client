import React, { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ACCENT_COLORS } from '@/constants/Accents';
import { SpaceColors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { getApiBase } from '@/lib/api';
import {
  checkForApkUpdate,
  getLocalVersionCode,
  isApkUpdaterAvailable,
  startApkUpdate,
  type AndroidArm64Manifest,
} from '@/lib/apkUpdater';
import { checklistForTier } from '@/lib/bedrockGraphics';
import type { PhoneTier } from '@/lib/storage';
import { useAccent } from '@/theme/AccentContext';
import { usePhonePerf } from '@/theme/PhonePerfContext';

const TIERS: { id: PhoneTier; title: string; desc: string }[] = [
  {
    id: 'low',
    title: 'Low',
    desc: 'Weak phone — trailers paused, heavier veil, aggressive Bedrock cuts.',
  },
  {
    id: 'mid',
    title: 'Mid',
    desc: 'Balanced — blurred trailers, medium render distance.',
  },
  {
    id: 'high',
    title: 'High',
    desc: 'Strong phone — lighter blur, fuller motion, prefer quality in-game.',
  },
];

export default function SettingsScreen() {
  const { tier, setTier, profile } = usePhonePerf();
  const { accent, accentDim, setAccentId } = useAccent();
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [pendingRemote, setPendingRemote] = useState<AndroidArm64Manifest | null>(null);

  const openMinecraftStore = () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/minecraft/id479516143'
        : 'https://play.google.com/store/apps/details?id=com.mojang.minecraftpe';
    Linking.openURL(url);
  };

  const onCheckUpdate = useCallback(async () => {
    setUpdateBusy(true);
    setPendingRemote(null);
    setUpdateStatus('Checking…');
    try {
      const result = await checkForApkUpdate();
      if (result.status === 'unsupported') {
        setUpdateStatus(
          Platform.OS === 'android'
            ? 'Updates need a sideloaded native build (not Expo Go).'
            : 'In-app APK updates are Android-only.'
        );
      } else if (result.status === 'up-to-date') {
        setUpdateStatus(`You're on the latest build (versionCode ${result.localVersionCode}).`);
      } else if (result.status === 'available') {
        setPendingRemote(result.remote);
        setUpdateStatus(
          `Update available: ${result.remote.version} (code ${result.remote.versionCode}). Local: ${result.localVersionCode}.`
        );
      } else {
        setUpdateStatus(result.message);
      }
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const onInstallUpdate = useCallback(async () => {
    if (!pendingRemote) return;
    setUpdateBusy(true);
    setUpdateStatus('Downloading update… Android will ask to install when ready.');
    try {
      await startApkUpdate(pendingRemote);
      setUpdateStatus('Installer opened. Confirm the system prompt to finish.');
    } catch (err) {
      setUpdateStatus(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setUpdateBusy(false);
    }
  }, [pendingRemote]);

  return (
    <Screen
      title="Settings"
      subtitle="Phone power, accent colour, and Bedrock Video tips."
    >
      <Text style={styles.section}>Accent colour</Text>
      <View style={styles.swatchGrid}>
        {ACCENT_COLORS.map((color) => {
          const active = accent.id === color.id;
          return (
            <Pressable
              key={color.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={color.label}
              onPress={() => setAccentId(color.id)}
              style={[
                styles.swatch,
                { backgroundColor: color.value },
                active && { borderColor: '#fff', borderWidth: 2 },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.meta}>Selected: {accent.label}</Text>

      <Text style={styles.section}>Phone performance</Text>
      {TIERS.map((t) => {
        const active = tier === t.id;
        return (
          <Pressable
            key={t.id}
            onPress={() => setTier(t.id)}
            style={[
              styles.tierCard,
              active && { borderColor: accent.value, backgroundColor: accentDim },
            ]}
          >
            <Text style={[styles.tierTitle, active && { color: accent.value }]}>{t.title}</Text>
            <Text style={styles.tierDesc}>{t.desc}</Text>
          </Pressable>
        );
      })}

      <Text style={styles.section}>Launcher profile</Text>
      <Text style={styles.meta}>
        Trailers: {profile.reducedMotion ? 'Paused' : 'Playing'} · Blur:{' '}
        {profile.blur ? 'On' : 'Off'} · Motion: {profile.animatedBackground ? 'On' : 'Off'}
      </Text>

      <Text style={styles.section}>Bedrock Video checklist ({tier})</Text>
      {checklistForTier(tier).map((line) => (
        <Text key={line} style={styles.checklist}>
          • {line}
        </Text>
      ))}

      <PrimaryButton label="Open Minecraft store page" variant="ghost" onPress={openMinecraftStore} />

      {Platform.OS === 'android' ? (
        <View style={styles.updateBlock}>
          <Text style={styles.section}>App updates</Text>
          <Text style={styles.meta}>
            Sideload builds check a cloud manifest and install via Android's package installer
            (versionCode {getLocalVersionCode()}
            {isApkUpdaterAvailable() ? '' : ' · native module unavailable in Expo Go'}).
          </Text>
          <PrimaryButton
            label={updateBusy ? 'Please wait…' : 'Check for update'}
            variant="ghost"
            onPress={onCheckUpdate}
            disabled={updateBusy}
            loading={updateBusy && !pendingRemote}
          />
          {pendingRemote ? (
            <PrimaryButton
              label={`Download & install ${pendingRemote.version}`}
              onPress={onInstallUpdate}
              disabled={updateBusy}
              loading={updateBusy}
            />
          ) : null}
          {updateStatus ? <Text style={styles.meta}>{updateStatus}</Text> : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.meta}>API: {getApiBase()}</Text>
        <Text style={styles.meta}>
          iOS cannot write Minecraft settings files — use the checklist after Open Bedrock.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    fontFamily: Fonts.ten,
    color: SpaceColors.text,
    fontSize: 14,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tierCard: {
    borderWidth: 1,
    borderColor: SpaceColors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: 4,
  },
  tierTitle: {
    fontFamily: Fonts.ten,
    color: SpaceColors.text,
    fontSize: 16,
  },
  tierDesc: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  meta: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  checklist: {
    fontFamily: Fonts.regular,
    color: SpaceColors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  updateBlock: { gap: 10, marginTop: 8 },
  footer: { gap: 6, marginTop: 4 },
});
