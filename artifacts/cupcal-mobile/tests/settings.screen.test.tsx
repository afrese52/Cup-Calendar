import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../app/(tabs)/settings';
import { supabase } from '@/services/supabase';

type AuthListener = (event: string, session: unknown) => void;
type MockAuth = Record<string, any>;
type RenderedSettings = Awaited<ReturnType<typeof render>>;

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/components/KeyboardAwareScrollViewCompat', () => {
  const { View } = require('react-native');
  return { KeyboardAwareScrollViewCompat: View };
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
    requestPasswordReset: jest.fn(),
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

function restoreAuthMocks() {
  auth.signInWithPassword.mockReset().mockImplementation(async () => {
    mockSupabase.__emitAuthStateChange('SIGNED_IN', testSession);
    return { error: null };
  });
  auth.signUp.mockReset().mockImplementation(async () => ({ data: { session: null }, error: null }));
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  mockedSupabase.requestEmailConfirmation.mockReset().mockImplementation(async () => {});
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
  return view;
}

async function enterCredentials(view: RenderedSettings) {
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.changeText(view.getByTestId('auth-password-input'), 'test-password');
}

beforeEach(() => {
  restoreAuthMocks();
});

test('zeigt den Anmeldestatus und Erfolg nach der Anmeldung', async () => {
  const view = await openSettings();
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText('Du bist angemeldet.')).toBeTruthy();
  expect(view.getByText('Angemeldet')).toBeTruthy();
});

test('zeigt einen Anmeldefehler sichtbar an', async () => {
  auth.signInWithPassword.mockResolvedValue({
    error: new Error('Invalid login credentials'),
  });
  const view = await openSettings();
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText(
    'E-Mail-Adresse oder Passwort stimmen nicht. Prüfe deine Eingaben oder fordere einen neuen Passwort-Link an.',
  )).toBeTruthy();
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
    expect(view.getByTestId('auth-submit-button').props.accessibilityState.disabled).toBe(true);
  });
  await act(async () => finishSignIn({ error: null }));
  expect(await view.findByText('Du bist angemeldet.')).toBeTruthy();
});

test('registriert ein Konto und zeigt die Bestätigungsmeldung', async () => {
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText(
    'Dein Konto ist erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.',
  )).toBeTruthy();
  expect(view.getByTestId('auth-password-input').props.value).toBe('');
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

  expect(await view.findByText(
    'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.',
  )).toBeTruthy();
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
