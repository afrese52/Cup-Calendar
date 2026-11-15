import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native';
import SettingsScreen from '../app/(tabs)/settings';
import { supabase } from '@/services/supabase';
import {
  ACCOUNT_CONFIRMATION_RESEND_AVAILABLE_AT_KEY,
  ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS,
  PENDING_ACCOUNT_CONFIRMATION_EMAIL_KEY,
} from '../services/accountAuth';

type AuthListener = (event: string, session: unknown) => void;
type MockAuth = Record<string, any>;
type RenderedSettings = Awaited<ReturnType<typeof render>>;
const mockRouteParams: { focusAccount?: string } = {};

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __values: values,
    default: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    },
  };
});
jest.mock('@workspace/api-client-react', () => {
  const request = jest.fn(async () => ({
    confirmationToken: 'signed.confirmation.token',
    expiresAt: '2026-11-12T12:30:00.000Z',
  }));
  return {
    useRequestAccountDeletion: () => ({ mutateAsync: request }),
    __requestAccountDeletion: request,
  };
});
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/components/KeyboardAwareScrollViewCompat', () => {
  const { ScrollView } = require('react-native');
  return { KeyboardAwareScrollViewCompat: ScrollView };
});
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    foreground: '#111',
    mutedForeground: '#666',
    primary: '#06c',
    primaryForeground: '#fff',
    secondary: '#eee',
    secondaryForeground: '#333',
    destructive: '#c00',
    success: '#080',
    warning: '#a60',
    accent: '#def',
    card: '#fff',
    border: '#ddd',
    input: '#fff',
  }),
}));
jest.mock('@/state/AppContext', () => ({ useCupCal: () => ({ storageError: null }) }));
jest.mock('@/services/supabase', () => {
  let listener: AuthListener | undefined;
  const auth = {
    signInWithPassword: jest.fn(async () => ({ error: null })),
    signUp: jest.fn(async () => ({ data: { session: null }, error: null })),
    resetPasswordForEmail: jest.fn(
      async (_email: string, _options: { redirectTo: string }) => ({ error: null as Error | null }),
    ),
    signInWithOtp: jest.fn(async () => ({ error: null })),
    resend: jest.fn(async () => ({ error: null })),
    signOut: jest.fn(async () => {
      listener?.('SIGNED_OUT', null);
      return { error: null };
    }),
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: jest.fn((callback: AuthListener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
  };

  return {
    supabase: { auth },
    isSupabaseConfigured: true,
    supabaseConfigurationMessage: null,
    getEmailConfirmationRedirectUrl: () => 'cupcal-test://auth/confirm',
    getAccountDeletionRedirectUrl: (token: string) =>
      `cupcal-test://auth/confirm?flow=cupcal-account-deletion&deletion_token=${token}`,
    requestEmailConfirmation: jest.fn(async () => {}),
    requestPasswordReset: jest.fn(async (email: string) => {
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
      });
      if (error) throw error;
    }),
    __emitAuthStateChange: (event: string, nextSession: unknown) => listener?.(event, nextSession),
  };
});

const auth = supabase!.auth as unknown as MockAuth;
const mockSupabase = jest.requireMock('@/services/supabase') as {
  __emitAuthStateChange: (event: string, session: unknown) => void;
};
const testSession = {
  access_token: 'fake-token',
  refresh_token: 'fake-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'fake-user', email: 'test@example.invalid' },
};
const defaultWindowDimensions = Dimensions.get('window');
const defaultScreenDimensions = Dimensions.get('screen');
const sendAccessibilityFocus = jest
  .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
  .mockImplementation(() => {});
const announceForAccessibility = jest
  .spyOn(AccessibilityInfo, 'announceForAccessibility')
  .mockImplementation(() => {});

function restoreAuthMocks() {
  auth.signInWithPassword.mockReset().mockImplementation(async () => {
    mockSupabase.__emitAuthStateChange('SIGNED_IN', testSession);
    return { error: null };
  });
  auth.signUp.mockReset().mockImplementation(async () => ({ data: { session: null }, error: null }));
  auth.resetPasswordForEmail.mockReset().mockImplementation(async () => ({ error: null }));
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
    requestPasswordReset: jest.Mock;
  };
  mockedSupabase.requestEmailConfirmation.mockReset().mockImplementation(async () => {});
  mockedSupabase.requestPasswordReset.mockReset().mockImplementation(async (...args: unknown[]) => {
    const email = String(args[0] ?? '');
    const { error } = await auth.resetPasswordForEmail(email, {
      redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
    });
    if (error) throw error;
  });
  auth.signOut.mockReset().mockImplementation(async () => {
    mockSupabase.__emitAuthStateChange('SIGNED_OUT', null);
    return { error: null };
  });
  auth.signInWithOtp.mockReset().mockImplementation(async () => ({ error: null }));
  auth.getSession.mockReset().mockImplementation(async () => ({ data: { session: null }, error: null }));
  auth.onAuthStateChange.mockClear();
  const mockedApi = jest.requireMock('@workspace/api-client-react') as {
    __requestAccountDeletion: jest.Mock;
  };
  mockedApi.__requestAccountDeletion.mockReset().mockImplementation(async () => ({
    confirmationToken: 'signed.confirmation.token',
    expiresAt: '2026-11-12T12:30:00.000Z',
  }));
}

