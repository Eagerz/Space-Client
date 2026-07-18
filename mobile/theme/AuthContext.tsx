import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clearSession,
  loadSession,
  saveSession,
  type MinecraftSession,
} from '@/lib/auth';

type AuthContextValue = {
  session: MinecraftSession | null;
  ready: boolean;
  setSession: (session: MinecraftSession | null) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<MinecraftSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadSession();
      if (!cancelled) {
        setSessionState(loaded);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback(async (next: MinecraftSession | null) => {
    setSessionState(next);
    if (next) await saveSession(next);
    else await clearSession();
  }, []);

  const signOut = useCallback(async () => {
    await setSession(null);
  }, [setSession]);

  const value = useMemo(
    () => ({ session, ready, setSession, signOut }),
    [session, ready, setSession, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
