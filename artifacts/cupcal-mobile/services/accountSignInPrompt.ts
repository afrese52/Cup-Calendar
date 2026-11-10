import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

export function promptAccountSignIn() {
  const title = 'Anmeldung erforderlich';
  const message = 'Melde dich an, um Termine in deiner persönlichen Merkliste zu speichern.';
  const openAccount = () => router.push('/(tabs)/settings');

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}\n\nJetzt anmelden?`)) {
      openAccount();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Später', style: 'cancel' },
    { text: 'Anmelden', onPress: openAccount },
  ]);
}