async function openSettings() {
  const view = await render(<SettingsScreen />);
  await waitFor(() => expect(view.getByText('Bei CupCal anmelden')).toBeTruthy());
  await waitFor(() => {
    expect(view.getByTestId('resend-confirmation-button').props.accessibilityLabel)
      .not.toBe('Bestätigungswartezeit wird geladen');
  });
  return view;
}

async function enterCredentials(view: RenderedSettings) {
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.changeText(view.getByTestId('auth-password-input'), 'test-password');
}

beforeEach(() => {
  restoreAuthMocks();
  mockRouteParams.focusAccount = undefined;
  const storageMock = jest.requireMock('@react-native-async-storage/async-storage') as {
    __values: Map<string, string>;
  };
  storageMock.__values.clear();
  sendAccessibilityFocus.mockClear();
  announceForAccessibility.mockClear();
  Dimensions.set({
    window: defaultWindowDimensions,
    screen: defaultScreenDimensions,
  });
});

test('öffnet die Kontoeinstellungen mit Fokus auf der Anmeldeüberschrift', async () => {
  mockRouteParams.focusAccount = 'true';
  const view = await openSettings();

  expect(view.getByText('Bei CupCal anmelden').props.accessibilityRole).toBe('text');
  await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledWith(expect.anything(), 'focus'));
});

test.each([
  ['Anmeldung', 'sign-in'],
  ['Registrierung', 'sign-up'],
  ['Passwortlink', 'forgot-password'],
] as const)('setzt den Screenreader-Fokus nach fehlenden Eingaben bei %s auf die Fehlermeldung', async (_name, mode) => {
  const view = await openSettings();
  if (mode === 'sign-up') {
    await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  } else if (mode === 'forgot-password') {
    await fireEvent.press(view.getByTestId('forgot-password-button'));
  }

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const errorMessage = await view.findByTestId('auth-error-message');
  expect(errorMessage.props.accessible).toBe(true);
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1));
  expect(sendAccessibilityFocus).toHaveBeenCalledWith(expect.anything(), 'focus');
});

test('zeigt den Anmeldestatus und Erfolg nach der Anmeldung', async () => {
  const view = await openSettings();
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const successMessage = await view.findByTestId('auth-success-message');
  expect(successMessage.props.accessibilityRole).toBe('alert');
  expect(successMessage.props.accessibilityLiveRegion).toBe('polite');
  expect(successMessage.props.children).toBe('Du bist angemeldet.');
  expect(view.getByText('Angemeldet')).toBeTruthy();
});

test('beschriftet E-Mail- und Passwortfelder passend zu Anmeldung und Registrierung', async () => {
  const view = await openSettings();
  expect(view.getByTestId('auth-email-input').props.accessibilityLabel).toBe('E-Mail-Adresse');
  expect(view.getByTestId('auth-email-input').props.accessibilityHint).toBe(
    'Gib die E-Mail-Adresse für dein CupCal-Konto ein.',
  );
  expect(view.getByTestId('auth-password-input').props.accessibilityLabel).toBe('Passwort');

  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  expect(view.getByTestId('auth-password-input').props.accessibilityLabel).toBe(
    'Passwort für das neue Konto',
  );
  expect(view.getByTestId('auth-password-input').props.accessibilityHint).toBe(
    'Wähle das Passwort für dein CupCal-Konto.',
  );
  expect(view.getByText('Mindestens 6 Zeichen. Es sind keine weiteren Zeichenregeln erforderlich.')).toBeTruthy();
});

test('zeigt einen Anmeldefehler sichtbar an', async () => {
  auth.signInWithPassword.mockResolvedValue({
    error: new Error('Invalid login credentials'),
  });
  const view = await openSettings();
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const errorMessage = await view.findByTestId('auth-error-message');
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
  expect(errorMessage.props.children).toBe(
    'E-Mail-Adresse oder Passwort stimmen nicht. Prüfe deine Eingaben oder fordere einen neuen Passwort-Link an.',
  );
  await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1));
});

