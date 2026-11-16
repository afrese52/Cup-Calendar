import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { AccessibilityInfo, Alert, Platform } from 'react-native';

const mockSaveNewPassword = jest.fn(async (_password: string) => {});
let mockRecoveryPending = true;
let mockPreventRemoveEnabled = false;
let mockPreventRemoveCallback: ((options: { data: { action: unknown }; repeat: () => void }) => void) | undefined;
const mockUsePreventRemove = jest.fn(
  (preventRemove: boolean, callback?: (options: { data: { action: unknown }; repeat: () => void }) => void) => {
    mockPreventRemoveEnabled = preventRemove;
    mockPreventRemoveCallback = callback;
    return jest.fn();
  },
);

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: () => ({ remove: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  usePreventRemove: mockUsePreventRemove,
}));
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
    destructive: '#c00',
    accent: '#def',
    border: '#ddd',
    input: '#fff',
  }),
}));
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: { id: 'account-id' } } },
        error: null,
      })),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
  isPasswordRecoveryPending: () => mockRecoveryPending,
  markPasswordRecoverySession: jest.fn(),
  handlePasswordResetUrl: jest.fn(async () => false),
  PASSWORD_MIN_LENGTH: 6,
  saveNewPassword: mockSaveNewPassword,
  friendlyAuthError: (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code).toLowerCase()
        : '';
    if (message.includes('network')) {
      return 'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.';
    }
    if (
      code === 'over_request_rate_limit' ||
      code === 'over_email_send_rate_limit' ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      (typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error as { status?: unknown }).status === 429)
    ) {
      const retryAfter =
        typeof error === 'object' && error !== null && 'retryAfter' in error
          ? Number((error as { retryAfter?: unknown }).retryAfter)
          : 0;
      if (retryAfter > 0) {
        return `Zu viele Versuche in kurzer Zeit. Bitte warte noch ${retryAfter} ${retryAfter === 1 ? 'Sekunde' : 'Sekunden'} und versuche es dann erneut.`;
      }
      return 'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.';
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number' &&
      (error as { status: number }).status >= 500 &&
      (error as { status: number }).status < 600
    ) {
      return 'Supabase ist vorübergehend nicht verfügbar. Warte bitte kurz und versuche es dann erneut.';
    }
    if (code === 'weak_password' || message.includes('weak password')) {
      return 'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.';
    }
    return fallback;
  },
  getRateLimitRetryAfterSeconds: (error: unknown) => {
    if (!error || typeof error !== 'object' || !('retryAfter' in error)) return null;
    const seconds = Number((error as { retryAfter?: unknown }).retryAfter);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
  },
}));

const { default: ResetPasswordScreen } = require('../app/auth/reset') as {
  default: React.ComponentType;
};

beforeEach(() => {
  mockSaveNewPassword.mockReset().mockRejectedValue(new Error('Network request failed'));
  mockRecoveryPending = true;
  mockUsePreventRemove.mockClear();
  mockPreventRemoveEnabled = false;
  mockPreventRemoveCallback = undefined;
});

test('zeigt die geltende Passwortlänge vor dem Speichern', async () => {
  const view = await render(<ResetPasswordScreen />);

  expect(
    await view.findByText('Mindestens 6 Zeichen. Es sind keine weiteren Zeichenregeln erforderlich.'),
  ).toBeTruthy();
  expect(view.getByTestId('reset-password-submit-button')).toBeTruthy();
});

