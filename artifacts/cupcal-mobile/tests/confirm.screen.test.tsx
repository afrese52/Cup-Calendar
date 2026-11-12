import React from 'react';
import { expect, jest, test } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import ConfirmEmailScreen from '../app/auth/confirm';
import { supabase } from '@/services/supabase';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@workspace/api-client-react', () => {
  const confirm = jest.fn(async () => undefined);
  return {
    useConfirmAccountDeletion: () => ({ mutateAsync: confirm }),
    __confirmAccountDeletion: confirm,
  };
});
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () =>
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=signed-proof&code=one-time-code',
  ),
  addEventListener: () => ({ remove: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    flow: 'cupcal-account-deletion',
    deletion_token: 'signed-proof',
    code: 'one-time-code',
  }),
  router: { replace: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    foreground: '#111',
    mutedForeground: '#666',
    primary: '#06c',
    primaryForeground: '#fff',
    secondary: '#eee',
    accent: '#def',
    destructive: '#c00',
    success: '#080',
  }),
}));
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(async () => ({
        data: { session: { user: { id: 'account-id' } } },
        error: null,
      })),
      setSession: jest.fn(async () => ({
        data: { session: { user: { id: 'account-id' } } },
        error: null,
      })),
      signOut: jest.fn(async () => ({ error: null })),
    },
  },
}));

test('löscht das Konto erst nach dem E-Mail-Link und meldet danach ab', async () => {
  const view = await render(<ConfirmEmailScreen />);

  await waitFor(() => expect(view.getByText('Konto gelöscht')).toBeTruthy());
  expect(view.getByText(
    'Dein CupCal-Konto und die dazugehörigen Favoriten wurden endgültig gelöscht.',
  )).toBeTruthy();

  const mockedApi = jest.requireMock('@workspace/api-client-react') as {
    __confirmAccountDeletion: jest.Mock;
  };
  expect(mockedApi.__confirmAccountDeletion).toHaveBeenCalledWith({
    data: { confirmationToken: 'signed-proof' },
  });
  expect(supabase!.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
  expect(supabase!.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