test('zeigt Ladezustand und sperrt die Anmeldeschaltfläche während der Anfrage', async () => {
  let finishSignIn!: (result: { error: null }) => void;
  auth.signInWithPassword.mockImplementation(
    () => new Promise((resolve) => { finishSignIn = resolve; }),
  );
  const view = await openSettings();
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  await waitFor(() => {
    expect(view.getByText('Einen Moment …')).toBeTruthy();
    expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(view.getByTestId('auth-submit-button').props.accessibilityLabel).toBe('Anmeldung läuft');
  });
  expect(sendAccessibilityFocus).not.toHaveBeenCalled();
  await act(async () => finishSignIn({ error: null }));
  expect(await view.findByText('Du bist angemeldet.')).toBeTruthy();
});

test('registriert ein Konto und zeigt die Bestätigungsmeldung', async () => {
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const successMessage = await view.findByTestId('auth-success-message');
  expect(successMessage.props.accessibilityRole).toBe('alert');
  expect(successMessage.props.accessibilityLiveRegion).toBe('polite');
  expect(successMessage.props.children).toBe(
    'Dein Konto ist erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.',
  );
  expect(view.getByTestId('registration-resend-confirmation-button')).toBeTruthy();
  expect(view.getByTestId('auth-password-input').props.value).toBe('');
});

test('verschiebt den Screenreader-Fokus während einer laufenden Registrierung nicht', async () => {
  let finishSignUp!: (result: { data: { session: null }; error: null }) => void;
  auth.signUp.mockImplementation(
    () => new Promise((resolve) => { finishSignUp = resolve; }),
  );
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  await waitFor(() => {
    expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });
  expect(sendAccessibilityFocus).not.toHaveBeenCalled();
  await act(async () => finishSignUp({ data: { session: null }, error: null }));
  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
});

test('blendet den erneuten Versand nach bestätigter Sitzung aus und zeigt das Konto', async () => {
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));
  expect(await view.findByTestId('registration-resend-confirmation-button')).toBeTruthy();

  const confirmedSession = {
    ...testSession,
    user: {
      ...testSession.user,
      email_confirmed_at: '2026-11-14T12:00:00.000Z',
    },
  };
  await act(async () => {
    mockSupabase.__emitAuthStateChange('SIGNED_IN', confirmedSession);
  });

  expect(view.queryByTestId('registration-resend-confirmation-button')).toBeNull();
  expect(view.getByTestId('account-session-status').props.children).toBe('Angemeldet');
  expect(view.getByText('test@example.invalid')).toBeTruthy();
  expect(view.getByTestId('sign-out-button')).toBeTruthy();
});

test('zeigt nach einer Registrierung ohne Bestätigungsbedarf keine erneute Versandaktion', async () => {
  auth.signUp.mockResolvedValue({
    data: { session: testSession },
    error: null,
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText('Dein Konto ist erstellt und du bist angemeldet.')).toBeTruthy();
  expect(view.queryByTestId('registration-resend-confirmation-button')).toBeNull();
});

test('sendet nach geänderter E-Mail-Adresse weiter an die registrierte Adresse', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);
  await fireEvent.press(view.getByTestId('auth-submit-button'));
  await view.findByTestId('registration-resend-confirmation-button');

  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'changed@example.invalid');
  expect(view.getByTestId('auth-email-input').props.value).toBe('changed@example.invalid');
  expect(view.getByText('Der Bestätigungslink wird an test@example.invalid gesendet.')).toBeTruthy();

  await fireEvent.press(view.getByTestId('registration-resend-confirmation-button'));

  expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledWith(
    'test@example.invalid',
    'cupcal-test://auth/confirm',
  );
  expect(await view.findByText(
    'Wenn dein Konto noch nicht bestätigt ist, erhältst du in Kürze einen neuen Bestätigungslink.',
  )).toBeTruthy();
  const resendButton = view.getByTestId('registration-resend-confirmation-button');
  expect(resendButton.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
  expect(view.getByText(/Erneut senden in \d+ Sekunden/)).toBeTruthy();
  await act(async () => {
    view.unmount();
  });
});

