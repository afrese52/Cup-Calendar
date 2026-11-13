import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { RemoteBookmark, PendingBookmarkChange } from '@/services/localBookmarkStore';
import { createCupCalSupabaseClient } from './createSupabaseClient';
import { createPasswordRecovery } from './passwordRecovery';
import {
  createAccountDeletionRedirectUrl,
  createPasswordResetRedirectUrl,
} from './authRedirectUrl';
import { normalizeSupabaseBaseUrl } from './supabaseUrl';
export { friendlyAuthError } from './accountAuth';
export { PASSWORD_MIN_LENGTH } from './passwordRecovery';

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseUrl = normalizeSupabaseBaseUrl(configuredSupabaseUrl);
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

if (configuredSupabaseUrl && supabaseUrl !== configuredSupabaseUrl.replace(/\/+$/, '')) {
  console.warn(
    '[CupCal] Die Supabase-URL enthielt einen API-Pfad. CupCal verwendet jetzt automatisch die Projektbasis.',
  );
}

export const supabase = isSupabaseConfigured
  && (Platform.OS !== 'web' || typeof window !== 'undefined')
  ? createCupCalSupabaseClient(supabaseUrl, supabasePublishableKey, AsyncStorage)
  : null;

const passwordRecovery = supabase
  ? createPasswordRecovery(supabase.auth)
  : null;

export function getPasswordResetRedirectUrl(): string {
  const nativeUrl = Linking.createURL('auth/reset', {
    queryParams: { flow: 'cupcal-password-reset' },
  });

  return createPasswordResetRedirectUrl({
    platform: Platform.OS === 'web' ? 'web' : 'native',
    webOrigin: Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : null,
    nativeUrl,
  });
}

export function getAccountDeletionRedirectUrl(confirmationToken: string): string {
  const nativeUrl = Linking.createURL('auth/confirm', {
    queryParams: {
      flow: 'cupcal-account-deletion',
      deletion_token: confirmationToken,
    },
  });
  return createAccountDeletionRedirectUrl({
    platform: Platform.OS === 'web' ? 'web' : 'native',
    webOrigin: Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : null,
    nativeUrl,
    confirmationToken,
  });
}

export function getEmailConfirmationRedirectUrl(): string {
  return Linking.createURL('auth/confirm', {
    queryParams: { flow: 'cupcal-email-confirmation' },
  });
}

export async function requestEmailConfirmation(email: string, emailRedirectTo: string): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo },
  });
  if (error) throw error;
}

export function isPasswordRecoveryPending(): boolean {
  return passwordRecovery?.isPending() ?? false;
}

export function markPasswordRecoverySession(hasSession: boolean): void {
  passwordRecovery?.markRecoverySession(hasSession);
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  if (error) throw error;
}

export function handlePasswordResetUrl(url: string): Promise<boolean> {
  return passwordRecovery?.handlePasswordResetUrl(url) ?? Promise.resolve(false);
}

export async function saveNewPassword(password: string): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');
  if (!passwordRecovery) throw new Error('Supabase ist nicht verfügbar.');
  await passwordRecovery.saveNewPassword(password);
}

export async function fetchRemoteBookmarks(userId: string): Promise<RemoteBookmark[]> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar.');

  const { data, error } = await supabase
    .from('user_event_bookmarks')
    .select('event_id, is_favorite, updated_at, revision')
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
