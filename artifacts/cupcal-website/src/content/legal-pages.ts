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
    description: 'Datenschutzhinweise zu CupCal: Erfahre, welche Daten wir verarbeiten, wer verantwortlich ist, wie lange sie gespeichert bleiben und welche Rechte du hast.',
    h1: 'Datenschutzerklärung',
    eyebrow: 'Datenschutz',
  },
  {
    slug: 'konto-loeschen',
    path: '/konto-loeschen/',
    title: 'CupCal-Konto löschen | CupCal',
    description: 'Beantrage die Löschung deines CupCal-Kontos im Browser und bestätige sie sicher per E-Mail. Hier erfährst du, wie der Antrag funktioniert und was du dafür brauchst.',
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
