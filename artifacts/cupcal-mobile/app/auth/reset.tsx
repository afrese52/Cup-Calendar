import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import {
  friendlyAuthError,
  handlePasswordResetUrl,
  isPasswordRecoveryPending,
  saveNewPassword,
  supabase,
} from '@/services/supabase';

export default function ResetPasswordScreen() {
  const colors = useColors();
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [isRecoveryReady, setIsRecoveryReady] = useState(isPasswordRecoveryPending());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setErrorMessage('Die Konto-Funktion ist derzeit nicht verfügbar.');
      setIsCheckingLink(false);
      return;
    }

    let isMounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!isMounted || event !== 'PASSWORD_RECOVERY') return;
      setIsRecoveryReady(true);
      setIsCheckingLink(false);
      setErrorMessage(null);
    });

    void (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await handlePasswordResetUrl(initialUrl);
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (isMounted) {
          const isReady = isPasswordRecoveryPending() && Boolean(data.session);
          setIsRecoveryReady(isReady);
          if (!isReady) {
            setErrorMessage('Dieser Link ist ungültig oder abgelaufen. Fordere bitte einen neuen an.');
          }
        }
      } catch (error) {
        if (isMounted) {
          setIsRecoveryReady(false);
          setErrorMessage(friendlyAuthError(error, 'Der Wiederherstellungslink konnte nicht geprüft werden.'));
        }
      } finally {
        if (isMounted) setIsCheckingLink(false);
      }
    })();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const submitNewPassword = async () => {
    if (!password || !confirmPassword) {
      setErrorMessage('Bitte gib dein neues Passwort zweimal ein.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Die Passwörter stimmen nicht überein.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await saveNewPassword(password);
      setIsSaved(true);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setErrorMessage(friendlyAuthError(error, 'Das Passwort konnte nicht gespeichert werden.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 67 : 24, paddingBottom: Platform.OS === 'web' ? 34 : 32 },
        ]}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          <Feather name={isSaved ? 'check' : 'lock'} size={21} color={colors.primary} />
        </View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>CUPCAL</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          {isSaved ? 'Passwort geändert' : 'Neues Passwort'}
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {isSaved
            ? 'Dein neues Passwort ist gespeichert. Du kannst dich jetzt mit diesem Passwort anmelden.'
            : isCheckingLink
              ? 'Der Wiederherstellungslink wird geprüft …'
              : isRecoveryReady
                ? 'Lege ein neues Passwort für dein CupCal-Konto fest.'
                : 'Der Link kann nicht verwendet werden. Fordere in den Einstellungen einen neuen an.'}
        </Text>

        {!isCheckingLink && isRecoveryReady && !isSaved ? (
          <>
            <TextInput
              accessibilityLabel="Neues Passwort"
              testID="reset-password-input"
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Neues Passwort"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
              secureTextEntry
              selectionColor={colors.primary}
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            />
            <TextInput
              accessibilityLabel="Neues Passwort bestätigen"
              testID="reset-password-confirm-input"
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Passwort wiederholen"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
              secureTextEntry
              selectionColor={colors.primary}
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onSubmitEditing={() => void submitNewPassword()}
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            />
          </>
        ) : null}

        {errorMessage ? (
          <Text accessibilityRole="alert" style={[styles.notice, { color: colors.destructive }]}>
            {errorMessage}
          </Text>
        ) : null}

        {!isCheckingLink && isRecoveryReady && !isSaved ? (
          <Pressable
            accessibilityRole="button"
            testID="reset-password-submit-button"
            disabled={isSaving}
            onPress={() => void submitNewPassword()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed && !isSaving ? styles.pressed : null,
              isSaving ? styles.disabled : null,
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              {isSaving ? 'Wird gespeichert …' : 'Passwort speichern'}
            </Text>
          </Pressable>
        ) : null}

        {(!isCheckingLink && (!isRecoveryReady || isSaved)) ? (
          <Pressable
            accessibilityRole="button"
            testID="reset-password-return-button"
            onPress={() => router.replace('/(tabs)/settings')}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
              {isSaved ? 'Zu CupCal' : 'Zur Anmeldung'}
            </Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8 },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  description: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 14, marginTop: 12 },
  notice: { fontSize: 12, lineHeight: 18, marginTop: 13 },
  primaryButton: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});
