import React from 'react';
import { expect, jest, test } from '@jest/globals';
import { fireEvent, renderRouter, testRouter, waitFor } from 'expo-router/testing-library';
import SettingsScreen from '../app/(tabs)/settings';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
  default: { expoConfig: { extra: { router: { sitemap: false, notFound: false } } } },
}));
jest.mock('expo', () => ({
  Platform: { OS: 'ios' },
  requireOptionalNativeModule: jest.fn(() => null),
  requireNativeView: jest.fn(() => 'View'),
  registerRootComponent: jest.fn(),
}));
jest.mock('expo-modules-core', () => {
  class MockEventEmitter {
    addListener() {
      return { remove: jest.fn() };
    }

    emit() {}
  }
  return {
    EventEmitter: MockEventEmitter,
    LegacyEventEmitter: MockEventEmitter,
    requireNativeModule: jest.fn(() => ({})),
    requireOptionalNativeModule: jest.fn(() => null),
    NativeModulesProxy: {},
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
    CodedError: Error,
    UnavailabilityError: Error,
  };
});
jest.mock('@workspace/api-client-react', () => ({
  getGetAdminImportAccessQueryKey: () => ['/api/v1/admin/import-access'],
  useGetAdminImportAccess: () => ({ data: { authorized: false, reason: 'not_admin' } }),
  useRequestAccountDeletion: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn() }));
jest.mock('expo-glass-effect', () => ({
  GlassView: 'View',
  isLiquidGlassAvailable: () => false,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaProvider: View,
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
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
jest.mock('@/services/accountAuth', () => ({
  clearPendingAccountConfirmationEmail: jest.fn(async () => {}),
  loadPendingAccountConfirmationEmail: jest.fn(async () => null),
  loadAccountConfirmationResendAvailableAt: jest.fn(async () => null),
  friendlyAuthError: jest.fn(() => 'Die Anfrage ist fehlgeschlagen.'),
  resendAccountConfirmation: jest.fn(),
  savePendingAccountConfirmationEmail: jest.fn(async () => {}),
  saveAccountConfirmationResendAvailableAt: jest.fn(async () => {}),
  signOutAccount: jest.fn(),
  submitAccountAuth: jest.fn(async (
    _auth: unknown,
    options: {
      mode: string;
      email: string;
      requestPasswordReset: (email: string) => Promise<void>;
    },
  ) => {
    if (options.mode === 'forgot-password') {
      await options.requestPasswordReset(options.email);
      return {
        ok: true,
        message: 'Wenn zu dieser E-Mail ein CupCal-Konto besteht, erhältst du in Kürze einen Wiederherstellungslink. Der Versand kann etwas dauern. Prüfe auch deinen Spam-Ordner.',
        clearPassword: true,
      };
    }
    return { ok: false, error: 'Nicht unterstützt.' };
  }),
  watchAuthSession: jest.fn((_auth: unknown, callbacks: { onReady: () => void }) => {
    callbacks.onReady();
    return () => {};
  }),
}));
jest.mock('@/services/supabase', () => ({
  supabase: { auth: {} },
  isSupabaseConfigured: true,
  supabaseConfigurationMessage: null,
  getEmailConfirmationRedirectUrl: () => 'cupcal-test://auth/confirm',
  getAccountDeletionRedirectUrl: (token: string) =>
    `cupcal-test://auth/confirm?flow=cupcal-account-deletion&deletion_token=${token}`,
  requestEmailConfirmation: jest.fn(async () => {}),
  requestPasswordReset: jest.fn(async (_email: string) => {}),
}));
jest.mock('@/services/accountDeletion', () => ({
  requestAccountDeletionConfirmation: jest.fn(),
}));

test('wechselt per Expo-Router-Navigation in die Linkanfrage und sendet sie ab', async () => {
  const mockRequestPasswordReset = jest.requireMock('@/services/supabase').requestPasswordReset as jest.Mock;
  mockRequestPasswordReset.mockClear();
  const view = await renderRouter(
    { '(tabs)/settings': SettingsScreen },
    { initialUrl: '/settings' },
  );

  expect(view.getByText('Bei CupCal anmelden')).toBeTruthy();
  expect(view.getPathname()).toBe('/settings');
  await fireEvent.changeText(view.getByTestId('auth-email-input'), 'test@example.invalid');

  await testRouter.navigate('/settings?authMode=forgot-password');

  await waitFor(() => {
    expect(view.getByText('Passwort zurücksetzen')).toBeTruthy();
    expect(view.queryByTestId('auth-password-input')).toBeNull();
    expect(view.getByTestId('auth-email-input').props.value).toBe('test@example.invalid');
    expect(view.getByTestId('auth-submit-button').props.accessibilityLabel).toBe('Link anfordern');
  });

  await fireEvent.press(view.getByTestId('auth-submit-button'));

  expect(jest.requireMock('@/services/accountAuth').submitAccountAuth)
    .toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      mode: 'forgot-password',
      email: 'test@example.invalid',
      requestPasswordReset: expect.any(Function),
    }));
  expect(mockRequestPasswordReset).toHaveBeenCalledWith('test@example.invalid');
  expect(await view.findByTestId('auth-success-message')).toBeTruthy();
  expect(view.getSearchParams()).toMatchObject({ authMode: 'forgot-password' });
});
