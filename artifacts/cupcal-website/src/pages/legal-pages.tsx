import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  AccountDeletionConfirmation,
  AccountDeletionRequestForm,
} from '../components/account-deletion-web';
import { SITE_ORIGIN } from '../content/seo-pages';
import type { LegalPageMetadata } from '../content/legal-pages';

function LegalShell({
  page,
  children,
}: {
  page: LegalPageMetadata;
  children: ReactNode;
}) {
  return (
    <div className="site-shell topic-shell legal-shell">
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
      <header className="container topbar">
        <a className="brand" href="/" aria-label="CupCal – zur Startseite">
          <img
            className="website-logo"
            src={`${import.meta.env.BASE_URL}cupcal-website-logo-transparent.webp`}
            alt="CupCal – Turnierkalender"
            width={500}
            height={162}
          />
        </a>
        <nav className="nav-links" aria-label="Rechtliche Informationen">
          <a href="/datenschutz/" aria-current={page.slug === 'datenschutz' ? 'page' : undefined}>Datenschutz</a>
          <a href="/konto-loeschen/" aria-current={page.slug === 'konto-loeschen' ? 'page' : undefined}>Konto löschen</a>
        </nav>
        <a className="nav-cta" href="/">
          <span>Zur Startseite</span><ArrowRight aria-hidden="true" />
        </a>
      </header>
      <main id="main-content" tabIndex={-1}>
        <article className="container legal-article">
          <div className="section-label">CupCal · {page.eyebrow}</div>
          <h1>{page.h1}</h1>
          {children}
        </article>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-copy">© CupCal · Der Kalender für deinen Wettkampf-Alltag</div>
          <nav className="legal-footer-links" aria-label="Rechtliche Informationen">
            <a href="/datenschutz/">Datenschutzerklärung</a>
            <a href="/konto-loeschen/">Konto löschen</a>
            <a href="/">CupCal-Startseite</a>
          </nav>
          <div className="footer-note">Community-Projekt · Keine offizielle Verbindung zu Epic Games</div>
        </div>
      </footer>
    </div>
  );
}

