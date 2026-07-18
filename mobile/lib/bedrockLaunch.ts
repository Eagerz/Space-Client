import { Linking, Platform } from 'react-native';
import { applyBedrockGraphicsForTier, type GraphicsApplyResult } from './bedrockGraphics';
import type { PhoneTier } from './storage';

const OPEN_URIS =
  Platform.OS === 'ios'
    ? ['minecraft://', 'https://apps.apple.com/app/minecraft/id479516143']
    : [
        'minecraft://',
        'market://details?id=com.mojang.minecraftpe',
        'https://play.google.com/store/apps/details?id=com.mojang.minecraftpe',
      ];

export type LaunchBedrockResult = {
  opened: boolean;
  graphics: GraphicsApplyResult;
  uri?: string;
  error?: string;
};

export async function openUrl(uri: string): Promise<boolean> {
  try {
    const can = await Linking.canOpenURL(uri);
    if (!can && !uri.startsWith('http') && !uri.startsWith('market')) {
      // canOpenURL is unreliable for custom schemes on some devices
    }
    await Linking.openURL(uri);
    return true;
  } catch {
    return false;
  }
}

export async function openMinecraftBedrock(): Promise<{ opened: boolean; uri?: string; error?: string }> {
  for (const uri of OPEN_URIS) {
    const ok = await openUrl(uri);
    if (ok) return { opened: true, uri };
  }
  return {
    opened: false,
    error: 'Could not open Minecraft Bedrock. Install it from the store, then try again.',
  };
}

/** Apply tier graphics, then open Bedrock (or a store page if missing). */
export async function launchBedrockWithGraphics(tier: PhoneTier): Promise<LaunchBedrockResult> {
  const graphics = await applyBedrockGraphicsForTier(tier);
  const open = await openMinecraftBedrock();
  return {
    opened: open.opened,
    graphics,
    uri: open.uri,
    error: open.error,
  };
}