test('sperrt erneute Bestätigungsanfragen mit Countdown und gibt sie danach frei', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  const storageMock = jest.requireMock('@react-native-async-storage/async-storage') as {
    __values: Map<string, string>;
  };
  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  const button = view.getByTestId('resend-confirmation-button');
  announceForAccessibility.mockClear();
  jest.useFakeTimers();

  try {
    await fireEvent.press(button);
    await waitFor(() => expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    }));

    expect(view.getByText(
      `Erneut senden in ${ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS} Sekunden`,
    )).toBeTruthy();
    expect(storageMock.__values.get(ACCOUNT_CONFIRMATION_RESEND_AVAILABLE_AT_KEY))
      .toBe(String(Date.now() + ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS * 1000));
    expect(button.props.accessibilityLabel).toBe(
      'Bestätigungslink erneut senden. Die Wartezeit läuft.',
    );
    expect(announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(announceForAccessibility).toHaveBeenNthCalledWith(
      1,
      `Der Bestätigungslink wurde gesendet. Du kannst in ${ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS} Sekunden erneut einen anfordern.`,
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(button.props.accessibilityLabel).toBe(
      'Bestätigungslink erneut senden. Die Wartezeit läuft.',
    );
    expect(announceForAccessibility).toHaveBeenCalledTimes(1);

    await fireEvent.press(button);
    expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS * 1000);
    });

    expect(button.props.accessibilityState).toMatchObject({ disabled: false, busy: false });
    expect(button.props.accessibilityLabel).toBe('Bestätigungslink erneut senden');
    expect(view.getByText('Bestätigungslink erneut senden')).toBeTruthy();
    expect(announceForAccessibility).toHaveBeenCalledTimes(2);
    expect(announceForAccessibility).toHaveBeenNthCalledWith(
      2,
      'Die Wartezeit ist vorbei. Du kannst jetzt einen neuen Bestätigungslink anfordern.',
    );
  } finally {
    await act(async () => {
      view.unmount();
    });
    jest.useRealTimers();
  }
});

test('zeigt einen Fehler beim erneuten Senden direkt nach der Registrierung', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  mockedSupabase.requestEmailConfirmation.mockImplementation(async () => {
    throw new Error('Email rate limit exceeded');
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);
  await fireEvent.press(view.getByTestId('auth-submit-button'));
  await view.findByTestId('registration-resend-confirmation-button');

  await fireEvent.press(view.getByTestId('registration-resend-confirmation-button'));

  expect(await view.findByTestId('auth-error-message')).toBeTruthy();
  expect(view.getByText(
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  )).toBeTruthy();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  expect(view.getByTestId('resend-confirmation-button').props.accessibilityState)
    .toMatchObject({ disabled: false, busy: false });
});

test('zeigt einen Registrierungsfehler sichtbar an', async () => {
  auth.signUp.mockResolvedValue({
    data: { session: null },
    error: new Error('weak password'),
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const errorMessage = await view.findByTestId('auth-error-message');
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
  expect(errorMessage.props.children).toBe(
    'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.',
  );
  await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1));
});

test.each([
  ['Anmeldung', 'sign-in'],
  ['Registrierung', 'sign-up'],
  ['Passwortlink', 'forgot-password'],
] as const)('fokussiert wiederholte Fehler bei %s erneut', async (_name, mode) => {
  const error = new Error(mode === 'sign-up' ? 'weak password' : 'Invalid login credentials');
  if (mode === 'sign-in') {
    auth.signInWithPassword.mockResolvedValue({ error });
  } else if (mode === 'sign-up') {
    auth.signUp.mockResolvedValue({ data: { session: null }, error });
  } else {
    auth.resetPasswordForEmail.mockResolvedValue({ error });
  }

  const view = await openSettings();
  if (mode === 'sign-up') {
    await fireEvent.press(view.getByTestId('auth-mode-toggle'));
    await enterCredentials(view);
  } else if (mode === 'forgot-password') {
    await fireEvent.press(view.getByTestId('forgot-password-button'));
    await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  } else {
    await enterCredentials(view);
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await fireEvent.press(view.getByTestId('auth-submit-button'));
    expect(await view.findByTestId('auth-error-message')).toBeTruthy();
    await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1));
    if (attempt === 1) sendAccessibilityFocus.mockClear();
  }

  expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1);
  if (mode === 'sign-in') expect(auth.signInWithPassword).toHaveBeenCalledTimes(2);
  if (mode === 'sign-up') expect(auth.signUp).toHaveBeenCalledTimes(2);
  if (mode === 'forgot-password') expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
});

test('öffnet den Passwort-zurücksetzen-Modus und fordert den Link mit einer anonymen Erfolgsmeldung an', async () => {
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));

  expect(view.getByText('Passwort zurücksetzen')).toBeTruthy();
  expect(view.queryByTestId('auth-password-input')).toBeNull();
  expect(view.getByTestId('auth-email-input').props.accessibilityHint).toBe(
    'Gib die E-Mail-Adresse für den Wiederherstellungslink ein.',
  );
  await fireEvent.changeText(view.getByTestId('auth-email-input'), ' test@example.invalid ');
  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText(
    'Wenn zu dieser E-Mail ein CupCal-Konto besteht, erhältst du in Kürze einen Wiederherstellungslink. Der Versand kann etwas dauern. Prüfe auch deinen Spam-Ordner.',
  )).toBeTruthy();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.invalid', {
    redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
  });
});

