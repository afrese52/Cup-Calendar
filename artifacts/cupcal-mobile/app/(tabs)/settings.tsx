import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigurationMessage,
} from '@/services/supabase';
import { useCupCal } from '@/state/AppContext';

const DISCLAIMER =
  'Teile der verwendeten Materialien sind Marken und/oder urheberrechtlich geschützte Werke von Epic Games, Inc. Alle Rechte vorbehalten. Dieses Material ist inoffiziell und wird nicht von Epic Games unterstützt.';

type AuthMode = 'sign-in' | 'sign-up';

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
  const {
    bookmarkedIds,
    bookmarkSyncError,
    bookmarkSyncStatus,
    clearBookmarks,
    storageError,
  } = useCupCal();
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(supabase));
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setIsCheckingSession(false);
      setAuthError(null);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        setAuthError(error.message);
      } else {
        setSession(data.session);
      }
      setIsCheckingSession(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const submitAuth = async () => {
    if (!supabase) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setAuthError('Bitte gib E-Mail-Adresse und Passwort ein.');
      setAuthMessage(null);
      return;
    }

    setIsSubmittingAuth(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      if (authMode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        setAuthMessage('Du bist angemeldet.');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        setAuthMessage(
          data.session
            ? 'Dein Konto ist erstellt und du bist angemeldet.'
            : 'Dein Konto ist erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.',
        );
        setPassword('');
      }
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    setIsSubmittingAuth(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAuthMessage('Du bist abgemeldet.');
      setPassword('');
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Die Abmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const confirmClear = () => {
    Alert.alert(
      'Favoriten löschen?',
      'Alle lokal gespeicherten Turniere werden aus deiner Merkliste entfernt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => void clearBookmarks(),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 67 : 10, paddingBottom: Platform.OS === 'web' ? 100 : 40 },
        ]}
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
              <Text style={[styles.accountTitle, { color: colors.foreground }]}>Sitzung wird geprüft …</Text>
            </View>
          ) : session ? (
            <View>
              <View style={styles.accountStatus}>
                <View style={[styles.accountIcon, { backgroundColor: colors.accent }]}>
                  <Feather name="user" size={17} color={colors.primary} />
                </View>
                <View style={styles.accountCopy}>
                  <Text style={[styles.accountTitle, { color: colors.foreground }]}>Angemeldet</Text>
                  <Text style={[styles.accountSubtitle, { color: colors.mutedForeground }]}>
                    {session.user.email ?? 'Deine CupCal-Sitzung ist aktiv.'}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
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
              <Text style={[styles.accountTitle, { color: colors.foreground }]}>
                {authMode === 'sign-in' ? 'Bei CupCal anmelden' : 'Konto erstellen'}
              </Text>
              <Text style={[styles.accountSubtitle, { color: colors.mutedForeground }]}>
                {authMode === 'sign-in'
                  ? 'Melde dich mit deinem CupCal-Konto an.'
                  : 'Erstelle ein Konto mit deiner E-Mail-Adresse.'}
              </Text>
              <TextInput
                accessibilityLabel="E-Mail-Adresse"
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
              <TextInput
                accessibilityLabel="Passwort"
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
              {authError ? (
                <Text accessibilityRole="alert" style={[styles.authNotice, { color: colors.destructive }]}>
                  {authError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
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
                  {isSubmittingAuth
                    ? 'Einen Moment …'
                    : authMode === 'sign-in'
                      ? 'Anmelden'
                      : 'Konto erstellen'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="auth-mode-toggle"
                disabled={isSubmittingAuth}
                onPress={() => {
                  setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in');
                  setAuthError(null);
                  setAuthMessage(null);
                }}
                style={styles.modeToggle}
              >
                <Text style={[styles.modeToggleText, { color: colors.primary }]}>
                  {authMode === 'sign-in' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
                </Text>
              </Pressable>
            </>
          )}
          {authMessage ? (
            <Text accessibilityRole="alert" style={[styles.authNotice, { color: colors.success }]}>
              {authMessage}
            </Text>
          ) : null}
          {authError && session ? (
            <Text accessibilityRole="alert" style={[styles.authNotice, { color: colors.destructive }]}>
              {authError}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>APP</Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon={bookmarkSyncStatus === 'synced' ? 'refresh-cw' : 'wifi-off'}
            title={bookmarkSyncStatus === 'synced' ? 'Geräteübergreifend verfügbar' : 'Offline verfügbar'}
            subtitle={
              bookmarkSyncStatus === 'syncing'
                ? 'Deine Merkliste wird abgeglichen.'
                : bookmarkSyncStatus === 'synced'
                  ? 'Mit deinem Konto synchronisiert und offline gespeichert.'
                  : bookmarkSyncStatus === 'pending'
                    ? 'Lokal gespeichert; Abgleich folgt bei Verbindung.'
                    : 'Deine Merkliste wird auf diesem Gerät gespeichert.'
            }
          />
          <SettingRow icon="bookmark" title="Gespeicherte Turniere" subtitle={`${bookmarkedIds.length} in deiner Merkliste`} />
          <SettingRow
            icon="trash-2"
            title="Favoriten löschen"
            subtitle="Entfernt alle lokal gespeicherten Favoriten."
            onPress={() => {
              void Haptics.selectionAsync();
              confirmClear();
            }}
            destructive
          />
        </View>

        {storageError || bookmarkSyncError ? (
          <Text style={[styles.error, { color: colors.warning }]}>
            {storageError ?? bookmarkSyncError}
          </Text>
        ) : null}

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
  content: { paddingHorizontal: 20 },
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