test.each([
  { field: 'Neues Passwort', testID: 'reset-password-input' },
  { field: 'Passwortbestätigung', testID: 'reset-password-confirm-input' },
])('fängt Aktualisieren und Schließen bei Eingaben im Feld „$field“ ab', async ({ testID }) => {
  const originalPlatformOS = Platform.OS;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const addEventListener = jest.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
  const removeEventListener = jest.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener, removeEventListener },
  });
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });

  try {
    const view = await render(<ResetPasswordScreen />);
    await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
    expect(addEventListener).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByTestId(testID), 'Mein-neues-Passwort');
    expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    const listener = addEventListener.mock.calls.find(([eventName]) => eventName === 'beforeunload')?.[1];
    if (typeof listener !== 'function') throw new Error('beforeunload-Listener wurde nicht registriert.');
    const preventDefault = jest.fn();
    const event = {
      preventDefault,
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;
    (listener as (event: BeforeUnloadEvent) => void)(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe('');

    await fireEvent.changeText(view.getByTestId(testID), '');
    expect(removeEventListener).toHaveBeenCalledWith('beforeunload', listener);
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOS,
    });
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('schaltet jedes Passwortfeld einzeln sichtbar und behält die Eingaben', async () => {
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  const passwordInput = view.getByTestId('reset-password-input');
  const confirmInput = view.getByTestId('reset-password-confirm-input');
  const passwordToggle = view.getByTestId('reset-password-visibility-toggle');
  const confirmToggle = view.getByTestId('reset-password-confirm-visibility-toggle');

  await fireEvent.changeText(passwordInput, 'Mein-neues-Passwort-123');
  await fireEvent.changeText(confirmInput, 'Mein-neues-Passwort-123');

  expect(passwordInput.props.secureTextEntry).toBe(true);
  expect(confirmInput.props.secureTextEntry).toBe(true);
  expect(passwordToggle.props.accessibilityRole).toBe('switch');
  expect(passwordToggle.props.accessibilityLabel).toBe('Neues Passwort anzeigen');
  expect(passwordToggle.props.accessibilityState).toEqual({ checked: false });
  expect(confirmToggle.props.accessibilityRole).toBe('switch');
  expect(confirmToggle.props.accessibilityLabel).toBe('Bestätigung anzeigen');
  expect(confirmToggle.props.accessibilityState).toEqual({ checked: false });

  await fireEvent.press(passwordToggle);

  expect(view.getByTestId('reset-password-input').props.secureTextEntry).toBe(false);
  expect(view.getByTestId('reset-password-visibility-toggle').props.accessibilityLabel).toBe(
    'Neues Passwort verbergen',
  );
  expect(view.getByTestId('reset-password-visibility-toggle').props.accessibilityState).toEqual({ checked: true });
  expect(view.getByTestId('reset-password-confirm-input').props.secureTextEntry).toBe(true);
  expect(view.getByTestId('reset-password-confirm-visibility-toggle').props.accessibilityState).toEqual({
    checked: false,
  });

  await fireEvent.press(view.getByTestId('reset-password-confirm-visibility-toggle'));

  expect(view.getByTestId('reset-password-input').props.secureTextEntry).toBe(false);
  expect(view.getByTestId('reset-password-confirm-input').props.secureTextEntry).toBe(false);
  expect(view.getByTestId('reset-password-confirm-visibility-toggle').props.accessibilityLabel).toBe(
    'Bestätigung verbergen',
  );
  expect(view.getByTestId('reset-password-confirm-visibility-toggle').props.accessibilityState).toEqual({
    checked: true,
  });
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');
});

test('vergleicht Passwörter nach dem Sichtbar-Schalten weiterhin vor dem Speichern', async () => {
  mockSaveNewPassword.mockResolvedValue(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Anderes-Passwort-456');
  await fireEvent.press(view.getByTestId('reset-password-visibility-toggle'));
  await fireEvent.press(view.getByTestId('reset-password-confirm-visibility-toggle'));
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText('Die Passwörter stimmen nicht überein.')).toBeTruthy();
  expect(mockSaveNewPassword).not.toHaveBeenCalled();

  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText('Passwort geändert')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
  expect(mockSaveNewPassword).toHaveBeenCalledWith('Mein-neues-Passwort-123');
});

