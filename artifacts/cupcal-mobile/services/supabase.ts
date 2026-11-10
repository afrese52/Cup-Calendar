import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { RemoteBookmark, PendingBookmarkChange } from '@/services/localBookmarkStore';
export { friendlyAuthError } from './accountAuth';

const passwordResetFlowMarker = 'cupcal-password-reset';
let passwordRecoveryPending = false;
let lastPasswordResetUrl: string | null = null;
let lastPasswordResetPromise: Promise<boolean> | null = null;

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

export function getPasswordResetRedirectUrl(): string {
  return Linking.createURL('auth/reset', {
    queryParams: { flow: passwordResetFlowMarker },
  });
}

export function isPasswordRecoveryPending(): boolean {
  return passwordRecoveryPending;
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  if (error) throw error;
}

function getResetUrlParams(url: string): {
  query: URLSearchParams;
  hash: URLSearchParams;
} {
  const [beforeHash, hash = ''] = url.split('#', 2);
  const queryString = beforeHash.includes('?')
    ? beforeHash.slice(beforeHash.indexOf('?') + 1)
    : '';

  return {
    query: new URLSearchParams(queryString),
    hash: new URLSearchParams(hash.replace(/^\?/, '')),
  };
}

async function processPasswordResetUrl(url: string): Promise<boolean> {
  if (!supabase) return false;

  const { query, hash } = getResetUrlParams(url);
  const getParameter = (key: string) => query.get(key) ?? hash.get(key);
  if (getParameter('flow') !== passwordResetFlowMarker) return false;

  const linkError = getParameter('error_description') ?? getParameter('error_code');
  if (linkError) {
    throw new Error('Der Wiederherstellungslink ist ungültig oder abgelaufen.');
  }
  const code = getParameter('code');
  const isRecoveryType = getParameter('type') === 'recovery';
  if (!isRecoveryType && !code) {
    throw new Error('Dieser Link ist kein gültiger Wiederherstellungslink.');
  }

  passwordRecoveryPending = true;
  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return true;
    }

    if (!isRecoveryType) {
      throw new Error('Dieser Link ist kein gültiger Wiederherstellungslink.');
    }

    const accessToken = getParameter('access_token');
    const refreshToken = getParameter('refresh_token');
    if (!accessToken || !refreshToken) {
      throw new Error('Der Wiederherstellungslink enthält keine gültige Sitzung.');
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    passwordRecoveryPending = false;
    throw error;
  }
}

export function handlePasswordResetUrl(url: string): Promise<boolean> {
  if (lastPasswordResetUrl === url && lastPasswordResetPromise) {
    return lastPasswordResetPromise;
  }

  lastPasswordResetUrl = url;
  lastPasswordResetPromise = processPasswordResetUrl(url);
  return lastPasswordResetPromise;
}

export async function saveNewPassword(password: string): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');
  if (!passwordRecoveryPending) {
    throw new Error('Bitte öffne zuerst einen gültigen Wiederherstellungslink.');
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  passwordRecoveryPending = false;
}

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
