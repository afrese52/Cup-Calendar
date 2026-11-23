import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, usePreventRemove } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInstance,
  View,
} from 'react-native';
import * as ReactNative from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { PASSWORD_LENGTH_POLICY_MESSAGE } from '@/services/passwordRecovery';
import {
  friendlyAuthError,
  getRateLimitRetryAfterSeconds,
  handlePasswordResetUrl,
  isPasswordRecoveryPending,
  markPasswordRecoverySession,
  saveNewPassword,
  supabase,
} from '@/services/supabase';

const getPasswordValidationError = (password: string, confirmPassword: string) => {
  if (!password && !confirmPassword) {
    return 'Bitte gib dein neues Passwort ein und bestätige es.';
  }
  if (!password) return 'Bitte gib dein neues Passwort ein.';
  if (!confirmPassword) return 'Bitte bestätige dein neues Passwort.';
  if (password !== confirmPassword) return 'Die Passwörter stimmen nicht überein.';
  return null;
};

const isPasswordValidationError = (message: string | null) =>
  message === 'Bitte gib dein neues Passwort ein und bestätige es.' ||
  message === 'Bitte gib dein neues Passwort ein.' ||
  message === 'Bitte bestätige dein neues Passwort.' ||
  message === 'Die Passwörter stimmen nicht überein.';

const isWeakPasswordError = (message: string | null) =>
  message === 'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.';

