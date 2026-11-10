import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

const missingVariables = [
  !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !supabasePublishableKey && 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
].filter((variable): variable is string => Boolean(variable));

export const isSupabaseConfigured = missingVariables.length === 0;
export const supabaseConfigurationMessage = isSupabaseConfigured
  ? null
  : `Supabase ist nicht konfiguriert. Bitte setze ${missingVariables.join(' und ')}.`;

if (supabaseConfigurationMessage) {
  console.warn(`[CupCal] ${supabaseConfigurationMessage}`);
}

export const supabase = isSupabaseConfigured
  && (Platform.OS !== 'web' || typeof window !== 'undefined')
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