test('hält Eingabe, Rückmeldung und Zurück-Aktion auf kleinem Display erreichbar', async () => {
  const compactDimensions = { width: 320, height: 568, scale: 1, fontScale: 1 };
  Dimensions.set({
    window: compactDimensions,
    screen: compactDimensions,
  });
  const view = await openSettings();
  const scrollView = view.getByTestId('settings-scroll-view');
  const contentStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);

  expect(scrollView.props.scrollEnabled).toBe(true);
  expect(StyleSheet.flatten(scrollView.props.style).flex).toBe(1);
  expect(contentStyle).toMatchObject({
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 24,
  });

  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const compactScreen = within(scrollView);
  expect(compactScreen.getByTestId('auth-email-input')).toBeTruthy();
  expect(compactScreen.getByTestId('auth-success-message')).toBeTruthy();
  expect(compactScreen.getByTestId('auth-mode-toggle')).toBeTruthy();
  expect(compactScreen.getByText('Zurück zur Anmeldung')).toBeTruthy();
});

test('hält Erklärung und Aktionen des Löschdialogs auf kleinem Display erreichbar', async () => {
  const compactDimensions = { width: 320, height: 480, scale: 1, fontScale: 1 };
  Dimensions.set({
    window: compactDimensions,
    screen: compactDimensions,
  });
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);
  expect(await view.findByText('test@example.invalid')).toBeTruthy();

  const scrollView = view.getByTestId('settings-scroll-view');
  const compactScreen = within(scrollView);
  expect(scrollView.props.scrollEnabled).toBe(true);
  expect(StyleSheet.flatten(scrollView.props.style).flex).toBe(1);

  await fireEvent.press(compactScreen.getByTestId('delete-account-button'));
  expect(compactScreen.getByText('Konto wirklich löschen?')).toBeTruthy();
  expect(compactScreen.getByText(
    'Dein Konto und deine gespeicherten Favoriten werden endgültig entfernt. Zuerst senden wir einen Link an deine E-Mail-Adresse. Gelöscht wird erst, wenn du diesen Link öffnest.',
  )).toBeTruthy();

  await fireEvent.scroll(scrollView, {
    nativeEvent: {
      contentOffset: { x: 0, y: 800 },
      contentSize: { width: compactDimensions.width, height: 1280 },
      layoutMeasurement: { width: compactDimensions.width, height: compactDimensions.height },
    },
  });

  expect(compactScreen.getByTestId('delete-account-confirm-button')).toBeTruthy();
  expect(compactScreen.getByText('Bestätigungslink senden')).toBeTruthy();
  expect(compactScreen.getByTestId('delete-account-cancel-button')).toBeTruthy();
  expect(compactScreen.getByText('Abbrechen')).toBeTruthy();

  await fireEvent.press(compactScreen.getByTestId('delete-account-cancel-button'));
  expect(compactScreen.queryByText('Konto wirklich löschen?')).toBeNull();
});

test('hält E-Mail, Absenden und Zurück bei geöffneter Tastatur auf kleinem Display erreichbar', async () => {
  const compactDimensions = { width: 320, height: 568, scale: 1, fontScale: 1 };
  Dimensions.set({
    window: compactDimensions,
    screen: compactDimensions,
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));

  const emailInput = view.getByTestId('auth-email-input');
  await fireEvent(emailInput, 'focus');
  const keyboardVisibleWindow = { ...compactDimensions, height: 320 };
  await act(async () => {
    Dimensions.set({
      window: keyboardVisibleWindow,
      screen: compactDimensions,
    });
  });

  const scrollView = view.getByTestId('settings-scroll-view');
  expect(scrollView.props.scrollEnabled).toBe(true);
  expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
  await fireEvent.scroll(scrollView, {
    nativeEvent: {
      contentOffset: { x: 0, y: 600 },
      contentSize: { width: 320, height: 1000 },
      layoutMeasurement: { width: 320, height: keyboardVisibleWindow.height },
    },
  });

  const compactScreen = within(scrollView);
  expect(compactScreen.getByTestId('auth-email-input')).toBeTruthy();
  expect(compactScreen.getByTestId('auth-submit-button')).toBeTruthy();
  expect(compactScreen.getByTestId('auth-mode-toggle')).toBeTruthy();
  await fireEvent.changeText(compactScreen.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.press(compactScreen.getByTestId('auth-submit-button'));

  expect(await compactScreen.findByTestId('auth-success-message')).toBeTruthy();
  await fireEvent.press(compactScreen.getByTestId('auth-mode-toggle'));
  expect(compactScreen.getByText('Bei CupCal anmelden')).toBeTruthy();
});

test('zeigt einen verständlichen Fehler beim Anfordern des Wiederherstellungslinks', async () => {
  auth.resetPasswordForEmail.mockResolvedValue({
    error: new Error('Email rate limit exceeded'),
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const errorMessage = await view.findByTestId('auth-error-message');
  expect(errorMessage.props.accessible).toBe(true);
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
  expect(errorMessage.props.children).toBe(
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  );
  await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1));
});

test('sendet bei Mehrfachklicks während einer laufenden Wiederherstellung nur eine Anfrage', async () => {
  let finishReset!: (result: { error: null }) => void;
  auth.resetPasswordForEmail.mockImplementation(
    () => new Promise((resolve) => { finishReset = resolve; }),
  );
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));
  await fireEvent.press(view.getByTestId('auth-submit-button'));
  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  await act(async () => finishReset({ error: null }));
  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
});