test.each([
  { name: 'leeren Eingaben', password: '', confirmPassword: '' },
  {
    name: 'fehlendem neuen Passwort',
    password: '',
    confirmPassword: 'Mein-neues-Passwort-123',
  },
  {
    name: 'fehlender Passwortbestätigung',
    password: 'Mein-neues-Passwort-123',
    confirmPassword: '',
  },
])('verhindert das Speichern bei $name', async ({ password, confirmPassword }) => {
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  if (password) {
    await fireEvent.changeText(view.getByTestId('reset-password-input'), password);
  }
  if (confirmPassword) {
    await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), confirmPassword);
  }
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText('Bitte gib dein neues Passwort zweimal ein.');
  expect(errorMessage.props.accessible).toBe(true);
  expect(errorMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');
  expect(errorMessage.props.accessibilityLiveRegion).toBe(Platform.OS === 'android' ? 'assertive' : undefined);
  expect(mockSaveNewPassword).not.toHaveBeenCalled();
});

test('verhindert das Speichern unterschiedlicher Passwörter mit zugänglicher Fehlermeldung', async () => {
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Ein-anderes-Passwort-456');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText('Die Passwörter stimmen nicht überein.');
  expect(errorMessage.props.accessible).toBe(true);
  expect(errorMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');
  expect(errorMessage.props.accessibilityLiveRegion).toBe(Platform.OS === 'android' ? 'assertive' : undefined);
  expect(mockSaveNewPassword).not.toHaveBeenCalled();
});

test.each(['ios', 'android'] as const)(
  'meldet die erfolgreiche Passwortänderung unter %s als Screenreader-Status und lässt die Rückkehr zu',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: platform,
    });
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const focusSpy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
    const findNodeHandleSpy = jest.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(123);
    mockSaveNewPassword.mockResolvedValue(undefined);
    try {
      const view = await render(<ResetPasswordScreen />);

      await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
      await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
      await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
      await fireEvent.press(view.getByTestId('reset-password-submit-button'));

      const successMessage = await view.findByTestId('reset-password-success-message');
      expect(successMessage.props.accessible).toBe(true);
      expect(successMessage.props.accessibilityRole).toBe('status');
      expect(successMessage.props.accessibilityLiveRegion).toBe('polite');
      expect(successMessage.props.children).toBe(
        'Dein neues Passwort ist gespeichert. Du kannst dich jetzt mit diesem Passwort anmelden.',
      );
      expect(view.getByText('Passwort geändert')).toBeTruthy();

      const returnButton = view.getByTestId('reset-password-return-button');
      expect(returnButton.props.accessibilityRole).toBe('button');
      expect(view.getByText('Zu CupCal')).toBeTruthy();
      expect(findNodeHandleSpy).toHaveBeenCalledWith(expect.anything());
      await waitFor(() => expect(focusSpy).toHaveBeenCalledWith(expect.any(Number)));
      if (platform === 'ios') expect(announceSpy).not.toHaveBeenCalledWith(successMessage.props.children);
      expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
    } finally {
      announceSpy.mockRestore();
      focusSpy.mockRestore();
      findNodeHandleSpy.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  },
);

test.each(['ios', 'android'] as const)(
  'kündigt einen Speicherfehler auf %s plattformgerecht an und erlaubt einen erneuten Versuch',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: platform,
    });
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    try {
      const view = await render(<ResetPasswordScreen />);

      await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
      await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
      await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
      await fireEvent.press(view.getByTestId('reset-password-submit-button'));

      const errorMessage = await view.findByText(
        'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
      );
      expect(errorMessage.props.accessible).toBe(true);
      expect(errorMessage.props.accessibilityRole).toBe(platform === 'ios' ? 'alert' : 'text');
      expect(errorMessage.props.accessibilityLiveRegion).toBe(platform === 'android' ? 'assertive' : undefined);
      expect(errorMessage.props.children).toContain('versuche es erneut');
      expect(announceSpy).toHaveBeenCalledTimes(platform === 'ios' ? 1 : 0);
      expect(announceSpy).not.toHaveBeenCalledWith(
        'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
      );
      expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
      expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');
      expect(view.getByTestId('reset-password-submit-button')).toBeTruthy();
      expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);

      mockSaveNewPassword.mockResolvedValue(undefined);
      await fireEvent.press(view.getByTestId('reset-password-submit-button'));

      await waitFor(() => expect(view.getByText('Passwort geändert')).toBeTruthy());
      expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
    } finally {
      announceSpy.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  },
);

