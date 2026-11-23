import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions, Platform, StyleSheet } from 'react-native';
import type { AppStateStatus } from 'react-native';
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
const mockRouteParams: { focusAccount?: string; authMode?: string } = {};
let mockAdminImportAuthorized = false;

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
    getGetAdminImportAccessQueryKey: () => ['/api/v1/admin/import-access'],
    useGetAdminImportAccess: () => ({
      data: mockAdminImportAuthorized
        ? { authorized: true, reason: null }
        : { authorized: false, reason: 'not_admin' },
    }),
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
  const expectedHeading = mockRouteParams.authMode === 'forgot-password'
    ? 'Passwort zurücksetzen'
    : 'Bei CupCal anmelden';
  await waitFor(() => expect(view.getByText(expectedHeading)).toBeTruthy());
  if (mockRouteParams.authMode !== 'forgot-password') {
    await waitFor(() => {
      expect(view.getByTestId('resend-confirmation-button').props.accessibilityLabel)
        .not.toBe('Bestätigungswartezeit wird geladen');
    });
  }
  return view;
}

async function enterCredentials(view: RenderedSettings) {
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.changeText(view.getByTestId('auth-password-input'), 'test-password');
}

beforeEach(() => {
  restoreAuthMocks();
  mockRouteParams.focusAccount = undefined;
  mockRouteParams.authMode = undefined;
  mockAdminImportAuthorized = false;
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

  expect(view.getByText('Bei CupCal anmelden').props.accessibilityRole).toBe('header');
  await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledWith(expect.anything(), 'focus'));
});

test.each(['ios', 'android'] as const)(
  'fokussiert nach jedem Kontomoduswechsel die neue Überschrift auf %s',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });

    try {
      const view = await openSettings();
      const transitions = [
        {
          press: () => fireEvent.press(view.getByTestId('auth-mode-toggle')),
          heading: 'Konto erstellen',
        },
        {
          press: () => fireEvent.press(view.getByTestId('auth-mode-toggle')),
          heading: 'Bei CupCal anmelden',
        },
        {
          press: () => fireEvent.press(view.getByTestId('forgot-password-button')),
          heading: 'Passwort zurücksetzen',
        },
        {
          press: () => fireEvent.press(view.getByTestId('auth-mode-toggle')),
          heading: 'Bei CupCal anmelden',
        },
      ];

      for (const transition of transitions) {
        sendAccessibilityFocus.mockClear();
        await transition.press();

        await waitFor(() => {
          expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1);
        });
        const [focusTarget, focusEvent] = sendAccessibilityFocus.mock.calls[0]!;
        expect(focusEvent).toBe('focus');
        expect((focusTarget as { props?: { testID?: string; children?: string; accessibilityRole?: string } })
          .props).toMatchObject({
          testID: 'account-session-status',
          children: transition.heading,
          accessibilityRole: 'header',
        });
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

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
  sendAccessibilityFocus.mockClear();

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const errorMessage = await view.findByTestId('auth-error-message');
  expect(errorMessage.props.accessible).toBe(true);
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledTimes(1));
  expect(sendAccessibilityFocus).toHaveBeenCalledWith(expect.anything(), 'focus');
});

test.each(['ios', 'android'] as const)(
  'meldet eine erfolgreiche Anmeldung auf %s nur über den Kontostatus an',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });

    try {
      const view = await openSettings();
      await enterCredentials(view);
      announceForAccessibility.mockClear();

      await fireEvent.press(view.getByTestId('auth-submit-button'));

      const successMessage = await view.findByTestId('auth-success-message');
      expect(successMessage.props.accessibilityRole).toBe('text');
      expect(successMessage.props.accessibilityLiveRegion).toBe('none');
      expect(successMessage.props.children).toBe('Du bist angemeldet.');
      expect(view.getByText('Angemeldet')).toBeTruthy();
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(1);
        expect(announceForAccessibility).toHaveBeenCalledWith(
          'Angemeldet. test@example.invalid',
        );
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
        expect(view.getByTestId('account-session-status').props.accessibilityLiveRegion)
          .toBe('polite');
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

test('verbirgt den Terminimport für angemeldete Konten ohne Adminfreigabe', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  mockAdminImportAuthorized = false;

  const view = await render(<SettingsScreen />);

  expect(await view.findByText('Angemeldet')).toBeTruthy();
  await waitFor(() => {
    expect(view.queryByText('Turniertermine importieren')).toBeNull();
  });
});

test('zeigt den Terminimport für freigegebene Admin-Konten', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  mockAdminImportAuthorized = true;

  const view = await render(<SettingsScreen />);

  expect(await view.findByText('Angemeldet')).toBeTruthy();
  expect(await view.findByText('Turniertermine importieren')).toBeTruthy();
  expect(await view.findByText('Google-Suchdaten')).toBeTruthy();
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
  expect(view.getByText(
    'Mindestens 6 Zeichen. CupCal zählt einzelne Unicode-Zeichen: Manche Emojis bestehen aus mehreren Zeichen; Akzentbuchstaben zählen je nach Schreibweise als ein oder zwei Zeichen.',
  )).toBeTruthy();
});

test('weist bei der Registrierung fünf Emojis sichtbar ab und akzeptiert sechs', async () => {
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.changeText(view.getByTestId('auth-password-input'), '😀'.repeat(5));

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText(
    'Das Passwort muss mindestens 6 Zeichen lang sein. CupCal zählt einzelne Unicode-Zeichen: Manche Emojis bestehen aus mehreren Zeichen; Akzentbuchstaben zählen je nach Schreibweise als ein oder zwei Zeichen.',
  )).toBeTruthy();
  expect(auth.signUp).not.toHaveBeenCalled();

  await fireEvent.changeText(view.getByTestId('auth-password-input'), '😀'.repeat(6));
  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText(
    'Dein Konto ist erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.',
  )).toBeTruthy();
  expect(auth.signUp).toHaveBeenCalledWith({
    email: 'test@example.invalid',
    password: '😀'.repeat(6),
    options: { emailRedirectTo: 'cupcal-test://auth/confirm' },
  });
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

