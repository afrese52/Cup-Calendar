export const SITE_ORIGIN = 'https://cupcal.af-software.app';

// Erst nach Betreiberfreigabe mit offiziellen CupCal-Store-Seiten befüllen.
export interface ConfirmedStoreLinks {
  android: string | null;
  ios: string | null;
}

export const confirmedStoreLinks: ConfirmedStoreLinks = {
  android: null,
  ios: null,
};

export function getOfficialStoreUrl(url: string | null, platform: 'android' | 'ios') {
  if (!url) return null;

  const parsedUrl = new URL(url);
  const isOfficialListing = platform === 'android'
    ? parsedUrl.protocol === 'https:'
      && parsedUrl.hostname === 'play.google.com'
      && parsedUrl.pathname === '/store/apps/details'
      && parsedUrl.searchParams.get('id') === 'de.cup.calendar'
    : parsedUrl.protocol === 'https:'
      && parsedUrl.hostname === 'apps.apple.com'
      && /(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/app\/cupcal(?:-[^/]+)?\/id\d+\/?$/i.test(parsedUrl.pathname);

  if (!isOfficialListing) {
    throw new Error(`Die bestätigte ${platform}-Store-URL ist keine gültige offizielle CupCal-Store-Seite.`);
  }

  return parsedUrl.href;
}

function getStoreStatus(links: ConfirmedStoreLinks) {
  return {
    android: links.android
      ? 'Android bei Google Play verfügbar'
      : 'Android noch nicht verfügbar',
    ios: links.ios
      ? 'iOS im App Store verfügbar'
      : 'iOS noch nicht verfügbar',
    count: Number(Boolean(links.android)) + Number(Boolean(links.ios)),
  };
}

function getDownloadEnding(availablePlatforms: number) {
  if (availablePlatforms === 2) {
    return 'Beide bestätigten Links führen direkt zum Download.';
  }
  if (availablePlatforms === 1) {
    return 'Der bestätigte Download-Link führt zum offiziellen Store.';
  }
  return 'Offizielle Download-Links folgen nach Betreiberfreigabe.';
}

export function createStoreSearchMetadata(links: ConfirmedStoreLinks) {
  const status = getStoreStatus(links);
  const statusText = `${status.android}; ${status.ios}.`;
  const homeEnding = status.count === 2
    ? 'Beide Links führen direkt zum Download.'
    : status.count === 1
      ? 'Der bestätigte Link führt zum Store.'
      : 'Offizielle Links folgen nach Freigabe.';

  return {
    homePageDescription:
      `Turniere, Ligen und Qualifikationen im CupCal-Kalender. ${statusText} ${homeEnding}`,
    calendarAppDescription:
      `Cups, Ligen und Trainingsrunden in CupCal. ${statusText} ${getDownloadEnding(status.count)}`,
  };
}

export function createSoftwareApplicationSchema(
  links: ConfirmedStoreLinks,
  description: string,
  siteOrigin = SITE_ORIGIN,
) {
  const platformOffers = [
    { platform: 'android', name: 'CupCal für Android' },
    { platform: 'ios', name: 'CupCal für iOS' },
  ] as const;

  return {
    '@type': 'SoftwareApplication',
    '@id': `${siteOrigin}/#cupcal-app`,
    name: 'CupCal',
    description,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: ['Android', 'iOS'],
    offers: platformOffers.map(({ platform, name }) => {
      const url = links[platform];
      return {
        '@type': 'Offer',
        name,
        availability: url ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        ...(url ? { url } : {}),
      };
    }),
  };
}

const storeSearchMetadata = createStoreSearchMetadata(confirmedStoreLinks);
export const homePageDescription = storeSearchMetadata.homePageDescription;

export interface SeoPageSection {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
}

export interface SeoTopicPage {
  slug: string;
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  cardDescription: string;
  sections: SeoPageSection[];
}

export const seoTopicPages: SeoTopicPage[] = [
  {
    slug: 'turnierkalender-app',
    path: '/turnierkalender-app/',
    title: 'Turnierkalender-App: Termine im Blick behalten | CupCal',
    description: storeSearchMetadata.calendarAppDescription,
    eyebrow: 'Kalender-App',
    h1: 'Turnierkalender-App für Cups, Ligen und Events',
    intro:
      'CupCal bündelt Wettkampftermine in einer mobilen Kalenderansicht. Der Monat gibt den Überblick; die Agenda darunter zeigt, was am ausgewählten Tag ansteht.',
    cardDescription:
      'Monatsansicht, Tagesagenda und Veranstaltungskategorien in einer mobilen Kalenderansicht.',
    sections: [
      {
        heading: 'Monatsübersicht und Tagesagenda',
        paragraphs: [
          'Im Monatskalender erkennst du Tage mit Terminen und wählst einen davon aus. Unter dem Kalender werden die Veranstaltungen dieses markierten Tages als Liste angezeigt.',
          'So kannst du erst den Zeitraum überblicken und danach die Startzeiten und Details der einzelnen Termine prüfen.',
        ],
      },
      {
        heading: 'Wettbewerbe unterscheiden und filtern',
        paragraphs: [
          'CupCal ordnet Veranstaltungen nach Kategorien wie Turnier, Liga, Qualifikation und Trainingsrunde. Die Farblegende hilft, diese Arten im Kalender auseinanderzuhalten.',
          'Mit dem Filter kannst du die angezeigten Termine auf die für dich relevanten Kategorien eingrenzen.',
        ],
      },
      {
        heading: 'Verfügbarkeit der App',
        paragraphs: [
          confirmedStoreLinks.android
            ? 'Die Android-App ist jetzt im offiziellen Google Play Store verfügbar.'
            : 'Die Android-App ist noch nicht im Google Play Store verfügbar; der offizielle Download-Link wird nach Freigabe ergänzt.',
          confirmedStoreLinks.ios
            ? 'Die iOS-App ist jetzt im offiziellen App Store verfügbar.'
            : 'Die iOS-App ist noch nicht im App Store verfügbar; ein Veröffentlichungstermin steht noch nicht fest.',
        ],
      },
    ],
  },
  {
    slug: 'turniertermine-organisieren',
    path: '/turniertermine-organisieren/',
    title: 'Turniertermine finden und filtern | CupCal Kalender',
    description:
      'Finde Turniertermine schneller: Filtere nach Eventtyp, prüfe die Tagesagenda und speichere Termine nach der Anmeldung in deiner Merkliste für später.',
    eyebrow: 'Termine organisieren',
    h1: 'Turniertermine finden, filtern und merken',
    intro:
      'Wenn mehrere Wettbewerbe im Kalender stehen, hilft ein fester Ablauf: erst den Zeitraum wählen, dann passende Kategorien filtern und wichtige Termine speichern.',
    cardDescription:
      'Ein kurzer Ablauf zum Filtern, Prüfen und Speichern kommender Wettkampftermine.',
    sections: [
      {
        heading: 'So findest du den passenden Termin',
        steps: [
          'Wähle im Kalender einen Tag aus. Die Tagesagenda darunter zeigt die dazugehörigen Termine.',
          'Öffne den Filter und begrenze die Liste auf Kategorien wie Turnier, Liga oder Qualifikation.',
          'Öffne einen Termin, um die Veranstaltungsdetails und die Startzeit zu prüfen.',
        ],
      },
      {
        heading: 'Wichtige Termine in der Merkliste behalten',
        paragraphs: [
          'Angemeldete Benutzer können einen Termin als Favorit speichern. Die gemerkten Termine erscheinen gesammelt in der Agenda, damit du sie später wiederfindest.',
          'Gespeicherte Termine bleiben laut CupCal auch ohne Internetverbindung auf dem Gerät verfügbar.',
        ],
      },
      {
        heading: 'Ist für Favoriten ein Konto nötig?',
        paragraphs: [
          'Ja. Das Speichern von Terminen ist an ein angemeldetes Konto gebunden. Kalender und Terminansicht bleiben davon getrennt; die Schaltfläche fordert zur Anmeldung auf, wenn du noch nicht angemeldet bist.',
        ],
      },
    ],
  },
  {
    slug: 'turnierzeiten-zeitzone',
    path: '/turnierzeiten-zeitzone/',
    title: 'Turnierzeiten in deiner Zeitzone | CupCal Kalender',
    description:
      'CupCal zeigt Turniertermine in der eingestellten Gerätezeit. Datum und Startzeit erscheinen in deiner lokalen Kalenderansicht, ganz ohne Umrechnung von Hand.',
    eyebrow: 'Zeitangaben',
    h1: 'Turnierzeiten in deiner Gerätezeitzone',
    intro:
      'Ein Zeitplan ist nur hilfreich, wenn die Startzeit zu deinem Ort passt. CupCal formatiert die Termine nach der auf deinem Gerät eingestellten Zeitzone.',
    cardDescription:
      'Erfahre, wie CupCal Startzeiten anhand der Gerätezeitzone darstellt.',
    sections: [
      {
        heading: 'Wie CupCal Zeitangaben anzeigt',
        paragraphs: [
          'Datum und Uhrzeit eines Termins werden in der lokalen Zeit des Geräts dargestellt. Die Kalenderansicht benennt zusätzlich die verwendete Gerätezeitzone und den aktuellen UTC-Versatz.',
          'Dadurch musst du eine angezeigte Startzeit nicht selbst von einer anderen Zeitzone umrechnen.',
        ],
      },
      {
        heading: 'Was bei Reisen und Zeitumstellungen wichtig ist',
        paragraphs: [
          'Wenn sich die Zeitzone deines Geräts ändert, richtet sich die Anzeige nach der neuen Geräteeinstellung. Prüfe bei Reisen deshalb, ob Datum und Uhrzeit auf deinem Gerät automatisch aktualisiert werden.',
          'Der UTC-Versatz kann sich durch Sommer- und Winterzeit ändern. Entscheidend für die Anzeige ist die Zeitzone, die dein Betriebssystem aktuell meldet.',
        ],
      },
      {
        heading: 'Bei offiziellen Zeitplänen gegenprüfen',
        paragraphs: [
          'Veranstaltungspläne können aktualisiert werden. Wenn ein Termin kurzfristig verschoben wird, prüfe die aktuelle Ankündigung des Veranstalters und vergleiche sie mit dem Eintrag in CupCal.',
        ],
      },
    ],
  },
];

export function normalizeWebsitePath(pathname: string): string {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (withLeadingSlash === '/') return '/';
  return `${withLeadingSlash.replace(/\/+$/, '')}/`;
}
