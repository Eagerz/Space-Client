import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { loadPhoneTier, savePhoneTier, type PhoneTier } from '@/lib/storage';

export type UiPerfProfile = {
  animatedBackground: boolean;
  blur: boolean;
  reducedMotion: boolean;
  panelOpacity: number;
};

export function profileForTier(tier: PhoneTier): UiPerfProfile {
  if (tier === 'low') {
    return {
      animatedBackground: false,
      blur: false,
      reducedMotion: true,
      panelOpacity: 1,
    };
  }
  if (tier === 'high') {
    return {
      animatedBackground: true,
      blur: true,
      reducedMotion: false,
      panelOpacity: 0.72,
    };
  }
  // mid
  return {
    animatedBackground: true,
    blur: true,
    reducedMotion: false,
    panelOpacity: 0.82,
  };
}

type PhonePerfContextValue = {
  tier: PhoneTier;
  profile: UiPerfProfile;
  ready: boolean;
  setTier: (tier: PhoneTier) => Promise<void>;
};

const PhonePerfContext = createContext<PhonePerfContextValue | null>(null);

export function PhonePerfProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTierState] = useState<PhoneTier>('mid');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadPhoneTier();
      if (!cancelled) {
        setTierState(loaded);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTier = useCallback(async (next: PhoneTier) => {
    setTierState(next);
    await savePhoneTier(next);
  }, []);

  const value = useMemo(
    () => ({
      tier,
      profile: profileForTier(tier),
      ready,
      setTier,
    }),
    [tier, ready, setTier]
  );

  return <PhonePerfContext.Provider value={value}>{children}</PhonePerfContext.Provider>;
}

export function usePhonePerf() {
  const ctx = useContext(PhonePerfContext);
  if (!ctx) throw new Error('usePhonePerf must be used within PhonePerfProvider');
  return ctx;
}
