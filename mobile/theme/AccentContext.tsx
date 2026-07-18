import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  accentDim,
  getAccentById,
  type AccentColor,
} from '@/constants/Accents';
import { loadAccentId, saveAccentId } from '@/lib/storage';

type AccentContextValue = {
  accent: AccentColor;
  accentDim: string;
  ready: boolean;
  setAccentId: (id: string) => Promise<void>;
};

const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accentId, setAccentIdState] = useState('cyan');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadAccentId();
      if (!cancelled) {
        setAccentIdState(loaded);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAccentId = useCallback(async (id: string) => {
    setAccentIdState(id);
    await saveAccentId(id);
  }, []);

  const accent = useMemo(() => getAccentById(accentId), [accentId]);

  const value = useMemo(
    () => ({
      accent,
      accentDim: accentDim(accent.value),
      ready,
      setAccentId,
    }),
    [accent, ready, setAccentId]
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent() {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within AccentProvider');
  return ctx;
}
