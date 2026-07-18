import AsyncStorage from '@react-native-async-storage/async-storage';

const PHONE_TIER_KEY = 'space-bedrock-phone-tier';
const ACCENT_KEY = 'space-bedrock-accent';

export type PhoneTier = 'low' | 'mid' | 'high';

export async function loadPhoneTier(): Promise<PhoneTier> {
  try {
    const raw = await AsyncStorage.getItem(PHONE_TIER_KEY);
    if (raw === 'low' || raw === 'mid' || raw === 'high') return raw;
  } catch {
    /* ignore */
  }
  return 'mid';
}

export async function savePhoneTier(tier: PhoneTier): Promise<void> {
  await AsyncStorage.setItem(PHONE_TIER_KEY, tier);
}

export async function loadAccentId(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(ACCENT_KEY);
    if (raw) return raw;
  } catch {
    /* ignore */
  }
  return 'cyan';
}

export async function saveAccentId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACCENT_KEY, id);
}
