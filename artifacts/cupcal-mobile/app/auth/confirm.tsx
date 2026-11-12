import { Feather } from '@expo/vector-icons';
import { useConfirmAccountDeletion } from '@workspace/api-client-react';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  establishAuthCallbackSession,
  parseAuthCallbackUrl,
  type AuthCallbackParams,
} from '@/services/accountDeletion';
import { friendlyAuthError } from '@/services/accountAuth';
import { supabase } from '@/services/supabase';

type ConfirmationStatus = 'checking' | 'success' | 'error';
const ACCOUNT_DELETION_FLOW = 'cupcal-account-deletion';

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function routeCallback(params: {
  code?: string | string[];
  access_token?: string | string[];
  refresh_token?: string | string[];
  flow?: string | string[];
  deletion_token?: string | string[];
  error?: string | string[];
  error_code?: string | string[];
  error_description?: string | string[];
}): AuthCallbackParams {
  return {
    code: firstValue(params.code),
    accessToken: firstValue(params.access_token),
    refreshToken: firstValue(params.refresh_token),
    flow: firstValue(params.flow),
    deletionToken: firstValue(params.deletion_token),
    error: firstValue(params.error) ?? firstValue(params.error_code),
    errorDescription: firstValue(params.error_description),
  };
}

export default function ConfirmEmailScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{
    code?: string | string[];
    access_token?: string | string[];
    refresh_token?: string | string[];
    flow?: string | string[];
    deletion_token?: string | string[];
    error?: string | string[];
    error_code?: string | string[];
    error_description?: string | string[];
  }>();
  const confirmationMutation = useConfirmAccountDeletion();
  const processedCallback = useRef<string | null>(null);
  const [status, setStatus] = useState<ConfirmationStatus>('checking');
  const [message, setMessage] = useState('Deine E-Mail-Adresse wird bestätigt …');

  useEffect(() => {
    let isMounted = true;

    const processCallback = async (callback: AuthCallbackParams) => {
      const callbackKey = [
        callback.flow,
        callback.deletionToken,
        callback.code,
        callback.accessToken,
        callback.error,
      ].join('|');
      if (processedCallback.current === callbackKey) return;
      processedCallback.current = callbackKey;

      if (callback.error || callback.errorDescription) {
        if (!isMounted) return;
        setStatus('error');
        setMessage(
          callback.errorDescription
            ? 'Der Bestätigungslink konnte nicht verwendet werden. Er ist ungültig, abgelaufen oder wurde bereits benutzt.'
            : 'Der Bestätigungslink konnte nicht verwendet werden. Bitte fordere einen neuen an.',
        );
        return;
      }

      if (!supabase) {
        if (!isMounted) return;
        setStatus('error');
        setMessage('Die Konto-Funktion ist derzeit nicht verfügbar.');
        return;
      }

      try {
        if (callback.flow === ACCOUNT_DELETION_FLOW && !callback.deletionToken) {
          throw new Error('Der Kontolöschungs-Bestätigungscode fehlt.');
        }
        const session = await establishAuthCallbackSession(supabase.auth, callback);

        if (callback.flow === ACCOUNT_DELETION_FLOW) {
          if (!callback.deletionToken) throw new Error('Der Kontolöschungs-Bestätigungscode fehlt.');
          await confirmationMutation.mutateAsync({
            data: { confirmationToken: callback.deletionToken },
          });
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          if (!isMounted) return;
          setStatus('success');
          setMessage('Dein CupCal-Konto und die dazugehörigen Favoriten wurden endgültig gelöscht.');
          return;
        }

        if (!session.user.id) throw new Error('Es wurde keine gültige Sitzung erstellt.');
        if (!isMounted) return;
        setStatus('success');
        setMessage('Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.');
      } catch (error: unknown) {
        if (!isMounted) return;
        setStatus('error');
        const isDeletion = callback.flow === ACCOUNT_DELETION_FLOW;
        setMessage(
          friendlyAuthError(
            error,
            isDeletion
              ? 'Das Konto konnte nicht gelöscht werden. Bitte fordere einen neuen Bestätigungslink an.'
              : 'Der Bestätigungslink konnte nicht verarbeitet werden.',
          ),
        );
      }
    };

    const routeParams = routeCallback(params);
    const hasRouteCallback = Object.values(routeParams).some(Boolean);
    void Linking.getInitialURL()
      .then((url) => {
        const browserUrl = Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.href
          : null;
        const initialUrl = url ?? browserUrl;
        const initialCallback = initialUrl ? parseAuthCallbackUrl(initialUrl) : {};
        const callback = Object.values(initialCallback).some(Boolean)
          ? initialCallback
          : hasRouteCallback
            ? routeParams
            : {};
        void processCallback(callback);
      })
      .catch(() => {
        void processCallback(routeParams);
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void processCallback(parseAuthCallbackUrl(url));
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [
    confirmationMutation.mutateAsync,
    params.access_token,
    params.code,
    params.deletion_token,
    params.error,
    params.error_code,
    params.error_description,
    params.flow,
    params.refresh_token,
  ]);

  const isChecking = status === 'checking';
  const isSuccess = status === 'success';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View
        style={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 67 : 24, paddingBottom: Platform.OS === 'web' ? 34 : 32 },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: isSuccess ? colors.accent : colors.secondary }]}>
          {isChecking ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Feather
              name={isSuccess ? 'check' : 'mail'}
              size={22}
              color={isSuccess ? colors.primary : colors.mutedForeground}
            />
          )}
        </View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>CUPCAL</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          {isChecking
            ? 'Bestätigung prüfen'
            : isSuccess
              ? firstValue(params.flow) === ACCOUNT_DELETION_FLOW
                ? 'Konto gelöscht'
                : 'Bestätigt'
              : 'Bestätigung fehlgeschlagen'}
        </Text>
        <Text
          accessibilityRole={status === 'error' ? 'alert' : undefined}
          style={[styles.description, { color: status === 'error' ? colors.destructive : colors.mutedForeground }]}
        >
          {message}
        </Text>

        {!isChecking ? (
          <Pressable
            accessibilityRole="button"
            testID="email-confirmation-return-button"
            onPress={() => router.replace('/(tabs)/settings')}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              {isSuccess ? 'Zu CupCal' : 'Zur Anmeldung'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8 },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  description: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  primaryButton: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
