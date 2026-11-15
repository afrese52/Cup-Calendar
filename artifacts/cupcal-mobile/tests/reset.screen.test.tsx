import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, Platform } from 'react-native';

const mockSaveNewPassword = jest.fn(async (_password: string) => {});
let mockRecoveryPending = true;
let mockPreventRemoveEnabled = false;
let mockPreventRemoveCallback: ((options: {
  data: { action: unknown };
  repeat: () => void;
}) => void) | undefined;
const mockUsePreventRemove = jest.fn((
  preventRemove: boolean,
  callback?: (options: { data: { action: unknown }; repeat: () => void }) => void,
) => {
  mockPreventRemoveEnabled = preventRemove;
  mockPreventRemoveCallback = callback;
  return jest.fn();
});

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
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
  isPasswordRecoveryPending: () => mockRecoveryPending,
  markPasswordRecoverySession: jest.fn(),
  handlePasswordResetUrl: jest.fn(async () => false),
  PASSWORD_MIN_LENGTH: 6,
  saveNewPassword: mockSaveNewPassword,
  friendlyAuthError: (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : '';
    if (message.includes('network')) {
      return 'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.';
    }
    if (
      code === 'over_request_rate_limit'
      || code === 'over_email_send_rate_limit'
      || message.includes('rate limit')
      || message.includes('too many requests')
      || (
        typeof error === 'object'
        && error !== null
        && 'status' in error
        && (error as { status?: unknown }).status === 429
      )
    ) {
      return 'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.';
    }
    if (
      typeof error === 'object'
      && error !== null
      && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
      && (error as { status: number }).status >= 500
      && (error as { status: number }).status < 600
    ) {
      return 'Supabase ist vorübergehend nicht verfügbar. Warte bitte kurz und versuche es dann erneut.';
    }
    if (code === 'weak_password' || message.includes('weak password')) {
      return 'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.';
    }
    return fallback;
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

  expect(await view.findByText(
    'Mindestens 6 Zeichen. Es sind keine weiteren Zeichenregeln erforderlich.',
  )).toBeTruthy();
  expect(view.getByTestId('reset-password-submit-button')).toBeTruthy();
});

test.each([
  { name: 'leeren Eingaben', password: '', confirmPassword: '' },
  { name: 'fehlendem neuen Passwort', password: '', confirmPassword: 'Mein-neues-Passwort-123' },
  { name: 'fehlender Passwortbestätigung', password: 'Mein-neues-Passwort-123', confirmPassword: '' },
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
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
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
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
  expect(mockSaveNewPassword).not.toHaveBeenCalled();
});

