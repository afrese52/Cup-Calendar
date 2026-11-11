const SCHEMA_SETUP_ERROR_CODES = new Set([
  '42703',
  'PGRST202',
  'PGRST204',
  'PGRST205',
]);

export function getBookmarkSyncErrorMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : null;

  if (code && SCHEMA_SETUP_ERROR_CODES.has(code)) {
    return 'Die Favoriten-Synchronisierung ist auf Supabase noch nicht eingerichtet. Bitte die Migrationen 0002 und 0003 anwenden; bis dahin bleiben neue Favoriten lokal gespeichert.';
  }

  if (code === '42501') {
    return 'Supabase hat den Favoriten-Abgleich abgewiesen. Bitte die RLS-Richtlinien der Migration 0002 prüfen.';
  }

  return 'Die Synchronisierung ist gerade nicht möglich. Deine Favoriten bleiben auf diesem Gerät gespeichert.';
}
