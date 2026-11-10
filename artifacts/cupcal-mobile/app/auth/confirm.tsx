import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { friendlyAuthError } from '@/services/accountAuth';
import { supabase } from '@/services/supabase';

type ConfirmationStatus = 'checking' | 'success' | 'error';

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ConfirmEmailScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const code = firstValue(params.code);
  const authError = firstValue(params.error);
  const authErrorDescription = firstValue(params.error_description);
  const processedCode = useRef<string | null>(null);
  const [status, setStatus] = useState<ConfirmationStatus>('checking');
  const [message, setMessage] = useState('Deine E-Mail-Adresse wird bestätigt …');

  useEffect(() => {
    if (authError || authErrorDescription) {
      setStatus('error');
      setMessage(
        authErrorDescription
          ? `Der Bestätigungslink konnte nicht verwendet werden: ${authErrorDescription}`
          : 'Der Bestätigungslink konnte nicht verwendet werden. Bitte fordere einen neuen an.',
      );
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('Der Bestätigungslink enthält keinen gültigen Code. Bitte fordere einen neuen an.');
      return;
    }

    if (processedCode.current === code) return;
    processedCode.current = code;

    if (!supabase) {
      setStatus('error');
      setMessage('Die Konto-Funktion ist derzeit nicht verfügbar.');
      return;
    }

    void supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) throw error;
      if (!data.session) throw new Error('Es wurde keine gültige Sitzung erstellt.');
      setStatus('success');
      setMessage('Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.');
    }).catch((error: unknown) => {
      const details = friendlyAuthError(
        error,
        'Der Bestätigungslink konnte nicht verarbeitet werden.',
      );
      setStatus('error');
      setMessage(
        details.includes('Wiederherstellungslink')
          ? 'Der Bestätigungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an.'
          : details,
      );
    });
  }, [authError, authErrorDescription, code]);

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
          {isChecking ? 'E-Mail bestätigen' : isSuccess ? 'Bestätigt' : 'Bestätigung fehlgeschlagen'}
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