test('meldet die erfolgreiche Passwortänderung als Screenreader-Status', async () => {
  mockSaveNewPassword.mockResolvedValue(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const successMessage = await view.findByText(
    'Dein neues Passwort ist gespeichert. Du kannst dich jetzt mit diesem Passwort anmelden.',
  );
  expect(successMessage.props.accessible).toBe(true);
  expect(successMessage.props.accessibilityRole).toBe('status');
  expect(successMessage.props.accessibilityLiveRegion).toBe('polite');
  expect(view.getByText('Passwort geändert')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
});

test('behält Formular und Eingaben nach einem Verbindungsfehler für einen erneuten Versuch', async () => {
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText(
    'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
  );
  expect(errorMessage.props.accessible).toBe(true);
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
  expect(errorMessage.props.children).toContain('versuche es erneut');
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-submit-button')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);

  mockSaveNewPassword.mockResolvedValue(undefined);
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  await waitFor(() => expect(view.getByText('Passwort geändert')).toBeTruthy());
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
});

test('behält Eingaben und ermöglicht nach vorübergehender Passwort-Drosselung einen erneuten Versuch', async () => {
  mockSaveNewPassword
    .mockReset()
    .mockRejectedValueOnce(Object.assign(new Error('Too many requests'), {
      code: 'over_request_rate_limit',
      status: 429,
    }))
    .mockResolvedValueOnce(undefined);
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText(
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  );
  expect(errorMessage.props.accessibilityRole).toBe('alert');
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

test('gibt bei einem unerwarteten Speicherfehler eine zugängliche nächste Aktion aus', async () => {
  mockSaveNewPassword.mockRejectedValue(new Error('Unexpected server error'));
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  const errorMessage = await view.findByText(
    'Das Passwort konnte nicht gespeichert werden. Bitte versuche es erneut.',
  );
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(view.getByTestId('reset-password-submit-button')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
});

test('erklärt eine abgelaufene Sitzung und entfernt das Passwortformular', async () => {
  mockSaveNewPassword.mockImplementation(async () => {
    mockRecoveryPending = false;
    throw Object.assign(new Error('Invalid token: expired'), { code: 'otp_expired' });
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
  expect(errorMessage.props.accessibilityRole).toBe('alert');
  expect(errorMessage.props.accessibilityLiveRegion).toBe('assertive');
  expect(view.queryByTestId('reset-password-input')).toBeNull();
  expect(view.queryByTestId('reset-password-confirm-input')).toBeNull();
  expect(view.queryByTestId('reset-password-submit-button')).toBeNull();
  expect(view.getByTestId('reset-password-return-button')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
});

test('behält Formular und Eingaben nach einer Passwort-Ablehnung für eine Korrektur', async () => {
  mockSaveNewPassword.mockRejectedValue(
    Object.assign(new Error('Password is too weak'), { code: 'weak_password' }),
  );
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'kurz');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'kurz');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText(
    'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.',
  )).toBeTruthy();
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
      Object.assign(new Error('Password is too weak'), { code: 'weak_password' }),
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
  expect(errorMessage.props.accessibilityRole).toBe('alert');

  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');

  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText('Passwort geändert')).toBeTruthy();
  expect(view.getByText(
    'Dein neues Passwort ist gespeichert. Du kannst dich jetzt mit diesem Passwort anmelden.',
  )).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(1, 'kurz');
  expect(mockSaveNewPassword).toHaveBeenNthCalledWith(2, 'Mein-neues-Passwort-123');
});

test('sperrt schnelle wiederholte Speicherversuche bis die Passwortänderung abgeschlossen ist', async () => {
  const originalPlatformOS = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  let finishSave!: () => void;
  mockSaveNewPassword.mockImplementation(
    () => new Promise<void>((resolve) => { finishSave = resolve; }),
  );
  try {
    const view = await render(<ResetPasswordScreen />);

    await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
    await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
    await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');

    await fireEvent.press(view.getByTestId('reset-password-submit-button'));
    await fireEvent.press(view.getByTestId('reset-password-submit-button'));
    await fireEvent.press(view.getByTestId('reset-password-submit-button'));

    expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);
    const savingButton = view.getByTestId('reset-password-submit-button');
    expect(savingButton.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(savingButton.props.accessibilityLiveRegion).toBe('polite');
    expect(view.getByText('Wird gespeichert …')).toBeTruthy();
    expect(announceSpy).toHaveBeenCalledWith('Passwort wird gespeichert …');

    await act(async () => finishSave());
    expect(await view.findByText('Passwort geändert')).toBeTruthy();
    expect(announceSpy).toHaveBeenLastCalledWith(
      'Dein neues Passwort ist gespeichert. Du kannst dich jetzt mit diesem Passwort anmelden.',
    );
  } finally {
    announceSpy.mockRestore();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
  }
});

test('verhindert das Verlassen, solange die Passwortänderung noch gespeichert wird', async () => {
  let finishSave!: () => void;
  mockSaveNewPassword.mockImplementation(
    () => new Promise<void>((resolve) => { finishSave = resolve; }),
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

test('behält eingegebene Passwörter, wenn das Verlassen abgebrochen wird', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
  buttons?.find((button) => button.text === 'Weiter bearbeiten')?.onPress?.();

  expect(repeatBlockedNavigation).not.toHaveBeenCalled();
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort');
  expect(mockPreventRemoveEnabled).toBe(true);
  alertSpy.mockRestore();
});

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
  buttons?.find((button) => button.text === 'Verwerfen')?.onPress?.();

  expect(repeatBlockedNavigation).toHaveBeenCalledTimes(1);
  alertSpy.mockRestore();
});