test('ermöglicht nach einem fehlgeschlagenen Wiederherstellungsversand einen neuen Versuch', async () => {
  auth.resetPasswordForEmail
    .mockResolvedValueOnce({ error: new Error('Email rate limit exceeded') })
    .mockResolvedValueOnce({ error: null });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));
  expect(await view.findByTestId('auth-error-message')).toBeTruthy();
  expect(view.getByTestId('auth-email-input').props.value).toBe('test@example.invalid');
  expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
  });

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText(
    'Wenn zu dieser E-Mail ein CupCal-Konto besteht, erhältst du in Kürze einen Wiederherstellungslink. Der Versand kann etwas dauern. Prüfe auch deinen Spam-Ordner.',
  )).toBeTruthy();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  expect(auth.resetPasswordForEmail).toHaveBeenNthCalledWith(2, 'test@example.invalid', {
    redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
  });
});

test('zeigt den Ladezustand und sperrt die Schaltflächen während der Linkanfrage', async () => {
  let finishReset!: (result: { error: null }) => void;
  auth.resetPasswordForEmail.mockImplementation(
    () => new Promise((resolve) => { finishReset = resolve; }),
  );
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  await waitFor(() => {
    expect(view.getByText('Einen Moment …')).toBeTruthy();
    expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(view.getByTestId('auth-submit-button').props.accessibilityLabel).toBe(
      'Passwortlink wird angefordert',
    );
    expect(view.getByTestId('auth-mode-toggle').props.accessibilityState).toEqual({
      disabled: true,
    });
  });
  expect(sendAccessibilityFocus).not.toHaveBeenCalled();
  await act(async () => finishReset({ error: null }));

  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
  });
});

test('fordert im Kontobereich einen neuen Bestätigungslink an', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), ' test@example.invalid ');

  await fireEvent.press(view.getByTestId('resend-confirmation-button'));

  expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledWith(
    'test@example.invalid',
    'cupcal-test://auth/confirm',
  );
  expect(await view.findByText(
    'Wenn dein Konto noch nicht bestätigt ist, erhältst du in Kürze einen neuen Bestätigungslink.',
  )).toBeTruthy();
});

test('zeigt einen Fehler beim erneuten Anfordern des Bestätigungslinks', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  mockedSupabase.requestEmailConfirmation.mockImplementation(async () => {
    throw new Error('Email rate limit exceeded');
  });
  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await fireEvent.press(view.getByTestId('resend-confirmation-button'));

  expect(await view.findByText(
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  )).toBeTruthy();
});

test('kennzeichnet das erneute Senden des Bestätigungslinks als laufende Anfrage', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  let finishConfirmation!: () => void;
  mockedSupabase.requestEmailConfirmation.mockImplementation(
    () => new Promise<void>((resolve) => {
      finishConfirmation = resolve;
    }),
  );
  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.press(view.getByTestId('resend-confirmation-button'));

  await waitFor(() => {
    expect(view.getByTestId('resend-confirmation-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(view.getByTestId('resend-confirmation-button').props.accessibilityLabel).toBe(
      'Bestätigungslink wird gesendet',
    );
  });
  await act(async () => finishConfirmation());
  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(view.getByTestId('resend-confirmation-button').props.accessibilityState).toMatchObject({
    disabled: true,
    busy: false,
  });
});

test('meldet über die Einstellungsseite ab und zeigt den Erfolg', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);
  expect(await view.findByText('test@example.invalid')).toBeTruthy();

  await fireEvent.press(view.getByTestId('sign-out-button'));

  expect(await view.findByText('Du bist abgemeldet.')).toBeTruthy();
  expect(view.getByText('Bei CupCal anmelden')).toBeTruthy();
});

