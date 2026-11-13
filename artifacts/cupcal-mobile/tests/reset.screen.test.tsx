import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSaveNewPassword = jest.fn(async (_password: string) => {});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: () => ({ remove: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
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
  isPasswordRecoveryPending: () => true,
  markPasswordRecoverySession: jest.fn(),
  handlePasswordResetUrl: jest.fn(async () => false),
  saveNewPassword: mockSaveNewPassword,
  friendlyAuthError: (error: unknown, fallback: string) =>
    error instanceof Error && error.message.toLowerCase().includes('network')
      ? 'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.'
      : fallback,
}));

const { default: ResetPasswordScreen } = require('../app/auth/reset') as {
  default: React.ComponentType;
};

beforeEach(() => {
  mockSaveNewPassword.mockReset().mockRejectedValue(new Error('Network request failed'));
});

test('behält Formular und Eingaben nach einem Verbindungsfehler für einen erneuten Versuch', async () => {
  const view = await render(<ResetPasswordScreen />);

  await waitFor(() => expect(view.getByTestId('reset-password-submit-button')).toBeTruthy());
  await fireEvent.changeText(view.getByTestId('reset-password-input'), 'Mein-neues-Passwort-123');
  await fireEvent.changeText(view.getByTestId('reset-password-confirm-input'), 'Mein-neues-Passwort-123');
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  expect(await view.findByText(
    'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
  )).toBeTruthy();
  expect(view.getByTestId('reset-password-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-confirm-input').props.value).toBe('Mein-neues-Passwort-123');
  expect(view.getByTestId('reset-password-submit-button')).toBeTruthy();
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(1);

  mockSaveNewPassword.mockResolvedValue(undefined);
  await fireEvent.press(view.getByTestId('reset-password-submit-button'));

  await waitFor(() => expect(view.getByText('Passwort geändert')).toBeTruthy());
  expect(mockSaveNewPassword).toHaveBeenCalledTimes(2);
});