test.each([
  ['Anmeldung', 'sign-in'],
  ['Registrierung', 'sign-up'],
] as const)('zeigt bei unbekanntem Fehler der %s keine Supabase-Details und bewahrt Eingaben', async (_name, mode) => {
  const technicalMessage = 'private@example.invalid: unexpected_auth_error at https://auth.example.invalid (HTTP 400)';
  const unknownError = Object.assign(new Error(technicalMessage), {
    code: 'unexpected_auth_error',
    status: 400,
  });
  if (mode === 'sign-in') {
    auth.signInWithPassword.mockResolvedValue({ error: unknownError });
  } else {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: unknownError });
  }

  const view = await openSettings();
  if (mode === 'sign-up') await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const errorMessage = await view.findByTestId('auth-error-message');
  expect(errorMessage.props.children).toBe(
    mode === 'sign-up'
      ? 'Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut.'
      : 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
  );
  expect(errorMessage.props.children).not.toContain('unexpected_auth_error');
  expect(errorMessage.props.children).not.toContain('HTTP 400');
  expect(view.getByTestId('auth-email-input').props.value).toBe('test@example.invalid');
  expect(view.getByTestId('auth-password-input').props.value).toBe('test-password');
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
  sendAccessibilityFocus.mockClear();
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

test('verhindert doppelte Registrierungen bei schnellen Mehrfachklicks und gibt die Schaltfläche danach frei', async () => {
  type SignUpResult = { data: { session: null }; error: null };
  const pendingSignUps: Array<(result: SignUpResult) => void> = [];
  auth.signUp.mockImplementation(
    () => new Promise((resolve) => { pendingSignUps.push(resolve); }),
  );
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  const submitButton = view.getByTestId('auth-submit-button');
  const pressableClick = submitButton.props.onClick as (event: {
    currentTarget: unknown;
    target: unknown;
    nativeEvent: object;
    stopPropagation: () => void;
  }) => void;
  const clickEvent = {
    currentTarget: submitButton,
    target: submitButton,
    nativeEvent: {},
    stopPropagation: jest.fn(),
  };
  await act(async () => {
    pressableClick(clickEvent);
    pressableClick(clickEvent);
    pressableClick(clickEvent);
  });

  expect(auth.signUp).toHaveBeenCalledTimes(1);
  expect(pendingSignUps).toHaveLength(1);
  await waitFor(() => {
    expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(view.getByTestId('auth-submit-button').props.accessibilityLabel).toBe('Registrierung läuft');
  });

  await act(async () => pendingSignUps[0]!({ data: { session: null }, error: null }));
  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  await waitFor(() => {
    expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
    expect(view.getByTestId('auth-submit-button').props.accessibilityLabel).toBe('Konto erstellen');
  });

  await fireEvent.changeText(view.getByTestId('auth-password-input'), 'test-password');
  await fireEvent.press(view.getByTestId('auth-submit-button'));
  expect(auth.signUp).toHaveBeenCalledTimes(2);
  await waitFor(() => {
    expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });

  await act(async () => pendingSignUps[1]!({ data: { session: null }, error: null }));
  await waitFor(() => {
    expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
  });
});

test('zeigt nach bestätigter Registrierung auch nach Abmeldung keine alte Versandaktion', async () => {
  const storageMock = jest.requireMock('@react-native-async-storage/async-storage') as {
    __values: Map<string, string>;
  };
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));
  expect(await view.findByTestId('registration-resend-confirmation-button')).toBeTruthy();
  expect(auth.signUp).toHaveBeenCalledWith({
    email: 'test@example.invalid',
    password: 'test-password',
    options: { emailRedirectTo: 'cupcal-test://auth/confirm' },
  });
  expect(storageMock.__values.get(PENDING_ACCOUNT_CONFIRMATION_EMAIL_KEY))
    .toBe('test@example.invalid');

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
  await waitFor(() => {
    expect(storageMock.__values.has(PENDING_ACCOUNT_CONFIRMATION_EMAIL_KEY)).toBe(false);
  });

  await fireEvent.press(view.getByTestId('sign-out-button'));

  expect(await view.findByText('Du bist abgemeldet.')).toBeTruthy();
  expect(view.getByText('Bei CupCal anmelden')).toBeTruthy();
  expect(view.getByTestId('auth-email-input').props.value).toBe('');
  expect(view.queryByTestId('registration-resend-confirmation-button')).toBeNull();
  expect(view.queryByTestId('confirmation-resend-recipient')).toBeNull();
  expect(storageMock.__values.has(PENDING_ACCOUNT_CONFIRMATION_EMAIL_KEY)).toBe(false);
});

test('behält nach bestätigter Sitzung trotz verspäteter Registrierungsantwort den Anmeldestatus', async () => {
  let finishSignUp!: (result: { data: { session: null }; error: null }) => void;
  auth.signUp.mockImplementation(
    () => new Promise((resolve) => { finishSignUp = resolve; }),
  );
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  await enterCredentials(view);

  await fireEvent.press(view.getByTestId('auth-submit-button'));
  await waitFor(() => expect(finishSignUp).toBeDefined());

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
  expect(view.getByTestId('account-session-status').props.children).toBe('Angemeldet');

  await act(async () => finishSignUp({ data: { session: null }, error: null }));

  expect(view.getByTestId('account-session-status').props.children).toBe('Angemeldet');
  expect(view.getByText('test@example.invalid')).toBeTruthy();
  expect(view.getByText('Du bist angemeldet.')).toBeTruthy();
  expect(view.queryByTestId('registration-resend-confirmation-button')).toBeNull();
  expect(view.getByTestId('sign-out-button')).toBeTruthy();
});