export function LegalPageView({ page }: { page: LegalPageMetadata }) {
  if (page.slug === 'konto-loeschen-bestaetigen') {
    return (
      <LegalShell page={page}>
        <p className="legal-lead">
          Wir prüfen jetzt deinen Bestätigungslink. Das Konto wird nur gelöscht, wenn der Link gültig ist
          und zu deinem bestätigten Konto gehört.
        </p>
        <AccountDeletionConfirmation />
      </LegalShell>
    );
  }

  if (page.slug === 'konto-loeschen') {
    return (
      <LegalShell page={page}>
        <p className="legal-lead">
          Du kannst die Löschung direkt hier im Browser beantragen. Eine installierte App ist nicht nötig.
          Das Konto wird erst gelöscht, wenn du den Bestätigungslink aus der E-Mail öffnest.
        </p>
        <section className="legal-section" aria-labelledby="deletion-steps">
          <h2 id="deletion-steps">Löschlink anfordern</h2>
          <p>
            Melde dich mit der E-Mail-Adresse und dem Passwort des Kontos an, das du löschen möchtest.
            Danach senden wir den Bestätigungslink an diese E-Mail-Adresse.
          </p>
          <AccountDeletionRequestForm />
          <h2>So geht es danach weiter</h2>
          <ol>
            <li>Öffne den Link in der E-Mail, um die Löschung endgültig zu bestätigen.</li>
            <li>Erst danach werden das Konto und die zugehörigen Favoriten gelöscht.</li>
          </ol>
          <p>Der Bestätigungslink ist 30 Minuten gültig. Wenn du die Löschung nicht angefordert hast, ignoriere die E-Mail.</p>
        </section>
        <section className="legal-section" aria-labelledby="deletion-data">
          <h2 id="deletion-data">Welche Daten werden gelöscht?</h2>
          <p>
            Mit der Kontolöschung werden dein CupCal-Konto und die damit verbundenen serverseitigen Favoriten entfernt.
            Eine Löschung aus Sicherungskopien erfolgt innerhalb von sieben Tagen. Betriebsprotokolle werden spätestens
            nach 30 Tagen gelöscht.
          </p>
          <p>
            Informationen zur Verarbeitung und zu deinen Datenschutzrechten findest du in der{' '}
            <a href="/datenschutz/">Datenschutzerklärung</a>. Bei Fragen erreichst du den Verantwortlichen unter{' '}
            <a href="mailto:info@af-software.app">info@af-software.app</a>.
          </p>
        </section>
      </LegalShell>
    );
  }

  return (
    <LegalShell page={page}>
      <p className="legal-updated">Stand: 23. November 2026</p>
      <p className="legal-lead">
        Diese Erklärung beschreibt, welche personenbezogenen Daten CupCal verarbeitet, zu welchen Zwecken und wie lange.
      </p>
      <section className="legal-section" aria-labelledby="privacy-controller">
        <h2 id="privacy-controller">Verantwortlicher</h2>
        <p>
          Andreas Frese<br />
          Am Tonberg 4<br />
          99098 Erfurt<br />
          Deutschland
        </p>
        <p>
          Datenschutzanfragen: <a href="mailto:info@af-software.app">info@af-software.app</a>
        </p>
      </section>
      <section className="legal-section" aria-labelledby="privacy-account">
        <h2 id="privacy-account">Konto und Favoriten</h2>
        <p>
          Wenn du ein Konto erstellst oder dich anmeldest, verarbeitet Supabase Auth deine E-Mail-Adresse,
          dein Passwort und eine Konto-Kennung. CupCal verwendet diese Angaben für Anmeldung,
          E-Mail-Bestätigung, Passwortwiederherstellung und Kontolöschung. Das Passwort wird nicht als
          CupCal-Profilfeld gespeichert.
        </p>
        <p>
          Wenn du Favoriten synchronisierst, werden die Kennungen der gespeicherten Termine mit deiner
          Konto-Kennung in der Supabase-Datenbank gespeichert. Rechtsgrundlage für Konto und Favoriten ist
          die Vertragserfüllung nach Art. 6 Abs. 1 lit. b DSGVO.
        </p>
      </section>
      <section className="legal-section" aria-labelledby="privacy-device">
        <h2 id="privacy-device">Daten auf deinem Gerät und Standort</h2>
        <p>
          Zuletzt geladene Turniertermine und nicht synchronisierte Favoriten können lokal auf deinem Gerät
          gespeichert bleiben. Sitzungsdaten liegen im geschützten Gerätespeicher. Wenn du angemeldet bist,
          werden Favoriten zur Synchronisierung mit deiner Konto-Kennung in der Supabase-Datenbank gespeichert.
        </p>
        <p>
          Wenn du die Standortberechtigung erteilst, ermittelt CupCal auf dem Gerät aus den aktuellen
          Koordinaten die nächstgelegene Turnierregion. Die Koordinaten werden weder gespeichert noch an
          CupCal oder einen Anbieter gesendet. Du kannst die Region auch selbst auswählen oder die
          Standortberechtigung in den Geräteeinstellungen entziehen.
        </p>
      </section>
      <section className="legal-section" aria-labelledby="privacy-website">
        <h2 id="privacy-website">Website und technische Protokolle</h2>
        <p>
          Beim Abruf öffentlicher Turniertermine erhält der CupCal-API-Dienst die dafür nötigen Anfragen.
          Für den sicheren und zuverlässigen Betrieb werden technische Betriebsprotokolle geführt. Diese
          können Anfragepfad, Zeitpunkt, Status und technische Kennungen enthalten und werden 30 Tage
          aufbewahrt.
        </p>
        <p>
          Die Website lädt Schriftdateien über Google Fonts. Dabei baut dein Browser eine Verbindung zu
          Google-Servern auf und übermittelt die technisch erforderlichen Verbindungsdaten, insbesondere
          deine IP-Adresse und Browserinformationen.
        </p>
        <p>
          Eine Live-Prüfung am 27. November 2026 zeigte in den HTML-Antworten von cupcal.af-software.app
          und cup-cal-calendar-for-fn.replit.app das Skript https://i.replit.com/script.js. Replit-Analytics
          war damit in diesen Antworten eingebunden; Replit kann technische Nutzungsdaten verarbeiten.
          Aus der Antwort lässt sich nicht ablesen, welche einzelnen Daten Replit tatsächlich speichert
          oder wo sie verarbeitet werden. CupCal bindet selbst kein Umami-Skript ein. Die Website ruft
          eigene Ereignisse nur über eine vorhandene window.umami-Schnittstelle ab; ohne diese
          Schnittstelle sendet der Code keine CupCal-Ereignisse. Die mobile App verwendet kein Werbe-
          oder Analyse-SDK.
        </p>
      </section>
      <section className="legal-section" aria-labelledby="privacy-providers">
        <h2 id="privacy-providers">Dienstanbieter</h2>
        <ul>
          <li>
            <strong>Supabase:</strong> Anmeldung und Datenbank für Konten und Favoriten. Das CupCal-Projekt
            wird in Frankfurt, EU, betrieben; Supabase Auth verarbeitet auch die Authentifizierungs-E-Mails.
            Weitere Informationen:{' '}
            <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Datenschutz bei Supabase</a>.
          </li>
          <li>
            <strong>Replit:</strong> Hosting der CupCal-Website und API über die veröffentlichte
            Autoscale-Bereitstellung unter cupcal.af-software.app. Die verfügbaren Bereitstellungsdaten
            enthalten keine geografische Region; der Hosting- und Verarbeitungsort ist daher nicht
            bestätigt. Replit-Analytics war in der Live-Prüfung vom 27. November 2026 in den geprüften
            Website-Antworten eingebunden.
            Weitere Informationen:{' '}
            <a href="https://replit.com/privacy" target="_blank" rel="noopener noreferrer">Datenschutz bei Replit</a>.
          </li>
          <li>
            <strong>Google Fonts:</strong> Bereitstellung der auf der Website verwendeten Schriftarten.
            Der bestätigte Verarbeitungsort für CupCal ist Deutschland.
            Weitere Informationen:{' '}
            <a href="https://policies.google.com/privacy?hl=de" target="_blank" rel="noopener noreferrer">
              Datenschutzhinweise von Google
            </a>.
          </li>
        </ul>
      </section>
      <section className="legal-section" aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">Speicherdauer und Löschung</h2>
        <ul>
          <li>Konto- und Favoritendaten werden während der aktiven Kontonutzung gespeichert.</li>
          <li>Nach Kontoschließung werden Konto- und Favoritendaten innerhalb von sieben Tagen gelöscht.</li>
          <li>Betriebsprotokolle werden nach 30 Tagen gelöscht.</li>
          <li>Sicherungskopien werden innerhalb von sieben Tagen überschrieben oder gelöscht.</li>
        </ul>
        <p>
          Du kannst die Löschung jederzeit über die <a href="/konto-loeschen/">öffentliche Kontolöschseite</a>{' '}
          oder in den Kontoeinstellungen der App beantragen.
        </p>
      </section>
      <section className="legal-section" aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Deine Rechte</h2>
        <p>
          Du kannst Auskunft über deine personenbezogenen Daten, deren Berichtigung oder Löschung, die
          Einschränkung der Verarbeitung und – soweit anwendbar – Datenübertragbarkeit verlangen. Einer
          Verarbeitung auf Grundlage berechtigter Interessen kannst du aus Gründen widersprechen, die sich
          aus deiner besonderen Situation ergeben. Außerdem hast du das Recht, dich bei einer
          Datenschutzaufsichtsbehörde zu beschweren.
        </p>
        <p>
          Wende dich dafür an <a href="mailto:info@af-software.app">info@af-software.app</a>. Für die
          Kontolöschung findest du den Ablauf auf der Seite <a href="/konto-loeschen/">Konto löschen</a>.
        </p>
      </section>
      <section className="legal-section" aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Kontakt</h2>
        <p>
          Andreas Frese, Am Tonberg 4, 99098 Erfurt, Deutschland<br />
          <a href="mailto:info@af-software.app">info@af-software.app</a>
        </p>
      </section>
    </LegalShell>
  );
}

