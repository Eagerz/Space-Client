import { Platform } from 'react-native';
import type { PhoneTier } from './storage';

export type BedrockOptionPatch = Record<string, string>;

export type GraphicsApplyResult = {
  applied: boolean;
  method: 'options.txt' | 'checklist' | 'skipped';
  checklist: string[];
  message: string;
  pathTried?: string;
};

const ANDROID_OPTIONS_CANDIDATES = [
  'file:///storage/emulated/0/games/com.mojang/minecraftpe/options.txt',
  'file:///sdcard/games/com.mojang/minecraftpe/options.txt',
];

/** Tier → Bedrock options.txt keys (best-effort; keys vary slightly by version). */
export function optionsForTier(tier: PhoneTier): BedrockOptionPatch {
  if (tier === 'low') {
    return {
      gfx_viewdistance: '6',
      gfx_fancygraphics: '0',
      gfx_transparentleaves: '0',
      gfx_beautifulskies: '0',
      gfx_smoothlighting: '0',
      gfx_max_framerate: '60',
      msaa: '0',
      texel_aa: '0',
    };
  }
  if (tier === 'high') {
    return {
      gfx_viewdistance: '16',
      gfx_fancygraphics: '1',
      gfx_transparentleaves: '1',
      gfx_beautifulskies: '1',
      gfx_smoothlighting: '1',
    };
  }
  return {
    gfx_viewdistance: '10',
    gfx_fancygraphics: '1',
    gfx_transparentleaves: '0',
    gfx_beautifulskies: '1',
    gfx_smoothlighting: '0',
    msaa: '0',
  };
}

export function checklistForTier(tier: PhoneTier): string[] {
  if (tier === 'low') {
    return [
      'Video → Render Distance: lowest comfortable (≈6–8 chunks)',
      'Fancy Graphics: Off',
      'Fancy Leaves: Off',
      'Beautiful Skies: Off',
      'Smooth Lighting: Off',
      'Particles: Minimal',
    ];
  }
  if (tier === 'high') {
    return [
      'Video → Render Distance: higher if your phone stays cool',
      'Fancy Graphics: On',
      'Beautiful Skies: On',
      'Smooth Lighting: On',
    ];
  }
  return [
    'Video → Render Distance: medium (≈10 chunks)',
    'Fancy Graphics: On',
    'Fancy Leaves: Off',
    'Smooth Lighting: Off (helps FPS)',
  ];
}

function mergeOptionsTxt(existing: string, patch: BedrockOptionPatch): string {
  const map = new Map<string, string>();
  for (const line of existing.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    map.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
  }
  for (const [k, v] of Object.entries(patch)) {
    map.set(k, v);
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}:${v}`)
    .join('\n');
}

async function tryPatchAndroidOptions(patch: BedrockOptionPatch): Promise<{
  ok: boolean;
  path?: string;
  error?: string;
}> {
  if (Platform.OS !== 'android') {
    return { ok: false, error: 'Not Android' };
  }

  let FileSystem: typeof import('expo-file-system/legacy');
  try {
    FileSystem = await import('expo-file-system/legacy');
  } catch {
    return { ok: false, error: 'expo-file-system unavailable' };
  }

  for (const uri of ANDROID_OPTIONS_CANDIDATES) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) continue;
      const current = await FileSystem.readAsStringAsync(uri);
      const next = mergeOptionsTxt(current, patch);
      await FileSystem.writeAsStringAsync(uri, next);
      return { ok: true, path: uri };
    } catch (err) {
      return {
        ok: false,
        path: uri,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { ok: false, error: 'options.txt not found (open Minecraft once, then retry)' };
}

/**
 * Apply graphics for the selected phone tier.
 * Android: best-effort options.txt write. iOS / failure: checklist only.
 */
export async function applyBedrockGraphicsForTier(
  tier: PhoneTier
): Promise<GraphicsApplyResult> {
  const checklist = checklistForTier(tier);

  if (tier === 'high' && Platform.OS === 'ios') {
    return {
      applied: false,
      method: 'checklist',
      checklist,
      message: 'On iOS, set Video options in Minecraft manually (sandbox blocks writes).',
    };
  }

  if (Platform.OS === 'android') {
    const patch = optionsForTier(tier);
    const result = await tryPatchAndroidOptions(patch);
    if (result.ok) {
      return {
        applied: true,
        method: 'options.txt',
        checklist,
        message: 'Applied Bedrock graphics tweaks for your phone tier.',
        pathTried: result.path,
      };
    }
    return {
      applied: false,
      method: 'checklist',
      checklist,
      message:
        result.error ||
        'Could not write Minecraft options. Apply these in Minecraft → Settings → Video.',
      pathTried: result.path,
    };
  }

  return {
    applied: false,
    method: 'checklist',
    checklist,
    message: 'Apply these Video settings in Minecraft for a smoother session.',
  };
}
