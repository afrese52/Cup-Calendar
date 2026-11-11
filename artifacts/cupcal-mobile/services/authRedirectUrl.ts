const passwordResetFlowMarker = 'cupcal-password-reset';

export function createPasswordResetRedirectUrl(options: {
  platform: 'web' | 'native';
  webOrigin?: string | null;
  nativeUrl: string;
}): string {
  if (options.platform === 'web') {
    if (!options.webOrigin) {
      throw new Error('Die Browser-Adresse für den Passwort-Reset ist nicht verfügbar.');
    }

    const url = new URL('/auth/reset', options.webOrigin);
    url.searchParams.set('flow', passwordResetFlowMarker);
    return url.toString();
  }

  return options.nativeUrl;
}