test('behält Eingaben und ermöglicht nach vorübergehender Passwort-Drosselung einen erneuten Versuch', async () => {
  mockSaveNewPassword
    .mockReset()
    .mockRejectedValueOnce(
      Object.assign(new Error('Too many requests'), {
        code: 'over_request_rate_limit',
        status: 429,
      }),
    )
    .mockResolvedValueOnce(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText(
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  );
  expect(errorMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-submit-button').props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
  });

  await fireEvent.press(view.getByTestId('reset-password-submit-button'));
  expect(await view.findByText('Passwort geändert')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(1, 'Mein-neues-Passwort-123');
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(2, 'Mein-neues-Passwort-123');
});

test('zeigt eine verlässliche Wartezeit und lässt nach Ablauf erneut absenden', async () => {
  mockSaveNewPassword
    .mockReset()
    .mockRejectedValueOnce(
      Object.assign(new Error('Too many requests'), {
        code: 'over_request_rate_limit',
        status: 429,
        retryAfter: 1,
      }),
    )
    .mockResolvedValueOnce(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  jest.useFakeTimers({ now: Date.now() });
  try {
    await fireEvent.press(view.getByTestId('reset-password-submit-button'));

    expect(
      view.getByText('Zu viele Versuche in kurzer Zeit. Bitte warte noch 1 Sekunde und versuche es dann erneut.'),
    ).toBeTruthy();
    expect(view.getByTestId('reset-password-retry-countdown').props.children.join('')).toBe(
      'Du kannst es in 1 Sekunde erneut versuchen.',
    );
    expect(view.getByTestId('reset-password-submit-button').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: false,
    });
    expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
    expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(view.getByTestId('reset-password-submit-button').props.accessibilityState).toMatchObject({
      disabled: false,
      busy: false,
    });
    expect(view.getByTestId('reset-password-retry-ready')).toBeTruthy();

    await fireEvent.press(view.getByTestId('reset-password-submit-button'));
    expect(view.getByText('Passwort geändert')).toBeTruthy();
    expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test('gibt bei einem unerwarteten Speicherfehler eine zugängliche nächste Aktion aus', async () => {
  mockSaveNewPassword.mockRejectedValue(new Error('Unexpected server error'));
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText('Das Passwort konnte nicht gespeichert werden. Bitte versuche es erneut.');
  expect(errorMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');
  expect(view.getByTestId('reset-password-submit-button')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
});

test('erklärt eine abgelaufene Sitzung und entfernt das Passwortformular', async () => {
  mockSaveNewPassword.mockImplementation(async () => {
    mockRecoveryPending = false;
    throw Object.assign(new Error('Invalid token: expired'), {
      code: 'otp_expired',
    });
  });
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText(
    'Die Wiederherstellungssitzung ist abgelaufen oder ungültig. Bitte fordere in den Einstellungen einen neuen Wiederherstellungslink an.',
  );
  expect(errorMessage.props.accessible).toBe(true);
  expect(errorMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');
  expect(errorMessage.props.accessibilityLiveRegion).toBe(Platform.OS === 'android' ? 'assertive' : undefined);
  expect(view.queryByTestId('reset-password-input')).toBeNull();
  expect(view.queryByTestId('reset-password-confirm-input')).toBeNull();
  expect(view.queryByTestId('reset-password-submit-button')).toBeNull();
  expect(view.getByTestId('reset-password-return-button')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
});

test('behält Formular und Eingaben nach einer Passwort-Ablehnung für eine Korrektur', async () => {
  mockSaveNewPassword.mockRejectedValue(Object.assign(new Error('Password is too weak'), { code: 'weak_password' }));
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'kurz');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'kurz');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(
    await view.findByText('Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.'),
  ).toBeTruthy();
  expect(view.getByTestId('reset-password-input').props.value).toBe('kurz');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('kurz');
  expect(view.getByTestId('reset-password-submit-button').props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
  });
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
});

test('speichert nach einer Passwort-Ablehnung beide korrigierten Eingaben erfolgreich', async () => {
  mockSaveNewPassword
    .mockReset()
    .mockRejectedValueOnce(
      Object.assign(new Error('Password is too weak'), {
        code: 'weak_password',
      }),
    )
    .mockResolvedValueOnce(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'kurz');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'kurz');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText(
    'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.',
  );
  expect(errorMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');

  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');

  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText('Passwort geändert')).toBeTruthy();
  expect(
    view.getByText('Dein neues Passwort ist gespeichert. Du kannst dich jetzt mit diesem Passwort anmelden.'),
  ).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(1, 'kurz');
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(2, 'Mein-neues-Passwort-123');
});

test('behält korrigierte Eingaben nach einer zweiten Passwort-Ablehnung für einen dritten Versuch', async () => {
  mockSaveNewPassword
    .mockReset()
    .mockRejectedValueOnce(
      Object.assign(new Error('Password is too weak'), {
        code: 'weak_password',
      }),
    )
    .mockRejectedValueOnce(new Error('Unexpected server error'))
    .mockResolvedValueOnce(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'kurz');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'kurz');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(
    await view.findByText('Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.'),
  ).toBeTruthy();

  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const secondErrorMessage = await view.findByText(
    'Das Passwort konnte nicht gespeichert werden. Bitte versuche es erneut.',
  );
  expect(secondErrorMessage.props.accessible).toBe(true);
  expect(secondErrorMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');
  expect(secondErrorMessage.props.accessibilityLiveRegion).toBe(Platform.OS === 'android' ? 'assertive' : undefined);
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-submit-button').props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
  });
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(1, 'kurz');
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(2, 'Mein-neues-Passwort-123');

  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText('Passwort geändert')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(3);
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(3, 'Mein-neues-Passwort-123');
});

test('prüft nach einer Passwort-Ablehnung weiterhin beide Eingaben vor jedem Speichern', async () => {
  mockSaveNewPassword
    .mockReset()
    .mockRejectedValueOnce(
      Object.assign(new Error('Password is too weak'), {
        code: 'weak_password',
      }),
    )
    .mockResolvedValueOnce(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'kurz');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'kurz');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(
    await view.findByText('Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.'),
  ).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);

  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Anderes-neues-Passwort-456');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const mismatchMessage = await view.findByText('Die Passwörter stimmen nicht überein.');
  expect(mismatchMessage.props.accessible).toBe(true);
  expect(mismatchMessage.props.accessibilityRole).toBe(Platform.OS === 'ios' ? 'alert' : 'text');
  expect(mismatchMessage.props.accessibilityLiveRegion).toBe(Platform.OS === 'android' ? 'assertive' : undefined);
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);

  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText('Passwort geändert')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(1, 'kurz');
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(2, 'Mein-neues-Passwort-123');
});

