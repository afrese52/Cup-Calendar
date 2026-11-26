import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';

const mockRouteParams: { current: Record<string, string | string[]> } = { current: {} };
const mockInitialUrl: { current: string | null } = { current: null };
const mockInitialUrlPromise: { current: Promise<string | null> | null } = { current: null };
const mockUrlListener: {
  current: ((event: { url: string }) => void) | null;
} = { current: null };
const mockDeletionConfirm = jest.fn(async (_input: {
  data: { confirmationToken: string };
}) => undefined);
let mockPersistedSession: { user: { id: string } } | null = null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function trackStateUpdatesAfterUnmount() {
  const updates: unknown[] = [];
  let isUnmounted = false;
  const originalUseState = React.useState;
  const stateSpy = jest.spyOn(React, 'useState').mockImplementation(((initialState: any) => {
    const [value, setValue] = originalUseState(initialState);
    return [
      value,
      (nextValue: any) => {
        if (isUnmounted) updates.push(nextValue);
        setValue(nextValue);
      },
    ];
  }) as typeof React.useState);

  return {
    updates,
    markUnmounted: () => {
      isUnmounted = true;
    },
    restore: () => stateSpy.mockRestore(),
  };
}

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
jest.mock('@workspace/api-client-react', () => ({
  useConfirmAccountDeletion: () => ({ mutateAsync: mockDeletionConfirm }),
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(
    () => mockInitialUrlPromise.current ?? Promise.resolve(mockInitialUrl.current),
  ),
  addEventListener: (_event: string, listener: (event: { url: string }) => void) => {
    mockUrlListener.current = listener;
    return { remove: jest.fn() };
  },
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams.current,
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
jest.mock('@/services/localBookmarkStore', () => ({
  removeBookmarksForDeletedUser: jest.fn(async () => undefined),
}));

const { default: ConfirmEmailScreen } = require('../app/auth/confirm') as {
  default: React.ComponentType;
};
const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: any;
};
const { removeBookmarksForDeletedUser } = jest.requireMock('@/services/localBookmarkStore') as {
  removeBookmarksForDeletedUser: jest.Mock<(...args: any[]) => any>;
};

beforeEach(() => {
  mockRouteParams.current = {};
  mockInitialUrl.current = null;
  mockInitialUrlPromise.current = null;
  mockUrlListener.current = null;
  mockDeletionConfirm.mockReset().mockResolvedValue(undefined);
  removeBookmarksForDeletedUser.mockReset().mockResolvedValue(undefined);
  mockPersistedSession = null;
  supabase.auth.exchangeCodeForSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: 'account-id' } } },
    error: null,
  });
  supabase.auth.setSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: 'account-id' } } },
    error: null,
  });
  supabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
});

test('tauscht den E-Mail-Bestätigungscode samt Flow-ID ein und zeigt CupCal-Erfolg', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?code=email-confirmation-code&flow_id=confirmation-flow-id';
  const view = await render(<ConfirmEmailScreen />);

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'email-confirmation-code',
      { flowId: 'confirmation-flow-id' },
    );
    expect(view.getByText('Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.')).toBeTruthy();
  });
  expect(view.getByTestId('email-confirmation-return-button')).toBeTruthy();
});

test('meldet nach erfolgreichem Codeaustausch einen fehlgeschlagenen Sitzungsspeicher ohne Login-Erfolg', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?code=email-confirmation-code&flow_id=confirmation-flow-id';
  const persistenceError = Object.assign(
    new Error('Die Sitzung konnte auf diesem Gerät nicht dauerhaft gespeichert werden.'),
    { code: 'cupcal_session_persistence_failed' },
  );
  supabase.auth.exchangeCodeForSession.mockRejectedValue(persistenceError);
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText(
    'Deine E-Mail-Adresse ist bestätigt, aber die Sitzung konnte auf diesem Gerät nicht dauerhaft gespeichert werden. Du bist nicht angemeldet. Bitte melde dich erneut an.',
  )).toBeTruthy();
  expect(view.getByText('Bestätigung fehlgeschlagen')).toBeTruthy();
  expect(view.getByText('Zur Anmeldung')).toBeTruthy();
  expect(view.queryByText(
    'Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.',
  )).toBeNull();
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
    'email-confirmation-code',
    { flowId: 'confirmation-flow-id' },
  );
});

