import * as SecureStore from 'expo-secure-store';

/** Same public Minecraft Launcher Azure client as desktop microsoft-auth.js */
const CLIENT_ID = '00000000402b5328';
const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const SCOPE = 'XboxLive.signin offline_access';

const SESSION_KEY = 'space-bedrock-ms-session';

export type MinecraftSession = {
  id: string;
  name: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
};

export type DeviceCodeStart = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
};

async function httpJson(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const err = new Error(
      data?.error_description || data?.error || data?.Message || `HTTP ${res.status}`
    ) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function startDeviceCode(): Promise<DeviceCodeStart> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPE,
  });
  return httpJson(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

export async function pollDeviceCode(deviceCode: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
} | null> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: CLIENT_ID,
    device_code: deviceCode,
  });
  try {
    return await httpJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err: any) {
    const code = err?.data?.error;
    if (code === 'authorization_pending' || code === 'slow_down') {
      return null;
    }
    throw err;
  }
}

async function xboxLiveAuthenticate(msAccessToken: string) {
  return httpJson('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }),
  });
}

async function xstsAuthorize(userToken: string) {
  return httpJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    }),
  });
}

async function minecraftLogin(identityToken: string) {
  return httpJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken }),
  });
}

async function fetchMinecraftProfile(mcAccessToken: string) {
  return httpJson('https://api.minecraftservices.com/minecraft/profile', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${mcAccessToken}`,
    },
  });
}

export async function completeMicrosoftLogin(ms: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): Promise<MinecraftSession> {
  const xbox = await xboxLiveAuthenticate(ms.access_token);
  if (!xbox?.Token) throw new Error('Xbox Live authentication failed.');

  let xsts;
  try {
    xsts = await xstsAuthorize(xbox.Token);
  } catch (err: any) {
    const xerr = err?.data?.XErr;
    if (xerr === 2148916233) {
      throw new Error('This Microsoft account needs an Xbox profile at xbox.com.');
    }
    if (xerr === 2148916238) {
      throw new Error('This Microsoft account needs adult verification for Xbox.');
    }
    throw new Error(err?.data?.Message || err?.message || 'Xbox XSTS authorization failed.');
  }

  const uhs = xsts?.DisplayClaims?.xui?.[0]?.uhs;
  if (!uhs || !xsts?.Token) throw new Error('Xbox XSTS authorization failed.');

  const identityToken = `XBL3.0 x=${uhs};${xsts.Token}`;
  const mcAuth = await minecraftLogin(identityToken);
  if (!mcAuth?.access_token) throw new Error('Minecraft authentication failed.');

  const profile = await fetchMinecraftProfile(mcAuth.access_token);
  if (!profile?.id || !profile?.name) {
    throw new Error('Minecraft profile response was incomplete.');
  }

  const expiresIn = Number(mcAuth.expires_in || ms.expires_in || 86400);
  return {
    id: profile.id,
    name: profile.name,
    access_token: mcAuth.access_token,
    refresh_token: ms.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
  };
}

/**
 * Poll until the user completes device login, then exchange for a Minecraft session.
 */
export async function waitForDeviceLogin(
  start: DeviceCodeStart,
  opts?: { signal?: AbortSignal; onTick?: (secondsLeft: number) => void }
): Promise<MinecraftSession> {
  const intervalMs = Math.max(3, Number(start.interval) || 5) * 1000;
  const deadline = Date.now() + Number(start.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) throw new Error('Sign-in cancelled.');
    opts?.onTick?.(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));

    const token = await pollDeviceCode(start.device_code);
    if (token?.access_token) {
      return completeMicrosoftLogin(token);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Device code expired. Start sign-in again.');
}

export async function loadSession(): Promise<MinecraftSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MinecraftSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: MinecraftSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function headUrl(uuid: string): string {
  const id = uuid.replace(/-/g, '');
  return `https://mc-heads.net/avatar/${id}/64`;
}