test.each(['ios', 'android'] as const)(
  'kündigt den laufenden Speichervorgang auf %s an und sperrt weitere Versuche',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: platform,
    });
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const focusSpy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
    const findNodeHandleSpy = jest.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(123);
    let finishSave!: () => void;
    mockSaveNewPassword.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    try {
      const view = await render(<ResetPasswordScreen />);

      await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
      await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
      await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
      announceSpy.mockClear();

      await fireEvent.press(view.getByTestId('reset-password-submit-button'));
      await fireEvent.press(view.getByTestId('reset-password-submit-button'));
      await fireEvent.press(view.getByTestId('reset-password-submit-button'));

      expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
      const savingButton = view.getByTestId('reset-password-submit-button');
      expect(savingButton.props.accessibilityState).toEqual({
        disabled: true,
        busy: true,
      });
      expect(savingButton.props.accessibilityLabel).toBe('Passwort wird gespeichert');
      expect(savingButton.props.accessibilityLiveRegion).toBe(platform === 'android' ? 'polite' : undefined);
      expect(view.getByText('Wird gespeichert …')).toBeTruthy();
      const savingAnnouncements = announceSpy.mock.calls.filter(
        ([message]) => message === 'Passwort wird gespeichert …',
      );
      expect(savingAnnouncements).toHaveLength(platform === 'ios' ? 1 : 0);
      if (platform === 'ios') {
        expect(announceSpy).toHaveBeenCalledWith('Passwort wird gespeichert …');
      }

      await act(async () => finishSave());
      expect(await view.findByText('Passwort geändert')).toBeTruthy();
      expect(announceSpy.mock.calls.filter(([message]) => message === 'Passwort wird gespeichert …')).toHaveLength(
        platform === 'ios' ? 1 : 0,
      );
      expect(focusSpy).toHaveBeenCalledWith(expect.any(Number));
      expect(findNodeHandleSpy).toHaveBeenCalledWith(expect.anything());
    } finally {
      announceSpy.mockRestore();
      focusSpy.mockRestore();
      findNodeHandleSpy.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  },
);