test('zeigt nach einer Registrierung ohne Bestätigungsbedarf keine erneute Versandaktion', async () => {
  auth.signUp.mockResolvedValue({
    data: { session: testSession },
    error: null,
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('auth-mode-toggle'));
  sendAccessibilityFocus.mockClear();
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
  expect(resendButton.props.accessibilityLabel).toMatch(
    /^Bestätigungslink erneut senden\. Gesperrt\. Noch \d+ Sekunden Wartezeit\.$/,
  );
  expect(resendButton.props.accessibilityLiveRegion).toBe('none');
  expect(view.getByText(/Erneut senden in \d+ Sekunden/)).toBeTruthy();
  await act(async () => {
    view.unmount();
  });
});

test.each(['ios', 'android'] as const)(
  'sperrt erneute Bestätigungsanfragen auf %s mit Countdown und gibt sie danach frei',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
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
    sendAccessibilityFocus.mockClear();
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
        `Bestätigungslink erneut senden. Gesperrt. Noch ${ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS} Sekunden Wartezeit.`,
      );
      expect(button.props.accessibilityLiveRegion).toBe('none');
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(1);
        expect(announceForAccessibility).toHaveBeenNthCalledWith(
          1,
          `Der Bestätigungslink wurde gesendet. Du kannst in ${ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS} Sekunden erneut einen anfordern.`,
        );
        expect(view.getByTestId('auth-success-message').props.accessibilityLiveRegion).toBe('none');
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
        expect(view.getByTestId('auth-success-message').props.accessibilityLiveRegion).toBe('polite');
      }

      await act(async () => {
        await jest.advanceTimersByTimeAsync(5000);
      });
      expect(button.props.accessibilityLabel).toBe(
        `Bestätigungslink erneut senden. Gesperrt. Noch ${ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS - 5} Sekunden Wartezeit.`,
      );
      if (platform === 'ios') expect(announceForAccessibility).toHaveBeenCalledTimes(1);
      else expect(announceForAccessibility).not.toHaveBeenCalled();
      expect(sendAccessibilityFocus).not.toHaveBeenCalled();

      await fireEvent.press(button);
      expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS * 1000);
      });

      expect(button.props.accessibilityState).toMatchObject({ disabled: false, busy: false });
      expect(button.props.accessibilityLabel).toBe('Bestätigungslink erneut senden');
      expect(view.getByText('Bestätigungslink erneut senden')).toBeTruthy();
      const completionStatus = view.getByTestId('confirmation-resend-cooldown-status');
      expect(completionStatus.props.children)
        .toBe('Die Wartezeit ist vorbei. Du kannst jetzt einen neuen Bestätigungslink anfordern.');
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(2);
        expect(announceForAccessibility).toHaveBeenNthCalledWith(
          2,
          'Die Wartezeit ist vorbei. Du kannst jetzt einen neuen Bestätigungslink anfordern.',
        );
        expect(completionStatus.props.accessibilityLiveRegion).toBe('none');
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
        expect(completionStatus.props.accessibilityLiveRegion).toBe('polite');
      }
      expect(sendAccessibilityFocus).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5000);
      });
      if (platform === 'ios') expect(announceForAccessibility).toHaveBeenCalledTimes(2);
      else expect(announceForAccessibility).not.toHaveBeenCalled();
      expect(sendAccessibilityFocus).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        view.unmount();
      });
      jest.useRealTimers();
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

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
  sendAccessibilityFocus.mockClear();
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
  ['iOS', 'ios', 'Anmeldung', 'sign-in'],
  ['Android', 'android', 'Anmeldung', 'sign-in'],
  ['iOS', 'ios', 'Registrierung', 'sign-up'],
  ['Android', 'android', 'Registrierung', 'sign-up'],
  ['iOS', 'ios', 'Passwortlink', 'forgot-password'],
  ['Android', 'android', 'Passwortlink', 'forgot-password'],
] as const)(
  '%s fokussiert wiederholte Fehler bei %s erneut, ohne das Ziel zu wechseln',
  async (_platformName, platform, _flowName, mode) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });

    try {
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
      sendAccessibilityFocus.mockClear();

      let firstErrorText: unknown;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await fireEvent.press(view.getByTestId('auth-submit-button'));
        const errorMessage = await view.findByTestId('auth-error-message');
        expect(errorMessage.props.accessible).toBe(true);
        expect(errorMessage.props.accessibilityRole).toBe('alert');
        expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
        await waitFor(() => expect(sendAccessibilityFocus).toHaveBeenCalledTimes(attempt));
        const [focusTarget, focusEvent] = sendAccessibilityFocus.mock.calls[attempt - 1]!;
        expect(focusEvent).toBe('focus');
        expect((focusTarget as { props?: { testID?: string } } | null)?.props?.testID)
          .toBe('auth-error-message');
        if (attempt === 1) {
          firstErrorText = errorMessage.props.children;
        } else {
          expect(errorMessage.props.children).toBe(firstErrorText);
        }
      }

      expect(sendAccessibilityFocus).toHaveBeenCalledTimes(2);
      if (mode === 'sign-in') expect(auth.signInWithPassword).toHaveBeenCalledTimes(2);
      if (mode === 'sign-up') expect(auth.signUp).toHaveBeenCalledTimes(2);
      if (mode === 'forgot-password') expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

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

test('öffnet nach einem abgelaufenen Reset direkt die Linkanfrage und sendet an die Reset-Rücksprungadresse', async () => {
  mockRouteParams.authMode = 'forgot-password';
  mockRouteParams.focusAccount = 'true';
  const view = await openSettings();

  expect(view.getByText('Passwort zurücksetzen')).toBeTruthy();
  expect(view.queryByTestId('auth-password-input')).toBeNull();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.invalid', {
    redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
  });
});

