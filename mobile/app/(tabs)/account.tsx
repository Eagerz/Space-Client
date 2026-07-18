import * as WebBrowser from 'expo-web-browser';
import React, { useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SpaceColors } from '@/constants/Colors';
import {
  headUrl,
  startDeviceCode,
  waitForDeviceLogin,
  type DeviceCodeStart,
} from '@/lib/auth';
import { useAuth } from '@/theme/AuthContext';

export default function AccountScreen() {
  const { session, setSession, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<DeviceCodeStart | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onSignIn = async () => {
    setLoading(true);
    setError(null);
    setDevice(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const start = await startDeviceCode();
      setDevice(start);
      if (start.verification_uri) {
        await WebBrowser.openBrowserAsync(start.verification_uri);
      }
      const next = await waitForDeviceLogin(start, {
        signal: ac.signal,
        onTick: setSecondsLeft,
      });
      await setSession(next);
      setDevice(null);
      setSecondsLeft(null);
    } catch (err) {
      if (!ac.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const onCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
    setDevice(null);
    setSecondsLeft(null);
  };

  return (
    <Screen
      title="Account"
      subtitle="Sign in with Microsoft to show your Minecraft profile. No Space+ on mobile."
    >
      {session ? (
        <View style={styles.profile}>
          <Image source={{ uri: headUrl(session.id) }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{session.name}</Text>
            <Text style={styles.meta}>Microsoft · Bedrock companion</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.guest}>Not signed in</Text>
      )}

      {device ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Enter this code at Microsoft</Text>
          <Text style={styles.code}>{device.user_code}</Text>
          {secondsLeft != null ? (
            <Text style={styles.meta}>Waiting… {secondsLeft}s left</Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {session ? (
        <PrimaryButton label="Sign out" variant="danger" onPress={signOut} />
      ) : loading ? (
        <PrimaryButton label="Cancel sign-in" variant="ghost" onPress={onCancel} />
      ) : (
        <PrimaryButton label="Sign in with Microsoft" loading={loading} onPress={onSignIn} />
      )}

      {loading && !device ? <Text style={styles.meta}>Starting device login…</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#111',
  },
  name: { color: SpaceColors.text, fontSize: 20, fontWeight: '800' },
  meta: { color: SpaceColors.textMuted, fontSize: 13, marginTop: 2 },
  guest: { color: SpaceColors.textMuted, fontSize: 15 },
  codeBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    backgroundColor: SpaceColors.accentDim,
    gap: 6,
  },
  codeLabel: { color: SpaceColors.textMuted, fontSize: 12, fontWeight: '600' },
  code: {
    color: SpaceColors.accent,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },
  error: { color: SpaceColors.danger, fontSize: 13, lineHeight: 18 },
});