test('verarbeitet nacheinander Bestätigungslinks verschiedener Konten mit ihren Flow-IDs', async () => {
  mockInitialUrl.current =
    'cupcal-android://auth/confirm?code=account-a-code&flow_id=account-a-flow';
  const view = await render(<ConfirmEmailScreen />);

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenNthCalledWith(
      1,
      'account-a-code',
      { flowId: 'account-a-flow' },
    );
    expect(view.getByText(
      'Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.',
    )).toBeTruthy();
  });

  await act(async () => {
    mockUrlListener.current?.({
      url: 'cupcal-android://auth/confirm?code=account-b-code&sb_flow_id=account-b-flow',
    });
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenNthCalledWith(
      2,
      'account-b-code',
      { flowId: 'account-b-flow' },
    );
    expect(view.getByText(
      'Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.',
    )).toBeTruthy();
  });
});

test('verarbeitet mehrere wartende Links nach der verspäteten Kaltstart-URL in Empfangsreihenfolge', async () => {
  const initialUrl = deferred<string | null>();
  mockInitialUrlPromise.current = initialUrl.promise;
  supabase.auth.exchangeCodeForSession.mockImplementation(async (code: string) => {
    const userId = code === 'account-a-code'
      ? 'account-a'
      : code === 'account-b-code'
        ? 'account-b'
        : 'account-c';
    const session = { user: { id: userId } };
    mockPersistedSession = session;
    return { data: { session }, error: null };
  });
  const view = await render(<ConfirmEmailScreen />);

  await act(async () => {
    mockUrlListener.current?.({
      url: 'cupcal-android://auth/confirm?code=account-b-code&sb_flow_id=account-b-flow',
    });
    mockUrlListener.current?.({
      url: 'cupcal-android://auth/confirm?code=account-c-code&flow_id=account-c-flow',
    });
    await Promise.resolve();
  });
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();

  await act(async () => {
    initialUrl.resolve(
      'cupcal-android://auth/confirm?code=account-a-code&flow_id=account-a-flow',
    );
    await initialUrl.promise;
  });

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenNthCalledWith(
      1,
      'account-a-code',
      { flowId: 'account-a-flow' },
    );
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenNthCalledWith(
      2,
      'account-b-code',
      { flowId: 'account-b-flow' },
    );
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenNthCalledWith(
      3,
      'account-c-code',
      { flowId: 'account-c-flow' },
    );
    expect(mockPersistedSession?.user.id).toBe('account-c');
    expect(view.getByText(
      'Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.',
    )).toBeTruthy();
  });
});

test('lässt eine verspätete Antwort des ersten Links das zuletzt geöffnete Konto nicht ersetzen', async () => {
  const firstExchange = deferred<any>();
  const secondExchange = deferred<any>();
  mockInitialUrl.current =
    'cupcal-android://auth/confirm?code=account-a-code&flow_id=account-a-flow';
  supabase.auth.exchangeCodeForSession.mockImplementation((code: string) => {
    const response = code === 'account-a-code' ? firstExchange.promise : secondExchange.promise;
    return response.then((result: any) => {
      mockPersistedSession = result.data.session;
      return result;
    });
  });
  const view = await render(<ConfirmEmailScreen />);

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
  await act(async () => {
    mockUrlListener.current?.({
      url: 'cupcal-android://auth/confirm?code=account-b-code&sb_flow_id=account-b-flow',
    });
    await Promise.resolve();
  });
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    secondExchange.resolve({
      data: { session: { user: { id: 'account-b' } } },
      error: null,
    });
    await Promise.resolve();
  });
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    firstExchange.resolve({
      data: { session: { user: { id: 'account-a' } } },
      error: null,
    });
    await firstExchange.promise;
  });

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenNthCalledWith(
      2,
      'account-b-code',
      { flowId: 'account-b-flow' },
    );
    expect(mockPersistedSession?.user.id).toBe('account-b');
    expect(view.getByText(
      'Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.',
    )).toBeTruthy();
  });
});

test('ändert nach dem Schließen bei verspätetem Erfolg keinen Seitenzustand', async () => {
  const exchange = deferred<any>();
  const stateUpdates = trackStateUpdatesAfterUnmount();
  mockInitialUrl.current =
    'cupcal-android://auth/confirm?code=late-success-code&flow_id=late-success-flow';
  supabase.auth.exchangeCodeForSession.mockReturnValue(exchange.promise);

  try {
    const view = await render(<ConfirmEmailScreen />);
    await waitFor(() => {
      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
        'late-success-code',
        { flowId: 'late-success-flow' },
      );
    });

    await act(async () => view.unmount());
    stateUpdates.markUnmounted();
    await act(async () => {
      exchange.resolve({
        data: { session: { user: { id: 'account-id' } } },
        error: null,
      });
      await exchange.promise;
    });

    expect(stateUpdates.updates).toEqual([]);
  } finally {
    stateUpdates.restore();
  }
});

