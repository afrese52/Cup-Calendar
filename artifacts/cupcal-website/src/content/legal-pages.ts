export interface LegalPageMetadata {
  slug: 'datenschutz' | 'konto-loeschen' | 'konto-loeschen-bestaetigen';
  path: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  noIndex?: boolean;
}

export const legalPages: LegalPageMetadata[] = [
  {
    slug: 'datenschutz',
    path: '/datenschutz/',
    title: 'Datenschutzerklärung | CupCal',
    description: 'Datenschutzhinweise zu CupCal: Verantwortlicher, verarbeitete Daten, Anbieter, Speicherfristen und deine Rechte.',
    h1: 'Datenschutzerklärung',
    eyebrow: 'Datenschutz',
  },
  {
    slug: 'konto-loeschen',
    path: '/konto-loeschen/',
    title: 'CupCal-Konto löschen | CupCal',
    description: 'Beantrage die Löschung deines CupCal-Kontos im Browser und bestätige sie sicher per E-Mail.',
    h1: 'CupCal-Konto löschen',
    eyebrow: 'Kontolöschung',
  },
];

export const deletionConfirmationPage: LegalPageMetadata = {
  slug: 'konto-loeschen-bestaetigen',
  path: '/konto-loeschen/bestaetigen/',
  title: 'Kontolöschung bestätigen | CupCal',
  description: 'Sichere Bestätigung deiner CupCal-Kontolöschung.',
  h1: 'Löschung bestätigen',
  eyebrow: 'Kontolöschung',
  noIndex: true,
};
