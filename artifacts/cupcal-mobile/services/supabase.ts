import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { RemoteBookmark, PendingBookmarkChange } from '@/services/localBookmarkStore';

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

export async function fetchRemoteBookmarks(userId: string): Promise<RemoteBookmark[]> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');

  const { data, error } = await supabase
    .from('user_event_bookmarks')
    .select('event_id, is_favorite, updated_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as RemoteBookmark[];
}

export async function saveRemoteBookmark(
  eventId: string,
  change: PendingBookmarkChange,
): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');

  const { error } = await supabase.rpc('sync_user_event_bookmark', {
    p_event_id: eventId,
    p_is_favorite: change.isFavorite,
    p_updated_at: change.updatedAt,
  });
  if (error) throw error;
}
