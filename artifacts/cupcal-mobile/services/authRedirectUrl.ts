const passwordResetFlowMarker = 'cupcal-password-reset';
const accountDeletionFlowMarker = 'cupcal-account-deletion';

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

export function createAccountDeletionRedirectUrl(options: {
  platform: 'web' | 'native';
  webOrigin?: string | null;
  webBasePath?: string;
  nativeUrl: string;
  confirmationToken: string;
}): string {
  if (!options.confirmationToken) {
    throw new Error('Der Kontolöschungs-Bestätigungscode fehlt.');
  }
  if (options.platform === 'web') {
    if (!options.webOrigin) {
      throw new Error('Die Browser-Adresse für die Kontolöschung ist nicht verfügbar.');
    }

    const basePath = options.webBasePath?.replace(/\/+$/, '') ?? '';
    const url = new URL(`${basePath}/auth/confirm`, options.webOrigin);
    url.searchParams.set('flow', accountDeletionFlowMarker);
    url.searchParams.set('deletion_token', options.confirmationToken);
    return url.toString();
  }

  return options.nativeUrl;
}
