import React, { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { AppProvider } from '@/state/AppContext';
import { LegacyBookmarkImportPrompt } from '@/components/LegacyBookmarkImportPrompt';
import { useColors } from '@/hooks/useColors';
import { handlePasswordResetUrl, supabase } from '@/services/supabase';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}
setAuthTokenGetter(async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colors = useColors();
  return (
    <AppProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="admin/import" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="admin/search-console" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="auth/reset" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/confirm" options={{ animation: 'fade' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <LegacyBookmarkImportPrompt />
    </AppProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const client = supabase;
    if (!client || Platform.OS === 'web') return;

    const syncAutoRefresh = (state: AppStateStatus) => {
      if (state === 'active') {
        void client.auth.startAutoRefresh();
      } else {
        void client.auth.stopAutoRefresh();
      }
    };

    if (AppState.currentState === 'active') {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
    const subscription = AppState.addEventListener('change', syncAutoRefresh);

    return () => {
      subscription.remove();
      void client.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    void Linking.getInitialURL()
      .then((url) => {
        if (url) return handlePasswordResetUrl(url);
        return false;
      })
      .catch(() => {
        // Die Wiederherstellungsseite zeigt den Fehler in verständlicher Form an.
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handlePasswordResetUrl(url).catch(() => {
        // Die Wiederherstellungsseite zeigt den Fehler in verständlicher Form an.
      });
    });

    return () => subscription.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
