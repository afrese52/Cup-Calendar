import { Feather } from '@expo/vector-icons';
import { useRequestAccountDeletion } from '@workspace/api-client-react';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import {
  loadAccountConfirmationResendAvailableAt,
  friendlyAuthError,
  resendAccountConfirmation,
  saveAccountConfirmationResendAvailableAt,
  signOutAccount,
  submitAccountAuth,
  watchAuthSession,
} from '@/services/accountAuth';
import { PASSWORD_MIN_LENGTH } from '@/services/passwordRecovery';
import {
  getAccountDeletionRedirectUrl,
  getEmailConfirmationRedirectUrl,
  isSupabaseConfigured,
  requestEmailConfirmation,
  requestPasswordReset,
  supabase,
  supabaseConfigurationMessage,
} from '@/services/supabase';
import { requestAccountDeletionConfirmation } from '@/services/accountDeletion';
import { useCupCal } from '@/state/AppContext';

const DISCLAIMER =
  'Teile der verwendeten Materialien sind Marken und/oder urheberrechtlich geschützte Werke von Epic Games, Inc. Alle Rechte vorbehalten. Dieses Material ist inoffiziell und wird nicht von Epic Games unterstützt.';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password';
type AuthAction = 'submit' | 'resend-confirmation' | 'sign-out' | 'delete-account';

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: destructive ? colors.destructive + '20' : colors.secondary }]}>
        <Feather name={icon} size={17} color={destructive ? colors.destructive : colors.secondaryForeground} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: destructive ? colors.destructive : colors.foreground }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
      {onPress ? <Feather name="chevron-right" size={17} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { storageError } = useCupCal();
  const { width, height } = useWindowDimensions();
  const isCompactWidth = width < 360;
  const isCompactHeight = height < 640;
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(supabase));
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [registrationConfirmationEmail, setRegistrationConfirmationEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [submittingAction, setSubmittingAction] = useState<AuthAction | null>(null);
  const isSubmittingAuth = submittingAction !== null;
  const [authError, setAuthError] = useState<string | null>(null);
  const authErrorRef = useRef<React.ComponentRef<typeof Text>>(null);
  const lastAnnouncedAccountStatusRef = useRef<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [confirmationResendAvailableAt, setConfirmationResendAvailableAt] = useState<number | null>(null);
  const [confirmationResendClock, setConfirmationResendClock] = useState(() => Date.now());
  const [confirmationResendCooldownLoaded, setConfirmationResendCooldownLoaded] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const accountDeletionRequest = useRequestAccountDeletion();
  const confirmationResendSecondsLeft = confirmationResendAvailableAt === null
    ? 0
    : Math.max(0, Math.ceil((confirmationResendAvailableAt - confirmationResendClock) / 1000));
  const confirmationResendDisabled =
    isSubmittingAuth || !confirmationResendCooldownLoaded || confirmationResendSecondsLeft > 0;
  const confirmationResendCountdownLabel = confirmationResendSecondsLeft === 1
    ? 'Erneut senden in 1 Sekunde'
    : `Erneut senden in ${confirmationResendSecondsLeft} Sekunden`;

  useEffect(() => {
    let active = true;
    void loadAccountConfirmationResendAvailableAt().then((availableAt) => {
      if (!active) return;
      setConfirmationResendAvailableAt(availableAt);
      setConfirmationResendClock(Date.now());
      setConfirmationResendCooldownLoaded(true);
    }).catch(() => {
      if (!active) return;
      setConfirmationResendAvailableAt(null);
      setConfirmationResendCooldownLoaded(true);
      setAuthError(
        'Die lokale Wartezeit konnte nicht geladen werden. Serverseitige Versandlimits gelten weiterhin.',
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (confirmationResendAvailableAt === null) return;

    const refreshCountdown = () => {
      const now = Date.now();
      setConfirmationResendClock(now);
      if (now >= confirmationResendAvailableAt) setConfirmationResendAvailableAt(null);
    };
    refreshCountdown();
    const timer = setInterval(refreshCountdown, 1000);
    return () => clearInterval(timer);
  }, [confirmationResendAvailableAt]);

  useEffect(() => {
    if (!authError || isSubmittingAuth || Platform.OS === 'web') return;

    if (authErrorRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(authErrorRef.current, 'focus');
    }
  }, [authError, isSubmittingAuth]);

  useEffect(() => {
    if (!supabase) return;

    return watchAuthSession(supabase.auth, {
      onSession: (nextSession) => {
        setSession(nextSession);
        if (nextSession) setRegistrationConfirmationEmail(null);
        setAuthError(null);
      },
      onError: (error) => {
        setAuthError(friendlyAuthError(
          error,
          'Die Sitzung konnte nicht geladen werden. Bitte melde dich erneut an.',
        ));
      },
      onReady: () => setIsCheckingSession(false),
    });
  }, []);

  useEffect(() => {
    if (!supabase || isCheckingSession || Platform.OS !== 'ios') return;

    const statusKey = session
      ? `signed-in:${session.user.id}:${session.user.email ?? ''}`
      : 'signed-out';
    if (lastAnnouncedAccountStatusRef.current === statusKey) return;
    lastAnnouncedAccountStatusRef.current = statusKey;

    AccessibilityInfo.announceForAccessibility(
      session
        ? `Angemeldet. ${session.user.email ?? 'Deine CupCal-Sitzung ist aktiv.'}`
        : 'Abgemeldet. Bei CupCal anmelden.',
    );
  }, [isCheckingSession, session]);

  const submitAuth = async () => {
    if (!supabase) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail || (authMode !== 'forgot-password' && !password)) {
      setAuthError(
        authMode === 'forgot-password'
          ? 'Bitte gib deine E-Mail-Adresse ein.'
          : 'Bitte gib E-Mail-Adresse und Passwort ein.',
      );
      setAuthMessage(null);
      return;
    }

    setSubmittingAction('submit');
    setAuthError(null);
    setAuthMessage(null);
    setRegistrationConfirmationEmail(null);
    try {
      const result = await submitAccountAuth(supabase.auth, {
        mode: authMode,
        email: normalizedEmail,
        password,
        emailConfirmationRedirectTo: getEmailConfirmationRedirectUrl(),
        requestPasswordReset,
      });
      if (result.ok) {
        setAuthMessage(result.message);
        if (result.emailConfirmationRequired) {
          setRegistrationConfirmationEmail(normalizedEmail);
        }
        if (result.clearPassword) setPassword('');
      } else {
        setAuthError(result.error);
      }
    } catch (error) {
      setAuthError(friendlyAuthError(error, 'Die Registrierung oder Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.'));
    } finally {
      setSubmittingAction(null);
    }
  };

  const resendConfirmation = async () => {
    if (!supabase || !confirmationResendCooldownLoaded || confirmationResendSecondsLeft > 0) return;

    setSubmittingAction('resend-confirmation');
    setAuthError(null);
    setAuthMessage(null);
    try {
      const result = await resendAccountConfirmation({
        email: registrationConfirmationEmail ?? email,
        emailConfirmationRedirectTo: getEmailConfirmationRedirectUrl(),
        requestEmailConfirmation,
      });
      if (result.ok) {
        setAuthMessage(result.message);
        const availableAt = Date.now() + result.resendCooldownSeconds * 1000;
        setConfirmationResendAvailableAt(availableAt);
        setConfirmationResendClock(Date.now());
        try {
          await saveAccountConfirmationResendAvailableAt(availableAt);
        } catch {
          setAuthError(
            'Die Anfrage wurde gesendet, aber die Wartezeit konnte auf diesem Gerät nicht gespeichert werden. Serverseitige Versandlimits gelten weiterhin.',
          );
        }
      } else {
        setAuthError(result.error);
      }
    } finally {
      setSubmittingAction(null);
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    setSubmittingAction('sign-out');
    setAuthError(null);
    setAuthMessage(null);
    try {
      const result = await signOutAccount(supabase.auth);
      if (result.ok) {
        setAuthMessage(result.message);
        if (result.clearPassword) setPassword('');
      } else {
        setAuthError(result.error);
      }
    } finally {
      setSubmittingAction(null);
    }
  };

  const sendAccountDeletionLink = async () => {
    if (!supabase || !session?.user.email) {
      setAuthError('Für dieses angemeldete Konto ist keine E-Mail-Adresse verfügbar.');
      return;
    }

    setSubmittingAction('delete-account');
    setAuthError(null);
    setAuthMessage(null);
    try {
      const request = await accountDeletionRequest.mutateAsync();
      await requestAccountDeletionConfirmation(
        supabase.auth,
        session.user.email,
        getAccountDeletionRedirectUrl(request.confirmationToken),
      );
      setShowDeleteConfirmation(false);
      setAuthMessage(
        `Wir haben einen Bestätigungslink an ${session.user.email} gesendet. Das Konto wird erst gelöscht, wenn du den Link öffnest. Er ist 30 Minuten gültig.`,
      );
    } catch (error) {
      setAuthError(
        friendlyAuthError(
          error,
          'Der Bestätigungslink konnte nicht gesendet werden. Bitte versuche es erneut.',
        ),
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  const authSubmitLabel =
    authMode === 'forgot-password'
      ? 'Link anfordern'
      : authMode === 'sign-in'
        ? 'Anmelden'
        : 'Konto erstellen';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollViewCompat
        testID="settings-scroll-view"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isCompactWidth ? 14 : 20,
            paddingTop: Platform.OS === 'web' ? 67 : isCompactHeight ? 2 : 10,
            paddingBottom: Platform.OS === 'web' ? 100 : isCompactHeight ? 24 : 40,
          },
        ]}
        scrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <Text style={[styles.eyebrow, { color: colors.primary }]}>CUPCAL</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>Info</Text>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>Informationen zu CupCal und deinen lokalen Daten.</Text>

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>KONTO</Text>
        <View style={[styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {isCheckingSession ? (
            <View style={styles.accountStatus}>
              <Text
                accessible
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                testID="account-session-status"
                style={[styles.accountTitle, { color: colors.foreground }]}
              >
                Sitzung wird geprüft …
              </Text>
            </View>
          ) : session ? (
            <View>
              <View style={styles.accountStatus}>
                <View style={[styles.accountIcon, { backgroundColor: colors.accent }]}>
                  <Feather name="user" size={17} color={colors.primary} />
                </View>
                <View style={styles.accountCopy}>
                  <Text
                    accessible
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    testID="account-session-status"
                    style={[styles.accountTitle, { color: colors.foreground }]}
                  >
                    Angemeldet
                  </Text>
                  <Text style={[styles.accountSubtitle, { color: colors.mutedForeground }]}>
                    {session.user.email ?? 'Deine CupCal-Sitzung ist aktiv.'}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={submittingAction === 'sign-out' ? 'Abmeldung läuft' : 'Abmelden'}
                accessibilityState={{
                  disabled: isSubmittingAuth,
                  busy: submittingAction === 'sign-out',
                }}
                testID="sign-out-button"
                disabled={isSubmittingAuth}
                onPress={() => void signOut()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border },
                  pressed && !isSubmittingAuth ? styles.pressed : null,
                  isSubmittingAuth ? styles.disabled : null,
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                  {isSubmittingAuth ? 'Wird abgemeldet …' : 'Abmelden'}
                </Text>
              </Pressable>
              {showDeleteConfirmation ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.deleteConfirmation,
                    { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '66' },
                  ]}
                >
                  <Text style={[styles.deleteConfirmationTitle, { color: colors.foreground }]}>
                    Konto wirklich löschen?
                  </Text>
                  <Text style={[styles.deleteConfirmationCopy, { color: colors.mutedForeground }]}>
                    Dein Konto und deine gespeicherten Favoriten werden endgültig entfernt. Zuerst senden wir einen Link an deine E-Mail-Adresse. Gelöscht wird erst, wenn du diesen Link öffnest.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Bestätigungslink senden"
                    accessibilityState={{
                      disabled: isSubmittingAuth,
                      busy: submittingAction === 'delete-account',
                    }}
                    testID="delete-account-confirm-button"
                    disabled={isSubmittingAuth}
                    onPress={() => void sendAccountDeletionLink()}
                    style={({ pressed }) => [
                      styles.deleteConfirmButton,
                      { backgroundColor: colors.destructive },
                      pressed && !isSubmittingAuth ? styles.pressed : null,
                      isSubmittingAuth ? styles.disabled : null,
                    ]}
                  >
                    {isSubmittingAuth ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={[styles.deleteConfirmButtonText, { color: colors.primaryForeground }]}>
                        Bestätigungslink senden
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isSubmittingAuth }}
                    testID="delete-account-cancel-button"
                    disabled={isSubmittingAuth}
                    onPress={() => setShowDeleteConfirmation(false)}
                    style={styles.modeToggle}
                  >
                    <Text style={[styles.modeToggleText, { color: colors.mutedForeground }]}>Abbrechen</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSubmittingAuth }}
                  testID="delete-account-button"
                  disabled={isSubmittingAuth}
                  onPress={() => {
                    setAuthError(null);
                    setAuthMessage(null);
                    setShowDeleteConfirmation(true);
                  }}
                  style={({ pressed }) => [
                    styles.deleteAccountButton,
                    { borderColor: colors.destructive + '66' },
                    pressed && !isSubmittingAuth ? styles.pressed : null,
                    isSubmittingAuth ? styles.disabled : null,
                  ]}
                >
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                  <Text style={[styles.deleteAccountButtonText, { color: colors.destructive }]}>Konto löschen</Text>
                </Pressable>
              )}
            </View>
          ) : !isSupabaseConfigured ? (
            <View style={styles.accountStatus}>
              <View style={[styles.accountIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="cloud-off" size={17} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.configurationMessage, { color: colors.mutedForeground }]}>
                {supabaseConfigurationMessage}
              </Text>
            </View>
          ) : (
            <>
              <Text
                accessible
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                testID="account-session-status"
                style={[styles.accountTitle, { color: colors.foreground }]}
              >
                {authMode === 'sign-in'
                  ? 'Bei CupCal anmelden'
                  : authMode === 'sign-up'
                    ? 'Konto erstellen'
                    : 'Passwort zurücksetzen'}
              </Text>
              <Text style={[styles.accountSubtitle, { color: colors.mutedForeground }]}>
                {authMode === 'sign-in'
                  ? 'Melde dich mit deinem CupCal-Konto an.'
                  : authMode === 'sign-up'
                    ? 'Erstelle ein Konto mit deiner E-Mail-Adresse.'
                    : 'Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.'}
              </Text>
              <TextInput
                accessibilityLabel="E-Mail-Adresse"
                accessibilityHint={
                  authMode === 'forgot-password'
                    ? 'Gib die E-Mail-Adresse für den Wiederherstellungslink ein.'
                    : 'Gib die E-Mail-Adresse für dein CupCal-Konto ein.'
                }
                testID="auth-email-input"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="E-Mail-Adresse"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="next"
                selectionColor={colors.primary}
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                style={[
                  styles.input,
                  { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground },
                ]}
              />
              {authMode !== 'forgot-password' ? (
                <TextInput
                  accessibilityLabel={
                    authMode === 'sign-up' ? 'Passwort für das neue Konto' : 'Passwort'
                  }
                  accessibilityHint={
                    authMode === 'sign-up'
                      ? 'Wähle das Passwort für dein CupCal-Konto.'
                      : 'Gib dein CupCal-Passwort ein.'
                  }
                  testID="auth-password-input"
                  autoCapitalize="none"
                  autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                  placeholder="Passwort"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                  secureTextEntry
                  selectionColor={colors.primary}
                  textContentType={authMode === 'sign-in' ? 'password' : 'newPassword'}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={() => void submitAuth()}
                  style={[
                    styles.input,
                    { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground },
                  ]}
                />
              ) : null}
              {authMode === 'sign-up' ? (
                <Text
                  accessibilityRole="text"
                  testID="auth-password-requirement"
                  style={[styles.accountSubtitle, { color: colors.mutedForeground }]}
                >
                  Mindestens {PASSWORD_MIN_LENGTH} Zeichen. Es sind keine weiteren Zeichenregeln erforderlich.
                </Text>
              ) : null}
              {authError ? (
                <Text
                  ref={authErrorRef}
                  accessible
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  testID="auth-error-message"
                  style={[styles.authNotice, { color: colors.destructive }]}
                >
                  {authError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  submittingAction === 'submit'
                    ? authMode === 'forgot-password'
                      ? 'Passwortlink wird angefordert'
                      : authMode === 'sign-in'
                        ? 'Anmeldung läuft'
                        : 'Registrierung läuft'
                    : authSubmitLabel
                }
                accessibilityState={{
                  disabled: isSubmittingAuth,
                  busy: submittingAction === 'submit',
                }}
                testID="auth-submit-button"
                disabled={isSubmittingAuth}
                onPress={() => void submitAuth()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.primary },
                  pressed && !isSubmittingAuth ? styles.pressed : null,
                  isSubmittingAuth ? styles.disabled : null,
                ]}
              >
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                  {submittingAction === 'submit' ? 'Einen Moment …' : authSubmitLabel}
                </Text>
              </Pressable>
              {authMode === 'sign-in' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSubmittingAuth }}
                  testID="forgot-password-button"
                  disabled={isSubmittingAuth}
                  onPress={() => {
                    setAuthMode('forgot-password');
                    setAuthError(null);
                    setAuthMessage(null);
                    setRegistrationConfirmationEmail(null);
                  }}
                  style={styles.modeToggle}
                >
                  <Text style={[styles.modeToggleText, { color: colors.primary }]}>Passwort vergessen?</Text>
                </Pressable>
              ) : null}
              {authMode === 'sign-in' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isSubmittingAuth
                      ? 'Bestätigungslink wird gesendet'
                      : !confirmationResendCooldownLoaded
                        ? 'Bestätigungswartezeit wird geladen'
                        : confirmationResendSecondsLeft > 0
                        ? `Bestätigungslink erneut senden in ${confirmationResendSecondsLeft} Sekunden`
                        : 'Bestätigungslink erneut senden'
                  }
                  accessibilityState={{
                    disabled: confirmationResendDisabled,
                    busy: submittingAction === 'resend-confirmation',
                  }}
                  testID="resend-confirmation-button"
                  disabled={confirmationResendDisabled}
                  onPress={() => void resendConfirmation()}
                  style={({ pressed }) => [
                    styles.modeToggle,
                    pressed && !confirmationResendDisabled ? styles.pressed : null,
                    confirmationResendDisabled ? styles.disabled : null,
                  ]}
                >
                  <Text style={[styles.modeToggleText, { color: colors.primary }]}>
                    {isSubmittingAuth
                      ? 'Bestätigungslink wird gesendet'
                      : !confirmationResendCooldownLoaded
                        ? 'Bestätigungswartezeit wird geladen'
                        : confirmationResendSecondsLeft > 0
                        ? confirmationResendCountdownLabel
                        : 'Bestätigungslink erneut senden'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSubmittingAuth }}
                testID="auth-mode-toggle"
                disabled={isSubmittingAuth}
                onPress={() => {
                  setAuthMode(authMode === 'forgot-password' || authMode === 'sign-up' ? 'sign-in' : 'sign-up');
                  setAuthError(null);
                  setAuthMessage(null);
                  setRegistrationConfirmationEmail(null);
                }}
                style={styles.modeToggle}
              >
                <Text style={[styles.modeToggleText, { color: colors.primary }]}>
                  {authMode === 'sign-in'
                    ? 'Noch kein Konto? Registrieren'
                    : authMode === 'sign-up'
                      ? 'Schon ein Konto? Anmelden'
                      : 'Zurück zur Anmeldung'}
                </Text>
              </Pressable>
            </>
          )}
          {authMessage ? (
            <View>
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="auth-success-message"
                style={[styles.authNotice, { color: colors.success }]}
              >
                {authMessage}
              </Text>
              {registrationConfirmationEmail && !session ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isSubmittingAuth
                      ? 'Bestätigungslink wird gesendet'
                      : !confirmationResendCooldownLoaded
                        ? 'Bestätigungswartezeit wird geladen'
                        : confirmationResendSecondsLeft > 0
                        ? `Bestätigungslink erneut senden in ${confirmationResendSecondsLeft} Sekunden`
                        : 'Bestätigungslink erneut senden'
                  }
                  accessibilityState={{
                    disabled: confirmationResendDisabled,
                    busy: submittingAction === 'resend-confirmation',
                  }}
                  testID="registration-resend-confirmation-button"
                  disabled={confirmationResendDisabled}
                  onPress={() => void resendConfirmation()}
                  style={({ pressed }) => [
                    styles.modeToggle,
                    pressed && !confirmationResendDisabled ? styles.pressed : null,
                    confirmationResendDisabled ? styles.disabled : null,
                  ]}
                >
                  <Text style={[styles.modeToggleText, { color: colors.primary }]}>
                    {isSubmittingAuth
                      ? 'Bestätigungslink wird gesendet'
                      : !confirmationResendCooldownLoaded
                        ? 'Bestätigungswartezeit wird geladen'
                        : confirmationResendSecondsLeft > 0
                        ? confirmationResendCountdownLabel
                        : 'Bestätigungslink erneut senden'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {authError && session ? (
            <Text
              ref={authErrorRef}
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              testID="auth-error-message"
              style={[styles.authNotice, { color: colors.destructive }]}
            >
              {authError}
            </Text>
          ) : null}
        </View>

        {session ? (
          <>
            <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>APP</Text>
            <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SettingRow
                icon="upload-cloud"
                title="Turniertermine importieren"
                subtitle="Gespeicherte MHT-Datei prüfen und freigegebene Termine importieren."
                onPress={() => router.push('/admin/import')}
              />
            </View>
          </>
        ) : null}

        {storageError ? <Text style={[styles.error, { color: colors.warning }]}>{storageError}</Text> : null}

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>ÜBER CUPCAL</Text>
        <View style={[styles.about, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.aboutTitle, { color: colors.foreground }]}>Inoffizielle Begleit-App</Text>
          <Text style={[styles.aboutCopy, { color: colors.mutedForeground }]}>
            CupCal ist ein unabhängiges Fanprojekt. Fortnite-Wettbewerbe und Turniertermine sind kostenlos zugänglich.
          </Text>
          <Text style={[styles.disclaimer, { color: colors.mutedForeground, borderTopColor: colors.border }]}>{DISCLAIMER}</Text>
        </View>
        <Text style={[styles.version, { color: colors.mutedForeground }]}>CupCal · Vorschau</Text>
      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8, marginTop: 12 },
  heading: { fontSize: 30, fontWeight: '700', letterSpacing: -0.7 },
  intro: { fontSize: 13, marginTop: 5, marginBottom: 25 },
  groupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 9, marginLeft: 3 },
  group: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, marginBottom: 23 },
  accountCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 23 },
  accountStatus: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1 },
  accountTitle: { fontSize: 14, fontWeight: '700' },
  accountSubtitle: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  configurationMessage: { flex: 1, fontSize: 12, lineHeight: 17 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 14, marginTop: 12 },
  primaryButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  deleteAccountButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  deleteAccountButtonText: { fontSize: 13, fontWeight: '700' },
  deleteConfirmation: { borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 12 },
  deleteConfirmationTitle: { fontSize: 14, fontWeight: '700' },
  deleteConfirmationCopy: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  deleteConfirmButton: { minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  deleteConfirmButtonText: { fontSize: 13, fontWeight: '700' },
  modeToggle: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modeToggleText: { fontSize: 12, fontWeight: '700' },
  authNotice: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
  about: { borderWidth: 1, borderRadius: 18, padding: 16 },
  aboutTitle: { fontSize: 14, fontWeight: '700', marginBottom: 7 },
  aboutCopy: { fontSize: 12, lineHeight: 18, marginBottom: 13 },
  disclaimer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, fontSize: 10, lineHeight: 15 },
  error: { fontSize: 12, marginTop: -13, marginBottom: 18 },
  version: { textAlign: 'center', marginTop: 18, fontSize: 10 },
});