export function withLegalMetadata(html: string, page: LegalPageMetadata): string {
  const canonical = `${SITE_ORIGIN}${page.path}`;
  const escapeHtml = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const replacements: Array<[RegExp, string, string]> = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`, 'Seitentitel'],
    [
      /<meta name="description"[^>]*\/?>/i,
      `<meta name="description" content="${escapeHtml(page.description)}" />`,
      'Meta-Beschreibung',
    ],
    [/<link rel="canonical"[^>]*\/?>/i, `<link rel="canonical" href="${canonical}" />`, 'Canonical-URL'],
    [
      /<meta property="og:title"[^>]*\/?>/i,
      `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
      'Open-Graph-Titel',
    ],
    [
      /<meta property="og:description"[^>]*\/?>/i,
      `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
      'Open-Graph-Beschreibung',
    ],
    [/<meta property="og:url"[^>]*\/?>/i, `<meta property="og:url" content="${canonical}" />`, 'Open-Graph-URL'],
    [
      /<meta name="twitter:title"[^>]*\/?>/i,
      `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
      'Twitter-Titel',
    ],
    [
      /<meta name="twitter:description"[^>]*\/?>/i,
      `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
      'Twitter-Beschreibung',
    ],
  ];

  let updatedHtml = html;
  for (const [pattern, replacement, description] of replacements) {
    if (!pattern.test(updatedHtml)) throw new Error(`HTML-Vorlage enthält kein ${description}.`);
    updatedHtml = updatedHtml.replace(pattern, replacement);
  }
  if (page.noIndex) {
    const robotsTag = '<meta name="robots" content="noindex, nofollow" />';
    updatedHtml = /<meta name="robots"[^>]*\/?>/i.test(updatedHtml)
      ? updatedHtml.replace(/<meta name="robots"[^>]*\/?>/i, robotsTag)
      : updatedHtml.replace(/<\/head>/i, `${robotsTag}</head>`);
  }
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: page.title,
    description: page.description,
    inLanguage: 'de-DE',
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
  };
  const tag = `<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll('<', '\\u003c')}</script>`;
  if (!/<\/head>/i.test(updatedHtml)) throw new Error('HTML-Vorlage enthält kein Head-Ende.');
  return updatedHtml.replace(/<\/head>/i, `${tag}</head>`);
}