test('verhindert das Verlassen, solange die Passwortänderung noch gespeichert wird', async () => {
  let finishSave!: () => void;
  mockSaveNewPassword.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(mockPreventRemoveEnabled).toBe(true);
  expect(mockPreventRemoveCallback).toBeDefined();
  const repeatBlockedNavigation = jest.fn();
  mockPreventRemoveCallback?.({
    data: { action: { type: 'GO_BACK' } },
    repeat: repeatBlockedNavigation,
  });

  expect(repeatBlockedNavigation).not.toHaveBeenCalled();
  expect(view.getByText('Neues Passwort')).toBeTruthy();
  expect(view.getByText('Wird gespeichert …')).toBeTruthy();

  await act(async () => finishSave());

  expect(await view.findByText('Passwort geändert')).toBeTruthy();
  expect(mockPreventRemoveEnabled).toBe(false);
});

test.each(['ios', 'android'] as const)(
  'stellt die Passwortwarnung unter %s mit Screenreader-klaren Entscheidungen dar',
  async (platform) => {
    const originalPlatformOS = Platform.OS;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: platform,
    });

    try {
      const view = await render(<ResetPasswordScreen />);

      await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
      await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort');
      await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort');

      expect(mockPreventRemoveEnabled).toBe(true);
      const repeatBlockedNavigation = jest.fn();
      mockPreventRemoveCallback?.({
        data: { action: { type: 'GO_BACK' } },
        repeat: repeatBlockedNavigation,
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Passwort nicht gespeichert',
        'Wenn du jetzt gehst, gehen deine Eingaben verloren.',
        expect.any(Array),
      );
      const buttons = alertSpy.mock.calls[0]?.[2];
      expect(buttons?.map((button) => button.text)).toEqual(['Abbrechen', 'Verwerfen']);
      expect(buttons?.[0]).toMatchObject({
        text: 'Abbrechen',
        style: 'cancel',
      });
      expect(buttons?.[1]).toMatchObject({
        text: 'Verwerfen',
        style: 'destructive',
      });

      buttons?.find((button) => button.text === 'Abbrechen')?.onPress?.();

      expect(repeatBlockedNavigation).not.toHaveBeenCalled();
      expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort');
      expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort');
      expect(mockPreventRemoveEnabled).toBe(true);
    } finally {
      alertSpy.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  },
);

test('verlässt den Bildschirm nach Bestätigung und verwirft die Passwort-Eingaben', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort');

  expect(mockPreventRemoveEnabled).toBe(true);
  const repeatBlockedNavigation = jest.fn();
  mockPreventRemoveCallback?.({
    data: { action: { type: 'GO_BACK' } },
    repeat: repeatBlockedNavigation,
  });

  const buttons = alertSpy.mock.calls[0]?.[2];
  expect(buttons?.map((button) => button.text)).toEqual(['Abbrechen', 'Verwerfen']);
  buttons?.find((button) => button.text === 'Verwerfen')?.onPress?.();

  expect(repeatBlockedNavigation).toHaveBeenCalledTimes(1);
  alertSpy.mockRestore();
});