export default function ResetPasswordScreen() {
  const colors = useColors();
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [isRecoveryReady, setIsRecoveryReady] = useState(isPasswordRecoveryPending());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaveErrorAnnounced, setIsSaveErrorAnnounced] = useState(false);
  const [retryAvailableAt, setRetryAvailableAt] = useState<number | null>(null);
  const [retryWaitSeconds, setRetryWaitSeconds] = useState(0);
  const [retryWaitFinished, setRetryWaitFinished] = useState(false);
  const successMessageRef = useRef<TextInstance>(null);

  const hasUnsavedPassword = !isSaved && Boolean(password || confirmPassword);

  useEffect(() => {
    if (Platform.OS !== 'web' || (!isSaving && !hasUnsavedPassword)) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedPassword, isSaving]);

  useEffect(() => {
    if (!isSaved || Platform.OS === 'web') return;

    const reactTag = ReactNative.findNodeHandle(successMessageRef.current);
    if (typeof reactTag === 'number') AccessibilityInfo.setAccessibilityFocus(reactTag);
  }, [isSaved]);

  useEffect(() => {
    if (retryAvailableAt === null) return;

    const updateWait = () => {
      const secondsRemaining = Math.max(0, Math.ceil((retryAvailableAt - Date.now()) / 1_000));
      setRetryWaitSeconds(secondsRemaining);
      if (secondsRemaining === 0) {
        setRetryAvailableAt(null);
        setErrorMessage(null);
        setRetryWaitFinished(true);
      }
    };
    updateWait();
    const interval = setInterval(updateWait, 1_000);
    return () => clearInterval(interval);
  }, [retryAvailableAt]);

  useEffect(() => {
    if (retryWaitFinished && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(
        'Die Wartezeit ist abgelaufen. Du kannst es jetzt erneut versuchen.',
      );
    }
  }, [retryWaitFinished]);

  usePreventRemove(isSaving || hasUnsavedPassword, ({ repeat }) => {
    if (isSaving) return;

    const title = 'Passwort nicht gespeichert';
    const message = 'Wenn du jetzt gehst, gehen deine Eingaben verloren.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
        repeat();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Verwerfen', style: 'destructive', onPress: repeat },
    ]);
  });

  useEffect(() => {
    if (!supabase) {
      setErrorMessage('Die Konto-Funktion ist derzeit nicht verfügbar.');
      setIsCheckingLink(false);
      return;
    }

    let isMounted = true;
    const client = supabase;
    const refreshRecoverySession = async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!isMounted) return;

      const isReady = isPasswordRecoveryPending() && Boolean(data.session);
      setIsRecoveryReady(isReady);
      setErrorMessage(
        isReady
          ? null
          : 'Der Wiederherstellungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Fordere bitte einen neuen Link an.',
      );
    };
    const processRecoveryUrl = async (url: string) => {
      try {
        const wasRecoveryUrl = await handlePasswordResetUrl(url);
        if (wasRecoveryUrl) await refreshRecoverySession();
      } catch (error) {
        if (!isMounted) return;
        setIsRecoveryReady(false);
        setErrorMessage(friendlyAuthError(error, 'Der Wiederherstellungslink konnte nicht geprüft werden.'));
      }
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!isMounted || event !== 'PASSWORD_RECOVERY') return;
      const hasRecoverySession = Boolean(session);
      markPasswordRecoverySession(hasRecoverySession);
      setIsRecoveryReady(hasRecoverySession);
      setIsCheckingLink(false);
      setErrorMessage(
        hasRecoverySession
          ? null
          : 'Die Wiederherstellungssitzung ist abgelaufen oder ungültig. Fordere bitte einen neuen Link an.',
      );
    });

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void processRecoveryUrl(url);
    });

    void (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await processRecoveryUrl(initialUrl);
        await refreshRecoverySession();
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
      linkSubscription.remove();
    };
  }, []);

  const submitNewPassword = async () => {
    if (isSavingRef.current) return;

    const validationError = getPasswordValidationError(password, confirmPassword);
    if (validationError) {
      setIsSaveErrorAnnounced(false);
      setErrorMessage(validationError);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setIsSaveErrorAnnounced(false);
    setErrorMessage(null);
    setRetryAvailableAt(null);
    setRetryWaitSeconds(0);
    setRetryWaitFinished(false);
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility('Passwort wird gespeichert …');
    }
    try {
      await saveNewPassword(password);
      setIsSaved(true);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      const hasRecoverySession = isPasswordRecoveryPending();
      setIsRecoveryReady(hasRecoverySession);
      if (!hasRecoverySession) {
        setPassword('');
        setConfirmPassword('');
      }
      const message = hasRecoverySession
        ? friendlyAuthError(error, 'Das Passwort konnte nicht gespeichert werden. Bitte versuche es erneut.')
        : 'Die Wiederherstellungssitzung ist abgelaufen oder ungültig. Bitte fordere in den Einstellungen einen neuen Wiederherstellungslink an.';
      const retryAfterSeconds = hasRecoverySession ? getRateLimitRetryAfterSeconds(error) : null;
      if (retryAfterSeconds !== null) {
        setRetryAvailableAt(Date.now() + retryAfterSeconds * 1_000);
        setRetryWaitSeconds(retryAfterSeconds);
        setRetryWaitFinished(false);
      }
      if (Platform.OS === 'ios') {
        setIsSaveErrorAnnounced(true);
        AccessibilityInfo.announceForAccessibility(message);
      }
      setErrorMessage(message);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const updatePassword = (nextPassword: string) => {
    setPassword(nextPassword);
    setErrorMessage((currentMessage) =>
      isPasswordValidationError(currentMessage) || isWeakPasswordError(currentMessage)
        ? getPasswordValidationError(nextPassword, confirmPassword)
        : currentMessage,
    );
  };

  const updateConfirmPassword = (nextConfirmPassword: string) => {
    setConfirmPassword(nextConfirmPassword);
    setErrorMessage((currentMessage) =>
      isPasswordValidationError(currentMessage)
        ? getPasswordValidationError(password, nextConfirmPassword)
        : currentMessage,
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? 67 : 24,
            paddingBottom: Platform.OS === 'web' ? 34 : 32,
          },
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
        <Text
          testID={isSaved ? 'reset-password-success-message' : undefined}
          ref={isSaved ? successMessageRef : undefined}
          accessible={isSaved}
          accessibilityRole={isSaved ? 'status' : undefined}
          accessibilityLiveRegion={isSaved ? 'polite' : undefined}
          style={[styles.description, { color: colors.mutedForeground }]}
        >
          {isSaved
            ? 'Dein neues Passwort ist gespeichert. Du kannst dich jetzt mit diesem Passwort anmelden.'
            : isCheckingLink
              ? 'Der Wiederherstellungslink wird geprüft …'
              : isRecoveryReady
                ? 'Lege ein neues Passwort für dein CupCal-Konto fest.'
                : 'Der Link ist ungültig, abgelaufen oder wurde bereits verwendet. Fordere in den Einstellungen einen neuen an.'}
        </Text>

        {!isCheckingLink && isRecoveryReady && !isSaved ? (
          <>
            <Text testID="reset-password-policy" style={[styles.passwordPolicy, { color: colors.mutedForeground }]}>
              {PASSWORD_LENGTH_POLICY_MESSAGE}
            </Text>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                accessibilityLabel="Neues Passwort"
                testID="reset-password-input"
                autoCapitalize="none"
                autoComplete="new-password"
                placeholder="Neues Passwort"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="next"
                secureTextEntry={!isPasswordVisible}
                selectionColor={colors.primary}
                textContentType="newPassword"
                value={password}
                onChangeText={updatePassword}
                style={[styles.input, { color: colors.foreground }]}
              />
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={isPasswordVisible ? 'Neues Passwort verbergen' : 'Neues Passwort anzeigen'}
                accessibilityState={{ checked: isPasswordVisible }}
                testID="reset-password-visibility-toggle"
                onPress={() => setIsPasswordVisible((visible) => !visible)}
                style={styles.visibilityToggle}
              >
                <Feather name={isPasswordVisible ? 'eye-off' : 'eye'} size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                accessibilityLabel="Neues Passwort bestätigen"
                testID="reset-password-confirm-input"
                autoCapitalize="none"
                autoComplete="new-password"
                placeholder="Passwort wiederholen"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                secureTextEntry={!isConfirmPasswordVisible}
                selectionColor={colors.primary}
                textContentType="newPassword"
                value={confirmPassword}
                onChangeText={updateConfirmPassword}
                onSubmitEditing={() => void submitNewPassword()}
                style={[styles.input, { color: colors.foreground }]}
              />
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={isConfirmPasswordVisible ? 'Bestätigung verbergen' : 'Bestätigung anzeigen'}
                accessibilityState={{ checked: isConfirmPasswordVisible }}
                testID="reset-password-confirm-visibility-toggle"
                onPress={() => setIsConfirmPasswordVisible((visible) => !visible)}
                style={styles.visibilityToggle}
              >
                <Feather name={isConfirmPasswordVisible ? 'eye-off' : 'eye'} size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </>
        ) : null}

        {errorMessage ? (
          <Text
            accessible
            accessibilityRole={Platform.OS === 'ios' && !isSaveErrorAnnounced ? 'alert' : 'text'}
            accessibilityLiveRegion={Platform.OS === 'android' ? 'assertive' : undefined}
            style={[styles.notice, { color: colors.destructive }]}
          >
            {errorMessage}
          </Text>
        ) : null}

        {retryWaitSeconds > 0 ? (
          <Text
            accessible
            testID="reset-password-retry-countdown"
            style={[styles.retryCountdown, { color: colors.mutedForeground }]}
          >
            Du kannst es in {retryWaitSeconds} {retryWaitSeconds === 1 ? 'Sekunde' : 'Sekunden'} erneut versuchen.
          </Text>
        ) : null}

        {retryWaitFinished ? (
          <Text
            accessible
            accessibilityRole="status"
            accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
            testID="reset-password-retry-ready"
            style={[styles.retryCountdown, { color: colors.mutedForeground }]}
          >
            Die Wartezeit ist abgelaufen. Du kannst es jetzt erneut versuchen.
          </Text>
        ) : null}

        {!isCheckingLink && isRecoveryReady && !isSaved ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSaving ? 'Passwort wird gespeichert' : 'Passwort speichern'}
            accessibilityLiveRegion={Platform.OS === 'android' && isSaving ? 'polite' : undefined}
            accessibilityState={{
              disabled: isSaving || retryWaitSeconds > 0,
              busy: isSaving,
            }}
            testID="reset-password-submit-button"
            disabled={isSaving || retryWaitSeconds > 0}
            onPress={() => void submitNewPassword()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed && !isSaving && retryWaitSeconds === 0 ? styles.pressed : null,
              isSaving || retryWaitSeconds > 0 ? styles.disabled : null,
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              {isSaving
                ? 'Wird gespeichert …'
                : retryWaitSeconds > 0
                  ? `Bitte warten (${retryWaitSeconds} s)`
                  : 'Passwort speichern'}
            </Text>
          </Pressable>
        ) : null}

        {!isCheckingLink && (!isRecoveryReady || isSaved) ? (
          <Pressable
            accessibilityRole="button"
            testID="reset-password-return-button"
            onPress={() =>
              router.replace(
                isSaved
                  ? '/(tabs)/settings'
                  : '/(tabs)/settings?authMode=forgot-password&focusAccount=true',
              )
            }
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
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  description: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  passwordPolicy: { fontSize: 13, lineHeight: 18, marginBottom: 2 },
  inputRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 4,
    marginTop: 12,
  },
  input: { minHeight: 48, flex: 1, paddingVertical: 0, fontSize: 14 },
  visibilityToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { fontSize: 12, lineHeight: 18, marginTop: 13 },
  retryCountdown: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});
