import { apiGet } from './api';

export type BridgeResolveResult = {
  code: string;
  host: string;
  port: number;
  javaHost?: string;
  javaPort?: number;
  lanHost?: string;
  hostName?: string;
  expiresAt?: number;
};

export function normalizeBridgeCode(input: string): string | null {
  const raw = String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!raw) return null;
  const body = raw.startsWith('SP-') ? raw.slice(3) : raw;
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(body)) return null;
  return `SP-${body}`;
}

export async function resolveBridgeCode(codeInput: string): Promise<BridgeResolveResult> {
  const code = normalizeBridgeCode(codeInput);
  if (!code) throw new Error('Enter a valid Space Bridge code (SP-XXXXXX).');
  return apiGet<BridgeResolveResult>(`/bridge/resolve/${encodeURIComponent(code)}`);
}

/** Same deep-link shape as space-bridge/bedrock.js buildMinecraftUri */
export function buildAddServerUri(host: string, port: number, name = 'Space Bridge'): string {
  const safeName = encodeURIComponent(String(name).slice(0, 32));
  const safeHost = encodeURIComponent(host);
  return `minecraft://?addExternalServer=${safeName}|${safeHost}:${port}`;
}