test('zeigt nach Wiederherstellung einer gespeicherten Sitzung das angemeldete Konto', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);

  expect(await view.findByText('Angemeldet')).toBeTruthy();
  expect(view.getByText('test@example.invalid')).toBeTruthy();
  expect(view.getByTestId('sign-out-button')).toBeTruthy();
});

test('zeigt bei einer beschädigten gespeicherten Sitzung sicher den Anmeldezustand', async () => {
  auth.getSession.mockResolvedValue({
    data: { session: null },
    error: new Error('corrupted stored session'),
  });
  const view = await render(<SettingsScreen />);

  const status = await view.findByTestId('account-session-status');
  expect(status.props.children).toBe('Bei CupCal anmelden');
  expect(view.getByTestId('auth-error-message').props.children).toBe(
    'Die Sitzung konnte nicht geladen werden. Bitte melde dich erneut an.',
  );
  expect(view.queryByTestId('sign-out-button')).toBeNull();
  expect(view.queryByText('Turniertermine importieren')).toBeNull();
});

test.each([
  ['ios', 'angemeldete', testSession, 'Angemeldet'],
  ['ios', 'abgemeldete', null, 'Bei CupCal anmelden'],
  ['android', 'angemeldete', testSession, 'Angemeldet'],
  ['android', 'abgemeldete', null, 'Bei CupCal anmelden'],
] as const)(
  'macht den Prüfhinweis und die %s-%s Sitzung hörbar',
  async (platform, _name, session, finalStatus) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    let finishSessionCheck!: (result: { data: { session: typeof testSession | null }; error: null }) => void;
    auth.getSession.mockImplementation(
      () => new Promise((resolve) => {
        finishSessionCheck = resolve;
      }),
    );

    try {
      const view = await render(<SettingsScreen />);
      const loadingStatus = view.getByTestId('account-session-status');
      expect(loadingStatus.props.accessible).toBe(true);
      expect(loadingStatus.props.accessibilityRole).toBe('text');
      expect(loadingStatus.props.accessibilityLiveRegion).toBe('polite');
      expect(loadingStatus.props.children).toBe('Sitzung wird geprüft …');
      expect(announceForAccessibility).toHaveBeenCalledWith('Sitzung wird geprüft …');

      await act(async () => finishSessionCheck({ data: { session }, error: null }));

      const resolvedStatus = await view.findByTestId('account-session-status');
      expect(resolvedStatus.props.children).toBe(finalStatus);
      expect(resolvedStatus.props.accessible).toBe(true);
      expect(resolvedStatus.props.accessibilityRole).toBe('text');
      expect(resolvedStatus.props.accessibilityLiveRegion).toBe('polite');
      if (session) expect(view.getByText('test@example.invalid')).toBeTruthy();
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenLastCalledWith(
          session ? 'Angemeldet. test@example.invalid' : 'Abgemeldet. Bei CupCal anmelden.',
        );
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

test('macht spätere An- und Abmeldungen im zugänglichen Kontostatus sichtbar', async () => {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  const view = await render(<SettingsScreen />);
  await waitFor(() => {
    expect(view.getByTestId('account-session-status').props.children).toBe('Bei CupCal anmelden');
  });

  await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_IN', testSession));

  const signedInStatus = view.getByTestId('account-session-status');
  expect(signedInStatus.props.children).toBe('Angemeldet');
  expect(signedInStatus.props.accessible).toBe(true);
  expect(signedInStatus.props.accessibilityRole).toBe('text');
  expect(signedInStatus.props.accessibilityLiveRegion).toBe('polite');
  expect(view.getByText('test@example.invalid')).toBeTruthy();

  await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_OUT', null));

  const signedOutStatus = view.getByTestId('account-session-status');
  expect(signedOutStatus.props.children).toBe('Bei CupCal anmelden');
  expect(signedOutStatus.props.accessible).toBe(true);
  expect(signedOutStatus.props.accessibilityRole).toBe('text');
  expect(signedOutStatus.props.accessibilityLiveRegion).toBe('polite');
});

test('kündigt auf iOS echte Sitzungswechsel an, aber keine Token-Erneuerung', async () => {
  const originalPlatformOS = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });

  try {
    auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
    const view = await render(<SettingsScreen />);
    await waitFor(() => {
      expect(view.getByTestId('account-session-status').props.children).toBe('Angemeldet');
    });
    announceForAccessibility.mockClear();

    const refreshedSession = {
      ...testSession,
      access_token: 'refreshed-fake-token',
      expires_in: 7200,
    };
    await act(async () => mockSupabase.__emitAuthStateChange('TOKEN_REFRESHED', refreshedSession));
    expect(view.getByTestId('account-session-status').props.children).toBe('Angemeldet');
    expect(announceForAccessibility).not.toHaveBeenCalled();

    await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_OUT', null));
    expect(view.getByTestId('account-session-status').props.children).toBe('Bei CupCal anmelden');
    expect(announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(announceForAccessibility).toHaveBeenLastCalledWith('Abgemeldet. Bei CupCal anmelden.');

    await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_IN', testSession));
    expect(view.getByTestId('account-session-status').props.children).toBe('Angemeldet');
    expect(announceForAccessibility).toHaveBeenCalledTimes(2);
    expect(announceForAccessibility).toHaveBeenLastCalledWith(
      'Angemeldet. test@example.invalid',
    );
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
  }
});

test('zeigt einen Abmeldefehler sichtbar an', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  auth.signOut.mockResolvedValue({ error: new Error('Abmeldung fehlgeschlagen') });
  const view = await render(<SettingsScreen />);
  expect(await view.findByText('test@example.invalid')).toBeTruthy();

  await fireEvent.press(view.getByTestId('sign-out-button'));

  expect(await view.findByText('Abmeldung fehlgeschlagen')).toBeTruthy();
});

