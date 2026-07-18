import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AccentProvider } from '@/theme/AccentContext';
import { AuthProvider } from '@/theme/AuthContext';
import { PhonePerfProvider } from '@/theme/PhonePerfContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    MinecraftTen: require('../assets/fonts/MinecraftTen.ttf'),
    MinecraftRegular: require('../assets/fonts/MinecraftRegular.otf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <PhonePerfProvider>
      <AccentProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#0b1220' },
              headerTintColor: '#F4F6FA',
              contentStyle: { backgroundColor: '#08080A' },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </AuthProvider>
      </AccentProvider>
    </PhonePerfProvider>
  );
}