test('zeigt im direkt geöffneten Wiederherstellungsmodus den Fehler einer neuen Linkanfrage verständlich an', async () => {
  mockRouteParams.authMode = 'forgot-password';
  auth.resetPasswordForEmail.mockResolvedValue({
    error: new Error('Email rate limit exceeded'),
  });
  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const errorMessage = await view.findByTestId('auth-error-message');
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.children).toBe(
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  );
});

test('hält Wiederherstellungsfehler und Aktionen bei 200 Prozent Schrift auf kleinem Display lesbar', async () => {
  const compactDimensions = { width: 320, height: 480, scale: 1, fontScale: 2 };
  Dimensions.set({
    window: compactDimensions,
    screen: compactDimensions,
  });
  mockRouteParams.authMode = 'forgot-password';
  auth.resetPasswordForEmail.mockResolvedValue({
    error: new Error('Email rate limit exceeded'),
  });

  const view = await openSettings();
  const scrollView = view.getByTestId('settings-scroll-view');
  const compactScreen = within(scrollView);
  await fireEvent.changeText(compactScreen.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.press(compactScreen.getByTestId('auth-submit-button'));

  const errorMessage = await compactScreen.findByTestId('auth-error-message');
  const emailInput = compactScreen.getByTestId('auth-email-input');
  const submitButton = compactScreen.getByTestId('auth-submit-button');
  const submitLabel = compactScreen.getByText('Link anfordern');
  const backButton = compactScreen.getByTestId('auth-mode-toggle');
  const backLabel = compactScreen.getByText('Zurück zur Anmeldung');

  expect(Dimensions.get('window').fontScale).toBe(2);
  expect(scrollView.props.scrollEnabled).toBe(true);
  expect(StyleSheet.flatten(scrollView.props.style).flex).toBe(1);
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.allowFontScaling).not.toBe(false);
  expect(errorMessage.props.numberOfLines).toBeUndefined();
  expect(errorMessage.props.ellipsizeMode).toBeUndefined();
  expect(StyleSheet.flatten(errorMessage.props.style).lineHeight).toBeUndefined();
  expect(emailInput).toBeTruthy();
  expect(submitButton).toBeTruthy();
  expect(backButton).toBeTruthy();
  expect(StyleSheet.flatten(submitLabel.props.style)).toMatchObject({
    width: '100%',
    flexShrink: 1,
    textAlign: 'center',
  });
  expect(submitLabel.props.allowFontScaling).not.toBe(false);
  expect(submitLabel.props.numberOfLines).toBeUndefined();
  expect(submitLabel.props.ellipsizeMode).toBeUndefined();
  expect(backLabel.props.allowFontScaling).not.toBe(false);
  expect(backLabel.props.numberOfLines).toBeUndefined();
  expect(backLabel.props.ellipsizeMode).toBeUndefined();

  await fireEvent.scroll(scrollView, {
    nativeEvent: {
      contentOffset: { x: 0, y: 600 },
      contentSize: { width: compactDimensions.width, height: 1200 },
      layoutMeasurement: { width: compactDimensions.width, height: compactDimensions.height },
    },
  });

  expect(compactScreen.getByTestId('auth-email-input')).toBeTruthy();
  expect(compactScreen.getByTestId('auth-error-message')).toBeTruthy();
  expect(compactScreen.getByTestId('auth-submit-button')).toBeTruthy();
  expect(compactScreen.getByTestId('auth-mode-toggle')).toBeTruthy();
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

test('hält Erklärung und Aktionen des Löschdialogs bei großer Schrift erreichbar', async () => {
  const compactDimensions = { width: 320, height: 480, scale: 1, fontScale: 2 };
  Dimensions.set({
    window: compactDimensions,
    screen: compactDimensions,
  });
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);
  expect(await view.findByText('test@example.invalid')).toBeTruthy();

  const scrollView = view.getByTestId('settings-scroll-view');
  const compactScreen = within(scrollView);
  expect(Dimensions.get('window').fontScale).toBe(2);
  expect(scrollView.props.scrollEnabled).toBe(true);
  expect(StyleSheet.flatten(scrollView.props.style).flex).toBe(1);

  await fireEvent.press(compactScreen.getByTestId('delete-account-button'));
  const title = compactScreen.getByText('Konto wirklich löschen?');
  const description = compactScreen.getByTestId('delete-account-confirmation-description');
  expect(title).toBeTruthy();
  expect(description.props.allowFontScaling).not.toBe(false);
  expect(description.props.numberOfLines).toBeUndefined();
  expect(description.props.ellipsizeMode).toBeUndefined();
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
  const confirmLabel = compactScreen.getByText('Bestätigungslink senden');
  const cancelButton = compactScreen.getByTestId('delete-account-cancel-button');
  const cancelLabel = compactScreen.getByText('Abbrechen');
  expect(confirmLabel.props.allowFontScaling).not.toBe(false);
  expect(confirmLabel.props.numberOfLines).toBeUndefined();
  expect(confirmLabel.props.ellipsizeMode).toBeUndefined();
  expect(cancelButton).toBeTruthy();
  expect(cancelLabel.props.allowFontScaling).not.toBe(false);
  expect(cancelLabel.props.numberOfLines).toBeUndefined();
  expect(cancelLabel.props.ellipsizeMode).toBeUndefined();

  await fireEvent.press(cancelButton);
  expect(compactScreen.queryByText('Konto wirklich löschen?')).toBeNull();
});

test('hält Wiederherstellungsaktionen bei großer Schrift und geöffneter Tastatur erreichbar', async () => {
  const compactDimensions = { width: 320, height: 568, scale: 1, fontScale: 2 };
  Dimensions.set({
    window: compactDimensions,
    screen: compactDimensions,
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));

  const focusedEmailInput = view.getByTestId('auth-email-input');
  await fireEvent(focusedEmailInput, 'focus');
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
  const emailInput = compactScreen.getByTestId('auth-email-input');
  const submitButton = compactScreen.getByTestId('auth-submit-button');
  const backButton = compactScreen.getByTestId('auth-mode-toggle');
  const submitLabel = compactScreen.getByText('Link anfordern');
  expect(emailInput).toBeTruthy();
  expect(submitButton).toBeTruthy();
  expect(backButton).toBeTruthy();
  expect(emailInput.props.allowFontScaling).not.toBe(false);
  expect(StyleSheet.flatten(emailInput.props.style).height).toBeUndefined();
  expect(submitLabel.props.allowFontScaling).not.toBe(false);
  expect(submitLabel.props.numberOfLines).toBeUndefined();
  expect(submitLabel.props.ellipsizeMode).toBeUndefined();
  expect(backButton.props.accessibilityState?.disabled).not.toBe(true);
  expect(StyleSheet.flatten(compactScreen.getByText('Zurück zur Anmeldung').props.style))
    .toMatchObject({ width: '100%', flexShrink: 1, textAlign: 'center' });
  expect(compactScreen.getByText('Zurück zur Anmeldung').props.numberOfLines).toBeUndefined();
  expect(compactScreen.getByText('Zurück zur Anmeldung').props.ellipsizeMode).toBeUndefined();
  await fireEvent.changeText(compactScreen.getByTestId('auth-email-input'), 'test@example.invalid');
  await fireEvent.press(submitButton);

  expect(await compactScreen.findByTestId('auth-success-message')).toBeTruthy();
  await fireEvent.press(backButton);
  expect(compactScreen.getByText('Bei CupCal anmelden')).toBeTruthy();
});

test('zeigt einen verständlichen Fehler beim Anfordern des Wiederherstellungslinks', async () => {
  auth.resetPasswordForEmail.mockResolvedValue({
    error: new Error('Email rate limit exceeded'),
  });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  sendAccessibilityFocus.mockClear();

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
  sendAccessibilityFocus.mockClear();

  const submitButton = view.getByTestId('auth-submit-button');
  const target = {};
  await act(async () => {
    const click = submitButton.props.onClick as (event: {
      currentTarget: object;
      target: object;
    }) => void;
    click({ currentTarget: target, target });
    click({ currentTarget: target, target });
    click({ currentTarget: target, target });
  });

  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  await act(async () => finishReset({ error: null }));
  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
});

test('sperrt die E-Mail-Adresse während einer laufenden Wiederherstellungsanfrage', async () => {
  let finishReset!: (result: { error: null }) => void;
  auth.resetPasswordForEmail.mockImplementation(
    () => new Promise((resolve) => { finishReset = resolve; }),
  );
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'original@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  const emailInput = view.getByTestId('auth-email-input');
  expect(emailInput.props.editable).toBe(false);
  expect(emailInput.props.accessibilityHint).toBe(
    'Die Adresse kann während der Linkanfrage nicht geändert werden.',
  );
  await fireEvent.changeText(emailInput, 'changed@example.invalid');
  expect(view.getByTestId('auth-email-input').props.value).toBe('original@example.invalid');
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('original@example.invalid', {
    redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
  });

  await act(async () => finishReset({ error: null }));

  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(view.getByTestId('auth-email-input').props.value).toBe('original@example.invalid');
});

test('ermöglicht nach einem fehlgeschlagenen Wiederherstellungsversand einen neuen Versuch', async () => {
  auth.resetPasswordForEmail
    .mockRejectedValueOnce(new Error('Email rate limit exceeded'))
    .mockResolvedValueOnce({ error: null });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), '  test@example.invalid  ');

  await fireEvent.press(view.getByTestId('auth-submit-button'));
  expect(await view.findByTestId('auth-error-message')).toBeTruthy();
  expect(view.getByTestId('auth-email-input').props.value).toBe('  test@example.invalid  ');
  expect(view.getByTestId('auth-submit-button').props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
  });

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByText(
    'Wenn zu dieser E-Mail ein CupCal-Konto besteht, erhältst du in Kürze einen Wiederherstellungslink. Der Versand kann etwas dauern. Prüfe auch deinen Spam-Ordner.',
  )).toBeTruthy();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  expect(auth.resetPasswordForEmail).toHaveBeenNthCalledWith(1, 'test@example.invalid', {
    redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
  });
  expect(auth.resetPasswordForEmail).toHaveBeenNthCalledWith(2, 'test@example.invalid', {
    redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
  });
});