test('fragt vor dem Versand des Kontolöschungslinks ausdrücklich nach', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);
  expect(await view.findByText('test@example.invalid')).toBeTruthy();

  await fireEvent.press(view.getByTestId('delete-account-button'));
  expect(view.getByText('Konto wirklich löschen?')).toBeTruthy();

  await fireEvent.press(view.getByTestId('delete-account-cancel-button'));

  expect(view.queryByText('Konto wirklich löschen?')).toBeNull();
  const mockedApi = jest.requireMock('@workspace/api-client-react') as {
    __requestAccountDeletion: jest.Mock;
  };
  expect(mockedApi.__requestAccountDeletion).not.toHaveBeenCalled();
});

test('sendet nach Bestätigung einen zeitlich befristeten Löschlink an das angemeldete Konto', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);
  expect(await view.findByText('test@example.invalid')).toBeTruthy();

  await fireEvent.press(view.getByTestId('delete-account-button'));
  await fireEvent.press(view.getByTestId('delete-account-confirm-button'));

  expect(await view.findByText(/Bestätigungslink an test@example\.invalid gesendet/)).toBeTruthy();
  expect(auth.signInWithOtp).toHaveBeenCalledWith({
    email: 'test@example.invalid',
    options: {
      emailRedirectTo:
        'cupcal-test://auth/confirm?flow=cupcal-account-deletion&deletion_token=signed.confirmation.token',
      shouldCreateUser: false,
    },
  });
});

test('stellt die Bestätigungsadresse nach einem App-Neustart wieder her und entfernt sie nach Anmeldung', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  const storageMock = jest.requireMock('@react-native-async-storage/async-storage') as {
    __values: Map<string, string>;
  };
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);
  await fireEvent.press(view.getByTestId('auth-submit-button'));
  await view.findByTestId('registration-resend-confirmation-button');
  expect(storageMock.__values.get(PENDING_ACCOUNT_CONFIRMATION_EMAIL_KEY))
    .toBe('test@example.invalid');

  await act(async () => {
    view.unmount();
  });

  const restartedView = await openSettings();
  expect(await restartedView.findByTestId('registration-resend-confirmation-button')).toBeTruthy();
  await fireEvent.changeText(
    restartedView.getByTestId('auth-email-input'),
    'changed@example.invalid',
  );
  await fireEvent.press(restartedView.getByTestId('registration-resend-confirmation-button'));

  expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledWith(
    'test@example.invalid',
    'cupcal-test://auth/confirm',
  );
  expect(await restartedView.findByText(
    'Wenn dein Konto noch nicht bestätigt ist, erhältst du in Kürze einen neuen Bestätigungslink.',
  )).toBeTruthy();

  await act(async () => {
    mockSupabase.__emitAuthStateChange('SIGNED_IN', testSession);
  });
  await waitFor(() => {
    expect(storageMock.__values.has(PENDING_ACCOUNT_CONFIRMATION_EMAIL_KEY)).toBe(false);
  });
  await act(async () => {
    restartedView.unmount();
  });

  const cooldownView = await openSettings();
  await fireEvent.changeText(cooldownView.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.press(cooldownView.getByTestId('resend-confirmation-button'));
  expect(storageMock.__values.has(ACCOUNT_CONFIRMATION_RESEND_AVAILABLE_AT_KEY)).toBe(true);
  await act(async () => cooldownView.unmount());

  const cooldownRestartedView = await openSettings();
  const button = cooldownRestartedView.getByTestId('resend-confirmation-button');
  expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
  expect(cooldownRestartedView.getByText(/Erneut senden in \d+ Sekunden/)).toBeTruthy();

  await fireEvent.press(button);
  expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => {
    cooldownRestartedView.unmount();
  });
});
