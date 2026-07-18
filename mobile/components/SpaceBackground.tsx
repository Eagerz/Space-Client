import { Asset } from 'expo-asset';
import { BlurView } from 'expo-blur';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SpaceColors } from '@/constants/Colors';
import { useAccent } from '@/theme/AccentContext';
import { usePhonePerf } from '@/theme/PhonePerfContext';

const TRAILER_MODULES = [
  require('../assets/video/trailers/01-village-pillage.mp4'),
  require('../assets/video/trailers/02-nether-update.mp4'),
  require('../assets/video/trailers/03-caves-cliffs.mp4'),
];

type Star = { left: number; top: number; size: number; opacity: number };

function makeStars(count: number): Star[] {
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      left: (i * 47) % 100,
      top: (i * 73) % 100,
      size: 1 + (i % 3),
      opacity: 0.2 + ((i * 17) % 40) / 100,
    });
  }
  return out;
}

function webBlurStyle(px: number): StyleProp<ViewStyle> {
  if (Platform.OS !== 'web') return null;
  return { filter: `blur(${px}px)` } as ViewStyle;
}

function WebTrailerVideo({
  uri,
  shouldPlay,
  blurPx,
  onEnded,
}: {
  uri: string;
  shouldPlay: boolean;
  blurPx: number;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !uri) return;
    if (shouldPlay) {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      el.pause();
    }
  }, [shouldPlay, uri]);

  if (!uri) return null;

  return createElement('video', {
    ref,
    key: uri,
    src: uri,
    muted: true,
    autoPlay: shouldPlay,
    playsInline: true,
    onEnded,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'scale(1.12)',
      filter: `blur(${blurPx}px)`,
    },
  });
}

export function SpaceBackground({ children }: { children: React.ReactNode }) {
  const { profile, tier } = usePhonePerf();
  const { accent, accentDim } = useAccent();
  const pulse = useRef(new Animated.Value(0.35)).current;
  const [trailerIndex, setTrailerIndex] = useState(0);
  const [uris, setUris] = useState<string[]>([]);
  const stars = useMemo(() => makeStars(tier === 'low' ? 10 : 22), [tier]);
  const playTrailers = !profile.reducedMotion;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const assets = TRAILER_MODULES.map((mod) => Asset.fromModule(mod));
      await Asset.loadAsync(TRAILER_MODULES);
      if (cancelled) return;
      setUris(assets.map((a) => a.localUri || a.uri || '').filter(Boolean));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profile.animatedBackground) {
      pulse.setValue(0.3);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 3600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 3600,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [profile.animatedBackground, pulse]);

  const advanceTrailer = useCallback(() => {
    setTrailerIndex((i) => (i + 1) % Math.max(uris.length, 1));
  }, [uris.length]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) advanceTrailer();
    },
    [advanceTrailer]
  );

  const blurAmount = tier === 'low' ? 16 : tier === 'high' ? 8 : 12;
  const veilOpacity = tier === 'low' ? 0.62 : tier === 'high' ? 0.42 : 0.5;
  const currentUri = uris[trailerIndex] || uris[0] || '';

  return (
    <View style={styles.root}>
      <View style={[styles.base, { backgroundColor: SpaceColors.bg }]} />

      <View pointerEvents="none" style={styles.trailerLayer}>
        {Platform.OS === 'web' ? (
          <WebTrailerVideo
            uri={currentUri}
            shouldPlay={playTrailers && Boolean(currentUri)}
            blurPx={blurAmount}
            onEnded={advanceTrailer}
          />
        ) : (
          <>
            <Video
              key={trailerIndex}
              source={TRAILER_MODULES[trailerIndex]}
              style={[styles.trailer, { transform: [{ scale: 1.1 }] }, webBlurStyle(blurAmount)]}
              resizeMode={ResizeMode.COVER}
              isMuted
              shouldPlay={playTrailers}
              isLooping={false}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            />
            <BlurView intensity={blurAmount * 4} tint="dark" style={StyleSheet.absoluteFill} />
          </>
        )}
        <View style={[styles.veil, { opacity: veilOpacity }]} />
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            opacity: pulse,
            backgroundColor: accentDim,
          },
        ]}
      />

      {stars.map((s, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.star,
            {
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              opacity: s.opacity,
              backgroundColor: accent.value,
            },
          ]}
        />
      ))}

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SpaceColors.bg, overflow: 'hidden' },
  base: { ...StyleSheet.absoluteFill },
  trailerLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  trailer: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#050508',
  },
  glow: {
    position: 'absolute',
    width: '140%',
    height: '55%',
    top: '-12%',
    left: '-20%',
    borderRadius: 999,
  },
  star: {
    position: 'absolute',
    borderRadius: 99,
  },
  content: { flex: 1 },
});