test('entfernt den veralteten Wiederherstellungsfehler beim Ändern der E-Mail-Adresse', async () => {
  auth.resetPasswordForEmail
    .mockResolvedValueOnce({ error: new Error('Email rate limit exceeded') })
    .mockResolvedValueOnce({ error: null });
  const view = await openSettings();
  await fireEvent.press(view.getByTestId('forgot-password-button'));
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'old@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));
  expect(await view.findByTestId('auth-error-message')).toBeTruthy();

  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'new@example.invalid');
  expect(view.queryByTestId('auth-error-message')).toBeNull();
  expect(view.getByTestId('auth-email-input').props.value).toBe('new@example.invalid');

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(auth.resetPasswordForEmail).toHaveBeenNthCalledWith(1, 'old@example.invalid', {
    redirectTo: 'cupcal-test://auth/reset?flow=cupcal-password-reset',
  });
  expect(auth.resetPasswordForEmail).toHaveBeenNthCalledWith(2, 'new@example.invalid', {
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
  sendAccessibilityFocus.mockClear();

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

test('hält die aktuelle Wartezeit bei fehlgeschlagenem Speichern nach erfolgreichem Versand ein', async () => {
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  const storageMock = jest.requireMock('@react-native-async-storage/async-storage') as {
    default: {
      setItem: {
        mockImplementationOnce: (implementation: () => Promise<void>) => unknown;
      };
    };
  };
  storageMock.default.setItem.mockImplementationOnce(async () => {
    throw new Error('Speicher nicht verfügbar');
  });

  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  const button = view.getByTestId('resend-confirmation-button');
  jest.useFakeTimers();

  try {
    await fireEvent.press(button);

    expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(1);
    expect(await view.findByText(
      'Die Anfrage wurde gesendet, aber die Wartezeit konnte auf diesem Gerät nicht gespeichert werden. Serverseitige Versandlimits gelten weiterhin.',
    )).toBeTruthy();
    expect(view.getByText(
      `Erneut senden in ${ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS} Sekunden`,
    )).toBeTruthy();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
    expect(button.props.accessibilityLabel).toMatch(
      /^Bestätigungslink erneut senden\. Gesperrt\. Noch \d+ Sekunden Wartezeit\.$/,
    );

    await fireEvent.press(button);
    expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      view.unmount();
    });
    jest.useRealTimers();
  }
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
  mockedSupabase.requestEmailConfirmation.mockImplementationOnce(async () => {
    throw new Error('Email rate limit exceeded');
  });
  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await fireEvent.press(view.getByTestId('resend-confirmation-button'));

  expect(await view.findByText(
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  )).toBeTruthy();

  await fireEvent.press(view.getByTestId('resend-confirmation-button'));

  expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(2);
  expect(await view.findByText(
    'Wenn dein Konto noch nicht bestätigt ist, erhältst du in Kürze einen neuen Bestätigungslink.',
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
  await fireEvent.press(view.getByTestId('resend-confirmation-button'));

  expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(1);

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

test.each(['ios', 'android'] as const)(
  'meldet über die Einstellungsseite auf %s ab und kündigt den Status nur einmal an',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });

    try {
      auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
      const view = await render(<SettingsScreen />);
      expect(await view.findByText('test@example.invalid')).toBeTruthy();
      announceForAccessibility.mockClear();

      await fireEvent.press(view.getByTestId('sign-out-button'));

      const successMessage = await view.findByTestId('auth-success-message');
      expect(successMessage.props.children).toBe('Du bist abgemeldet.');
      expect(successMessage.props.accessibilityRole).toBe('text');
      expect(successMessage.props.accessibilityLiveRegion).toBe('none');
      expect(view.getByText('Bei CupCal anmelden')).toBeTruthy();
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(1);
        expect(announceForAccessibility).toHaveBeenCalledWith(
          'Abgemeldet. Bei CupCal anmelden.',
        );
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
        expect(view.getByTestId('account-session-status').props.accessibilityLiveRegion)
          .toBe('polite');
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

test('zeigt nach Wiederherstellung einer gespeicherten Sitzung das angemeldete Konto', async () => {
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);

  expect(await view.findByText('Angemeldet')).toBeTruthy();
  expect(view.getByText('test@example.invalid')).toBeTruthy();
  expect(view.getByTestId('sign-out-button')).toBeTruthy();
});

test('behält beim Start den Kontostatus nach einem Refresh-Ausfall und zeigt die spätere Erneuerung', async () => {
  // Supabase liefert nach einem fehlgeschlagenen vorzeitigen Refresh weiterhin
  // die lokal gespeicherte Sitzung, solange deren Zugriffstoken noch gültig ist.
  auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
  const view = await render(<SettingsScreen />);

  expect(await view.findByTestId('account-session-status')).toMatchObject({
    props: { children: 'Angemeldet' },
  });
  expect(view.getByText('test@example.invalid')).toBeTruthy();
  expect(view.queryByTestId('auth-error-message')).toBeNull();

  const renewedSession = {
    ...testSession,
    access_token: 'recovered-access-token',
    refresh_token: 'recovered-refresh-token',
  };
  await act(async () => mockSupabase.__emitAuthStateChange('TOKEN_REFRESHED', renewedSession));

  expect(view.getByTestId('account-session-status').props.children).toBe('Angemeldet');
  expect(view.getByText('test@example.invalid')).toBeTruthy();
  expect(view.getByTestId('sign-out-button')).toBeTruthy();
  expect(view.queryByTestId('auth-error-message')).toBeNull();
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
      expect(loadingStatus.props.accessibilityLiveRegion).toBe(
        platform === 'android' ? 'polite' : 'none',
      );
      expect(loadingStatus.props.children).toBe('Sitzung wird geprüft …');
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(1);
        expect(announceForAccessibility).toHaveBeenCalledWith('Sitzung wird geprüft …');
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
      }

      await act(async () => finishSessionCheck({ data: { session }, error: null }));

      const resolvedStatus = await view.findByTestId('account-session-status');
      expect(resolvedStatus.props.children).toBe(finalStatus);
      expect(resolvedStatus.props.accessible).toBe(true);
      expect(resolvedStatus.props.accessibilityRole)
        .toBe(finalStatus === 'Bei CupCal anmelden' ? 'header' : 'text');
      expect(resolvedStatus.props.accessibilityLiveRegion).toBe(
        platform === 'android' ? 'polite' : 'none',
      );
      if (session) expect(view.getByText('test@example.invalid')).toBeTruthy();
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(2);
        expect(announceForAccessibility).toHaveBeenLastCalledWith(
          session ? 'Angemeldet. test@example.invalid' : 'Abgemeldet. Bei CupCal anmelden.',
        );
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

test.each(['ios', 'android'] as const)(
  'kündigt spätere An- und Abmeldungen auf %s genau einmal ohne Fokusverschiebung an',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });

    try {
      auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      const view = await render(<SettingsScreen />);
      await waitFor(() => {
        expect(view.getByTestId('account-session-status').props.children).toBe('Bei CupCal anmelden');
      });
      announceForAccessibility.mockClear();
      sendAccessibilityFocus.mockClear();

      await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_IN', testSession));

      const signedInStatus = view.getByTestId('account-session-status');
      expect(signedInStatus.props.children).toBe('Angemeldet');
      expect(signedInStatus.props.accessible).toBe(true);
      expect(signedInStatus.props.accessibilityRole).toBe('text');
      expect(signedInStatus.props.accessibilityLiveRegion).toBe(
        platform === 'android' ? 'polite' : 'none',
      );
      expect(view.getByText('test@example.invalid')).toBeTruthy();

      await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_OUT', null));

      const signedOutStatus = view.getByTestId('account-session-status');
      expect(signedOutStatus.props.children).toBe('Bei CupCal anmelden');
      expect(signedOutStatus.props.accessible).toBe(true);
      expect(signedOutStatus.props.accessibilityRole).toBe('header');
      expect(signedOutStatus.props.accessibilityLiveRegion).toBe(
        platform === 'android' ? 'polite' : 'none',
      );
      expect(sendAccessibilityFocus).not.toHaveBeenCalled();
      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(2);
        expect(announceForAccessibility).toHaveBeenNthCalledWith(
          1,
          'Angemeldet. test@example.invalid',
        );
        expect(announceForAccessibility).toHaveBeenNthCalledWith(
          2,
          'Abgemeldet. Bei CupCal anmelden.',
        );
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

test('kündigt auf iOS echte Sitzungswechsel an, aber keine Token-Erneuerung oder doppelte Anmeldung', async () => {
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

    const duplicateSignInSession = {
      ...testSession,
      access_token: 'another-refreshed-fake-token',
      expires_in: 10800,
    };
    await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_IN', duplicateSignInSession));

    const status = view.getByTestId('account-session-status');
    expect(status.props.children).toBe('Angemeldet');
    expect(status.props.accessible).toBe(true);
    expect(status.props.accessibilityRole).toBe('text');
    expect(status.props.accessibilityLiveRegion).toBe('none');
    expect(status.props.accessibilityLabel).toBe('Angemeldet. test@example.invalid');
    expect(view.getByText('test@example.invalid')).toBeTruthy();
    expect(announceForAccessibility).toHaveBeenCalledTimes(2);
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
  }
});

test.each(['ios', 'android'] as const)(
  'macht einen direkten Kontowechsel auf %s mit der neuen Adresse zugänglich',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });

    try {
      auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
      const view = await render(<SettingsScreen />);
      await waitFor(() => {
        expect(view.getByTestId('account-session-status').props.accessibilityLabel)
          .toBe('Angemeldet. test@example.invalid');
      });
      announceForAccessibility.mockClear();

      const nextAccount = {
        ...testSession,
        user: { id: 'second-user', email: 'second@example.invalid' },
      };
      await act(async () => mockSupabase.__emitAuthStateChange('SIGNED_IN', nextAccount));

      const status = view.getByTestId('account-session-status');
      expect(status.props.children).toBe('Angemeldet');
      expect(status.props.accessible).toBe(true);
      expect(status.props.accessibilityRole).toBe('text');
      expect(status.props.accessibilityLiveRegion).toBe(
        platform === 'android' ? 'polite' : 'none',
      );
      expect(status.props.accessibilityLabel).toBe('Angemeldet. second@example.invalid');
      expect(view.getByText('second@example.invalid')).toBeTruthy();
      expect(view.queryByText('test@example.invalid')).toBeNull();

      if (platform === 'ios') {
        expect(announceForAccessibility).toHaveBeenCalledTimes(1);
        expect(announceForAccessibility).toHaveBeenCalledWith(
          'Angemeldet. second@example.invalid',
        );
      } else {
        expect(announceForAccessibility).not.toHaveBeenCalled();
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

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

test.each(['ios', 'android'] as const)(
  'macht Bestätigung, Abbruch und laufende Löschlinkanfrage auf %s zugänglich',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    let finishDeletionRequest!: (result: {
      confirmationToken: string;
      expiresAt: string;
    }) => void;
    const mockedApi = jest.requireMock('@workspace/api-client-react') as {
      __requestAccountDeletion: jest.Mock;
    };
    mockedApi.__requestAccountDeletion.mockImplementation(
      () => new Promise((resolve) => {
        finishDeletionRequest = resolve;
      }),
    );

    try {
      auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
      const view = await render(<SettingsScreen />);
      expect(await view.findByText('test@example.invalid')).toBeTruthy();
      announceForAccessibility.mockClear();

      await fireEvent.press(view.getByTestId('delete-account-button'));
      const title = view.getByTestId('delete-account-confirmation-title');
      const description = view.getByTestId('delete-account-confirmation-description');
      const confirmButton = view.getByTestId('delete-account-confirm-button');
      const cancelButton = view.getByTestId('delete-account-cancel-button');
      expect(title.props.accessible).toBe(true);
      expect(title.props.accessibilityRole).toBe('header');
      expect(description.props.accessible).toBe(true);
      expect(description.props.accessibilityRole).toBe('text');
      expect(confirmButton.props.accessibilityRole).toBe('button');
      expect(confirmButton.props.accessibilityLabel).toBe('Bestätigungslink senden');
      expect(confirmButton.props.accessibilityHint).toContain('erst gelöscht');
      expect(cancelButton.props.accessibilityRole).toBe('button');
      expect(cancelButton.props.accessibilityLabel).toBe('Abbrechen');
      expect(cancelButton.props.accessibilityHint).toContain('ohne einen Link');
      expect(announceForAccessibility).toHaveBeenCalledWith(
        'Konto wirklich löschen? Dein Konto und deine gespeicherten Favoriten werden endgültig entfernt. Bestätigungslink senden oder Abbrechen.',
      );

      await fireEvent.press(cancelButton);
      expect(view.queryByTestId('delete-account-confirmation-title')).toBeNull();
      expect(announceForAccessibility).toHaveBeenLastCalledWith(
        'Abgebrochen. Es wurde kein Bestätigungslink angefordert.',
      );
      expect(mockedApi.__requestAccountDeletion).not.toHaveBeenCalled();

      await fireEvent.press(view.getByTestId('delete-account-button'));
      const rapidPressButton = view.getByTestId('delete-account-confirm-button');
      await act(async () => {
        rapidPressButton.props.onClick();
        rapidPressButton.props.onClick();
      });
      const pendingButton = view.getByTestId('delete-account-confirm-button');
      expect(mockedApi.__requestAccountDeletion).toHaveBeenCalledTimes(1);
      expect(pendingButton.props.accessibilityLabel).toBe('Bestätigungslink wird angefordert');
      expect(pendingButton.props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true,
      });
      expect(announceForAccessibility).toHaveBeenLastCalledWith(
        'Die Anfrage für den Bestätigungslink läuft.',
      );

      await act(async () => finishDeletionRequest({
        confirmationToken: 'signed.confirmation.token',
        expiresAt: '2026-11-12T12:30:00.000Z',
      }));
      expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
      const successMessage = await view.findByTestId('auth-success-message');
      expect(successMessage.props.accessible).toBe(true);
      expect(successMessage.props.accessibilityRole).toBe('alert');
      expect(successMessage.props.accessibilityLiveRegion).toBe('polite');
      expect(successMessage.props.children).toMatch(/Bestätigungslink an test@example\.invalid gesendet/);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

test.each(['ios', 'android'] as const)(
  'macht einen Fehler beim Anfordern des Kontolöschlinks auf %s hörbar',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    try {
      auth.getSession.mockResolvedValue({ data: { session: testSession }, error: null });
      auth.signInWithOtp
        .mockResolvedValueOnce({ error: new Error('Mailversand nicht verfügbar') })
        .mockResolvedValueOnce({ error: null });
      const view = await render(<SettingsScreen />);
      expect(await view.findByText('test@example.invalid')).toBeTruthy();
      await fireEvent.press(view.getByTestId('delete-account-button'));
      await fireEvent.press(view.getByTestId('delete-account-confirm-button'));

      const errorMessage = await view.findByTestId('auth-error-message');
      expect(errorMessage.props.accessible).toBe(true);
      expect(errorMessage.props.accessibilityRole).toBe('alert');
      expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
      expect(errorMessage.props.children).toContain('Mailversand nicht verfügbar');

      expect(view.getByTestId('delete-account-confirmation-title')).toBeTruthy();
      const retryButton = view.getByTestId('delete-account-confirm-button');
      expect(retryButton.props.accessibilityState).toMatchObject({
        disabled: false,
        busy: false,
      });
      await fireEvent.press(retryButton);
      expect(await view.findByText(/Bestätigungslink an test@example\.invalid gesendet/)).toBeTruthy();
      expect(view.queryByTestId('delete-account-confirmation-title')).toBeNull();
      expect(auth.signInWithOtp).toHaveBeenCalledTimes(2);
      const mockedApi = jest.requireMock('@workspace/api-client-react') as {
        __requestAccountDeletion: jest.Mock;
      };
      expect(mockedApi.__requestAccountDeletion).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  },
);

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
  expect(button.props.accessibilityLabel).toMatch(
    /^Bestätigungslink erneut senden\. Gesperrt\. Noch \d+ Sekunden Wartezeit\.$/,
  );
  expect(cooldownRestartedView.getByText(/Erneut senden in \d+ Sekunden/)).toBeTruthy();

  await fireEvent.press(button);
  expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => {
    cooldownRestartedView.unmount();
  });
});

test('berechnet die Bestätigungswartezeit nach einer längeren App-Pause neu', async () => {
  let notifyAppStateChange: ((state: AppStateStatus) => void) | undefined;
  const mockedSupabase = jest.requireMock('@/services/supabase') as {
    requestEmailConfirmation: jest.Mock;
  };
  const appStateSubscription = { remove: jest.fn() };
  const addAppStateListener = jest.spyOn(AppState, 'addEventListener').mockImplementation(
    (event, listener) => {
      if (event === 'change') {
        notifyAppStateChange = listener;
      }
      return appStateSubscription;
    },
  );
  const view = await openSettings();
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');
  jest.useFakeTimers();

  try {
    await fireEvent.press(view.getByTestId('resend-confirmation-button'));
    expect(await view.findByText(
      `Erneut senden in ${ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS} Sekunden`,
    )).toBeTruthy();
    expect(notifyAppStateChange).toBeDefined();

    await act(async () => {
      notifyAppStateChange?.('background');
      jest.setSystemTime(Date.now() + 20_000);
      notifyAppStateChange?.('active');
    });

    expect(view.getByText('Erneut senden in 10 Sekunden')).toBeTruthy();
    expect(view.getByTestId('resend-confirmation-button').props.accessibilityState)
      .toMatchObject({ disabled: true, busy: false });

    announceForAccessibility.mockClear();
    await act(async () => {
      notifyAppStateChange?.('background');
      jest.setSystemTime(Date.now() + 11_000);
      notifyAppStateChange?.('active');
    });

    const button = view.getByTestId('resend-confirmation-button');
    expect(view.queryByText(/Erneut senden in \d+ Sekunden/)).toBeNull();
    expect(button.props.accessibilityState).toMatchObject({ disabled: false, busy: false });
    expect(announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(announceForAccessibility).toHaveBeenLastCalledWith(
      'Die Wartezeit ist vorbei. Du kannst jetzt einen neuen Bestätigungslink anfordern.',
    );

    await act(async () => {
      notifyAppStateChange?.('active');
    });
    expect(announceForAccessibility).toHaveBeenCalledTimes(1);
    await fireEvent.press(button);
    expect(mockedSupabase.requestEmailConfirmation).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => {
      view.unmount();
    });
    addAppStateListener.mockRestore();
    jest.useRealTimers();
  }
});
