import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

export function promptAccountSignIn(eventTitle: string, restoreFocus?: () => void) {
  const title = 'Anmeldung erforderlich';
  const message = `Melde dich an, um „${eventTitle}“ in deiner persönlichen Merkliste zu speichern.`;
  const openAccount = () => router.push({
    pathname: '/(tabs)/settings',
    params: { focusAccount: 'true' },
  });

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}\n\nJetzt anmelden?`)) {
      openAccount();
    } else {
      restoreFocus?.();
    }
    return;
  }

  Alert.alert(title, message, [
    {
      text: 'Später',
      style: 'cancel',
      onPress: () => {
        // Let the native alert finish dismissing before returning screen-reader focus.
        if (restoreFocus) setTimeout(restoreFocus, 250);
      },
    },
    { text: 'Anmelden', onPress: openAccount },
  ]);
}