test('ignoriert die Start-URL, wenn der Bestätigungsbildschirm vorher geschlossen wurde', async () => {
  const initialUrl = deferred<string | null>();
  mockInitialUrlPromise.current = initialUrl.promise;
  const view = await render(<ConfirmEmailScreen />);

  expect(view.getByText('Bestätigung prüfen')).toBeTruthy();
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();

  await act(async () => view.unmount());
  await act(async () => {
    initialUrl.resolve(
      'cupcal-android://auth/confirm?code=late-confirmation-code&flow_id=late-confirmation-flow',
    );
    await initialUrl.promise;
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  expect(mockPersistedSession).toBeNull();
});

test('verwirft wartende App-Link-Ereignisse, wenn der Bildschirm vor der Start-URL schließt', async () => {
  const initialUrl = deferred<string | null>();
  mockInitialUrlPromise.current = initialUrl.promise;
  supabase.auth.exchangeCodeForSession.mockImplementation(async () => {
    mockPersistedSession = { user: { id: 'late-event-account' } };
    return {
      data: { session: mockPersistedSession },
      error: null,
    };
  });
  supabase.auth.setSession.mockImplementation(async () => {
    mockPersistedSession = { user: { id: 'late-event-account' } };
    return {
      data: { session: mockPersistedSession },
      error: null,
    };
  });
  const view = await render(<ConfirmEmailScreen />);

  expect(mockUrlListener.current).not.toBeNull();
  await act(async () => {
    mockUrlListener.current?.({
      url: 'cupcal-android://auth/confirm?code=late-event-code&flow_id=late-event-flow',
    });
    await Promise.resolve();
  });
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();

  await act(async () => view.unmount());
  await act(async () => {
    initialUrl.resolve(null);
    await initialUrl.promise;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  expect(mockPersistedSession).toBeNull();
});

test('ignoriert Routenbestätigung, wenn die Start-URL nach dem Schließen fehlschlägt', async () => {
  const initialUrl = deferred<string | null>();
  mockInitialUrlPromise.current = initialUrl.promise;
  mockRouteParams.current = {
    code: 'route-confirmation-code',
    flow_id: 'route-confirmation-flow',
  };
  const view = await render(<ConfirmEmailScreen />);

  expect(view.getByText('Bestätigung prüfen')).toBeTruthy();
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();

  await act(async () => view.unmount());
  await act(async () => {
    initialUrl.reject(new Error('Start-URL konnte nicht gelesen werden.'));
    await initialUrl.promise.catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  expect(mockPersistedSession).toBeNull();
});

test('ändert nach dem Schließen bei verspätetem Fehler keinen Seitenzustand', async () => {
  const exchange = deferred<any>();
  const stateUpdates = trackStateUpdatesAfterUnmount();
  mockInitialUrl.current =
    'cupcal-android://auth/confirm?code=late-error-code&flow_id=late-error-flow';
  supabase.auth.exchangeCodeForSession.mockReturnValue(exchange.promise);

  try {
    const view = await render(<ConfirmEmailScreen />);
    await waitFor(() => {
      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
        'late-error-code',
        { flowId: 'late-error-flow' },
      );
    });

    await act(async () => view.unmount());
    stateUpdates.markUnmounted();
    await act(async () => {
      exchange.reject(new Error('Der Bestätigungscode ist nicht mehr gültig.'));
      await exchange.promise.catch(() => undefined);
    });

    expect(stateUpdates.updates).toEqual([]);
  } finally {
    stateUpdates.restore();
  }
});

test('verarbeitet den zweiten Link nach einem fehlgeschlagenen ersten Austausch', async () => {
  const firstExchange = deferred<any>();
  const secondExchange = deferred<any>();
  mockInitialUrl.current =
    'cupcal-android://auth/confirm?code=account-a-code&flow_id=account-a-flow';
  supabase.auth.exchangeCodeForSession.mockImplementation((code: string) => {
    const response = code === 'account-a-code' ? firstExchange.promise : secondExchange.promise;
    return response.then((result: any) => {
      mockPersistedSession = result.data.session;
      return result;
    });
  });
  const view = await render(<ConfirmEmailScreen />);

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
  await act(async () => {
    mockUrlListener.current?.({
      url: 'cupcal-android://auth/confirm?code=account-b-code&sb_flow_id=account-b-flow',
    });
    await Promise.resolve();
  });
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    firstExchange.reject(new Error('Der erste Bestätigungscode wurde abgelehnt.'));
    await firstExchange.promise.catch(() => undefined);
  });

  await waitFor(() => {
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenNthCalledWith(
      2,
      'account-b-code',
      { flowId: 'account-b-flow' },
    );
  });
  expect(mockPersistedSession).toBeNull();

  await act(async () => {
    secondExchange.resolve({
      data: { session: { user: { id: 'account-b' } } },
      error: null,
    });
    await secondExchange.promise;
  });

  await waitFor(() => {
    expect(mockPersistedSession?.user.id).toBe('account-b');
    expect(view.getByText(
      'Deine E-Mail-Adresse ist bestätigt. Du kannst CupCal jetzt verwenden.',
    )).toBeTruthy();
  });
});

test('zeigt abgelaufene und bereits verwendete Links verständlich auf Deutsch', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired';
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText(
    'Der Bestätigungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an.',
  )).toBeTruthy();
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test('zeigt ohne Bestätigungscode eine klare Fehlermeldung', async () => {
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText(
    'Der Bestätigungslink enthält keinen gültigen Code. Bitte fordere einen neuen an.',
  )).toBeTruthy();
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test('löscht das Konto erst nach dem E-Mail-Link und meldet danach ab', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=signed-proof&code=one-time-code';
  const view = await render(<ConfirmEmailScreen />);

  await waitFor(() => expect(view.getByText('Konto gelöscht')).toBeTruthy());
  expect(view.getByText(
    'Dein CupCal-Konto und die dazugehörigen Favoriten wurden endgültig gelöscht.',
  )).toBeTruthy();
  expect(mockDeletionConfirm).toHaveBeenCalledWith({
    data: { confirmationToken: 'signed-proof' },
  });
  expect(supabase.auth.exchangeCodeForSession.mock.calls[0]?.[0]).toBe('one-time-code');
  expect(removeBookmarksForDeletedUser).toHaveBeenCalledWith('account-id');
  expect(mockDeletionConfirm.mock.invocationCallOrder[0]).toBeLessThan(
    removeBookmarksForDeletedUser.mock.invocationCallOrder[0],
  );
  expect(removeBookmarksForDeletedUser.mock.invocationCallOrder[0]).toBeLessThan(
    supabase.auth.signOut.mock.invocationCallOrder[0],
  );
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('meldet sich auch ab, wenn lokale Favoriten nach erfolgreicher Löschung nicht bereinigt werden können', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=signed-proof&code=one-time-code';
  removeBookmarksForDeletedUser.mockRejectedValue(new Error('Gerätespeicher nicht verfügbar.'));
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText('Konto gelöscht')).toBeTruthy();
  expect(view.getByText(/lokalen Favoriten konnten nicht vollständig entfernt werden/)).toBeTruthy();
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('übernimmt die aktuelle Flow-ID eines nativen Löschlinks in den Codeaustausch', async () => {
  mockInitialUrl.current =
    'cupcal-android://auth/confirm?flow=cupcal-account-deletion&deletion_token=signed-proof&code=one-time-code&sb_flow_id=deletion-flow-id';
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText('Konto gelöscht')).toBeTruthy();
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
    'one-time-code',
    { flowId: 'deletion-flow-id' },
  );
});

test('löst bei einem abgelaufenen Löschlink keine Löschanfrage aus', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=signed-proof&error_code=otp_expired';
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText('Bestätigung fehlgeschlagen')).toBeTruthy();
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(mockDeletionConfirm).not.toHaveBeenCalled();
});

test('löst nach einem bereits verwendeten Auth-Code keine Löschanfrage aus', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=signed-proof&code=used-code';
  supabase.auth.exchangeCodeForSession.mockResolvedValue({
    data: { session: null },
    error: { code: 'flow_state_not_found', message: 'The auth code has already been used.' },
  });
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText('Bestätigung fehlgeschlagen')).toBeTruthy();
  expect(mockDeletionConfirm).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});

test('löscht nicht, wenn der Link keine E-Mail-Sitzung nachweist', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=signed-proof';
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText('Bestätigung fehlgeschlagen')).toBeTruthy();
  expect(mockDeletionConfirm).not.toHaveBeenCalled();
});

test('prüft vor dem Codeaustausch, ob der signierte Löschcode vorhanden ist', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&code=one-time-code';
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText('Bestätigung fehlgeschlagen')).toBeTruthy();
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(mockDeletionConfirm).not.toHaveBeenCalled();
});

test('meldet eine kontofremde Löschbestätigung ohne Erfolg oder Abmeldung', async () => {
  mockInitialUrl.current =
    'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=foreign-proof&code=one-time-code';
  mockDeletionConfirm.mockRejectedValue(new Error('Der Bestätigungslink gehört zu einem anderen Konto.'));
  const view = await render(<ConfirmEmailScreen />);

  expect(await view.findByText('Bestätigung fehlgeschlagen')).toBeTruthy();
  expect(view.queryByText('Konto gelöscht')).toBeNull();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  expect(removeBookmarksForDeletedUser).not.toHaveBeenCalled();
});
