import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowRight, Bookmark, CalendarDays, Check, Clock3, Download, Filter, WifiOff } from 'lucide-react';
import { trackEvent } from './lib/analytics';
import { normalizeWebsitePath, seoTopicPages } from './content/seo-pages';
import { SeoTopicPageView } from './pages/seo-topic-page';

const websiteLogo = `${import.meta.env.BASE_URL}cupcal-website-logo-transparent.webp`;
const appLogo = `${import.meta.env.BASE_URL}cupcal-app-logo.webp`;

interface AppProps {
  pathname?: string;
}

const features = [
  {
    number: '01',
    title: 'Alles im Blick. Ein Kalender.',
    description: 'Turniere, Ligen, Qualifikationen und Trainingsrunden übersichtlich an einem Ort.',
    icon: CalendarDays,
  },
  {
    number: '02',
    title: 'Finde genau deine Termine.',
    description: 'Nach Eventtyp filtern und wichtige Cups als Favorit markieren.',
    icon: Filter,
  },
  {
    number: '03',
    title: 'Dein nächster Start. Zur richtigen Zeit.',
    description: 'Termine in deiner Gerätezeit – damit aus „gleich“ auch wirklich gleich wird.',
    icon: Clock3,
  },
];

function App({ pathname }: AppProps = {}) {
  const viewedSections = useRef(new Set<string>());
  const currentPath = normalizeWebsitePath(
    pathname ?? (typeof window === 'undefined' ? '/' : window.location.pathname),
  );
  const topicPage = seoTopicPages.find((page) => page.path === currentPath);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const sections = document.querySelectorAll<HTMLElement>('[data-analytics-section]');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;

          const section = entry.target.getAttribute('data-analytics-section');
          if (!section || viewedSections.current.has(section)) continue;

          viewedSections.current.add(section);
          trackEvent('content_section_view', { section, page: currentPath });
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.5 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  if (topicPage) return <SeoTopicPageView page={topicPage} />;

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
      <header className="container topbar">
        <a
          className="brand"
          href="/"
          aria-label="CupCal – zum Anfang"
          data-testid="link-home"
          onClick={() => trackEvent('site_navigation_click', { destination: 'home', placement: 'brand' })}
        >
          <img className="website-logo" src={websiteLogo} alt="CupCal – Turnierkalender" width={500} height={162} data-testid="img-cupcal-icon" />
        </a>
        <nav className="nav-links" aria-label="Hauptnavigation">
          <a href="#funktionen" data-testid="link-funktionen" onClick={() => trackEvent('site_navigation_click', { destination: 'features', placement: 'main_nav' })}>Funktionen</a>
          <a href="#vorschau" data-testid="link-vorschau" onClick={() => trackEvent('site_navigation_click', { destination: 'preview', placement: 'main_nav' })}>Ein Blick hinein</a>
          <a href="/turnierkalender-app/" data-testid="link-turnierkalender-app" onClick={() => trackEvent('site_navigation_click', { destination: 'turnierkalender-app', placement: 'main_nav' })}>Kalender-App</a>
          <a href="#verfuegbarkeit" data-testid="link-verfuegbarkeit" onClick={() => trackEvent('site_navigation_click', { destination: 'availability', placement: 'main_nav' })}>Verfügbarkeit</a>
        </nav>
        <a
          className="nav-cta"
          href="#verfuegbarkeit"
          data-testid="button-download-status"
          onClick={() => trackEvent('availability_cta_click', { placement: 'header' })}
        >
          <span>App-Status</span><ArrowRight aria-hidden="true" />
        </a>
      </header>

      <main id="main-content" tabIndex={-1}>
      <section className="container hero" id="start" data-testid="section-hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">Für deinen nächsten Drop</div>
            <h1>Dein <span>CupCal-<br className="mobile-h1-break" />Turnierkalender.</span><br />Schon im Blick.</h1>
            <p className="hero-copy">
              Finde mit CupCal Turniere, Ligen, Qualifikationen und Trainingsrunden.
              Filtere Termine und speichere deine Favoriten, damit du kommende Starts schnell im Blick hast.
            </p>
            <div className="hero-actions">
              <a
                className="button-primary"
                href="#funktionen"
                data-testid="button-discover"
                onClick={() => trackEvent('hero_cta_click', { action: 'discover', destination: 'features' })}
              >
                CupCal entdecken <ArrowDown aria-hidden="true" />
              </a>
              <a
                className="button-muted"
                href="#verfuegbarkeit"
                data-testid="button-availability"
                onClick={() => trackEvent('availability_cta_click', { placement: 'hero' })}
              >
                <Download aria-hidden="true" /> Download-Status
              </a>
            </div>
            <div className="hero-note"><b>Für die Community gemacht.</b> Unabhängiges Fanprojekt.</div>
          </div>
          <div className="hero-art" role="img" aria-label="CupCal App-Symbol und Vorschauhinweise" data-testid="visual-hero">
            <div className="art-orbit" />
            <img className="hero-icon" src={appLogo} alt="CupCal-App-Logo mit goldenem Pokal und Kalender auf dunklem Grund" width={640} height={640} fetchPriority="high" />
            <div className="floating-tag tag-one">
              <CalendarDays aria-hidden="true" />
              <span><strong>Alle Cups</strong><small>an einem Ort</small></span>
            </div>
            <div className="floating-tag tag-two">
              <Bookmark aria-hidden="true" />
              <span><strong>Dein Fokus</strong><small>Favoriten im Blick</small></span>
            </div>
            <div className="signal"><i /> WENIGER SUCHEN · MEHR SPIELEN</div>
          </div>
        </div>
      </section>

      <div className="ticker" aria-label="CupCal im Überblick" data-testid="text-value-strip">
        <div className="container">
          <div className="ticker-track">
            <span>Turniere <b>·</b> Ligen <b>·</b> Qualifikationen <b>·</b> Trainingsrunden <b>·</b> Favoriten <b>·</b> Offline verfügbar <b>·</b></span>
            <span aria-hidden="true">Turniere <b>·</b> Ligen <b>·</b> Qualifikationen <b>·</b> Trainingsrunden <b>·</b> Favoriten <b>·</b> Offline verfügbar <b>·</b></span>
          </div>
        </div>
      </div>

      <section
        className="section container"
        id="funktionen"
        data-testid="section-features"
        data-analytics-section="features"
      >
        <div className="overview">
          <div>
            <div className="section-label">Der Überblick vor dem Match</div>
            <h2 className="section-title">Weniger Tabs.<br /><span>Mehr Fokus.</span></h2>
            <p className="section-intro">
              Wenn der nächste Wettkampf ansteht, sollte der Plan klar sein.
              CupCal sortiert die Termine, damit dein Kopf frei bleibt für die Runde.
            </p>
          </div>
          <div className="feature-list">
            {features.map(({ number, title, description, icon: Icon }) => (
              <article className="feature-row" key={number} data-testid={`feature-row-${number}`}>
                <span className="feature-index">{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <Icon className="feature-icon" aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="section container faq-section"
        id="fragen"
        aria-labelledby="faq-title"
        data-analytics-section="faq"
      >
        <div className="section-label">Fragen zu CupCal</div>
        <h2 className="section-title" id="faq-title">CupCal kurz erklärt.</h2>
        <div className="faq-grid">
          <article className="faq-card">
            <h3>Was ist CupCal?</h3>
            <p>CupCal ist ein Turnierkalender, der Cups, Ligen, Qualifikationen und Trainingsrunden übersichtlich an einem Ort bündelt.</p>
          </article>
          <article className="faq-card">
            <h3>Kann ich Termine filtern?</h3>
            <p>Ja. Du kannst Termine nach Eventtyp filtern und so die Wettbewerbe finden, die dich interessieren.</p>
          </article>
          <article className="faq-card">
            <h3>Wie speichere ich wichtige Termine?</h3>
            <p>Nach der Anmeldung kannst du Termine als Favoriten speichern und später in deiner Agenda wiederfinden.</p>
          </article>
          <article className="faq-card">
            <h3>Funktioniert CupCal offline?</h3>
            <p>Gespeicherte Termine bleiben auch ohne Internetverbindung griffbereit.</p>
          </article>
          <article className="faq-card">
            <h3>Wann kann ich CupCal herunterladen?</h3>
            <p>CupCal ist noch nicht in den Stores verfügbar. Die Android-Veröffentlichung ist für den 30. November 2026 geplant; für iOS steht noch kein Termin fest.</p>
          </article>
        </div>
      </section>

      <section
        className="section preview-section"
        id="vorschau"
        data-testid="section-preview"
        data-analytics-section="calendar_preview"
      >
        <div className="container preview-layout">
          <div className="preview-copy">
            <div className="section-label">Ein Blick in CupCal</div>
            <h2 className="section-title">Der Spielplan.<br /><span>Auf einen Blick.</span></h2>
            <p className="section-intro">
              Monatsübersicht, Event-Kategorien und die nächsten Starts – kompakt in einer Kalenderansicht.
              Ein beispielhafter Einblick in die App.
            </p>
            <div className="preview-caption"><Check aria-hidden="true" /> Vorschau aus der CupCal-App</div>
          </div>
          <div className="phone-frame" role="img" aria-label="Beispielhafte Kalenderansicht mit Eventtypen und kommenden Terminen" data-testid="visual-calendar-preview">
            <div className="phone-head">
              <div className="phone-brand"><b>CUP</b>CAL · KALENDER</div>
              <span className="phone-status">MANUELLER IMPORT</span>
            </div>
            <div className="calendar-month">
              <strong>Oktober</strong><small>BEISPIELMONAT · 12 TERMINE</small>
            </div>
            <div className="weekdays">
              {['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="dates">
              {['29', '30', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '1', '2'].map((date, index) => {
                const classes = [
                  index < 2 || index > 32 ? 'quiet' : '',
                  index === 15 ? 'today' : '',
                  [7, 10, 14, 21, 24, 29].includes(index) ? 'event event-lime' : '',
                  [5, 19, 27].includes(index) ? 'event' : '',
                  [12, 23].includes(index) ? 'event event-gold' : '',
                  index === 31 ? 'event event-violet' : '',
                ].filter(Boolean).join(' ');
                return <span className={classes} key={`${date}-${index}`}>{date}</span>;
              })}
            </div>
            <div className="calendar-legend">
              <span><i /> Turnier</span><span><i className="blue" /> Liga</span>
              <span><i className="gold" /> Qualifikation</span><span><i className="violet" /> Training</span>
            </div>
            <div className="events-label">ALS NÄCHSTES · BEISPIELTERMINE</div>
            <div className="event-card">
              <span className="date">04<br />OKT</span><span><strong>Solo-Turnier</strong><small>Start: 18:00 · Gerätezeit</small></span><span className="kind">TURNIER</span>
            </div>
            <div className="event-card">
              <span className="date">08<br />OKT</span><span><strong>Community-Liga</strong><small>Start: 19:30 · Gerätezeit</small></span><span className="kind">LIGA</span>
            </div>
            <div className="event-card">
              <span className="date">12<br />OKT</span><span><strong>Offene Qualifikation</strong><small>Start: 17:00 · Gerätezeit</small></span><span className="kind">QUALI</span>
            </div>
          </div>
        </div>
      </section>

      <section className="offline-band" data-testid="section-offline">
        <div className="container offline-inner">
          <div className="offline-copy">
            <div className="offline-mark"><WifiOff aria-hidden="true" /></div>
            <div>
              <h2>Auch offline auf Kurs.</h2>
              <p>Deine gespeicherten Termine bleiben griffbereit – auch ohne Verbindung.</p>
            </div>
          </div>
          <a
            className="button-dark"
            href="#verfuegbarkeit"
            data-testid="link-offline-info"
            onClick={() => trackEvent('availability_cta_click', { placement: 'offline_band' })}
          >
            CupCal kennenlernen <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </section>

      <section
        className="availability container"
        id="verfuegbarkeit"
        data-testid="section-availability"
        data-analytics-section="availability"
      >
        <div className="section-label">Ehrlich gesagt</div>
        <h2 className="section-title">Android geplant ab 30. November.<br /><span>iOS noch nicht verfügbar.</span></h2>
        <p className="section-intro">
          CupCal ist noch nicht im Google Play Store oder Apple App Store verfügbar.
          Die Android-Veröffentlichung ist für den 30. November 2026 geplant; für iOS steht noch kein Termin fest.
        </p>
        <div className="availability-panel" role="status" data-testid="status-download">
          <CalendarDays className="availability-icon" aria-hidden="true" />
          <div>
            <strong>Android · geplant ab 30. November 2026</strong>
            <p>Noch nicht verfügbar. Veröffentlichung im Google Play Store geplant.</p>
          </div>
        </div>
        <div className="availability-panel" role="status" data-testid="status-ios">
          <Clock3 className="availability-icon" aria-hidden="true" />
          <div>
            <strong>iOS · noch nicht verfügbar</strong>
            <p>Ein Veröffentlichungstermin für den Apple App Store steht noch nicht fest.</p>
          </div>
        </div>
        <div className="disclaimer">Inoffizielles Fanprojekt · Nicht mit Epic Games verbunden oder von Epic Games unterstützt</div>
      </section>

      <section
        className="container topic-directory"
        aria-labelledby="topic-directory-heading"
        data-analytics-section="topic_directory"
      >
        <div className="section-label">CupCal-Wissen</div>
        <h2 className="section-title" id="topic-directory-heading">Mehr zum <span>Kalender.</span></h2>
        <p className="section-intro">
          Erfahre, wie du Turniertermine findest, speicherst und in deiner Gerätezeit ansiehst.
        </p>
        <div className="topic-card-grid">
          {seoTopicPages.map((page) => (
            <a
              className="topic-card"
              href={page.path}
              key={page.slug}
              data-testid={`link-topic-${page.slug}`}
              aria-label={`${page.eyebrow}: ${page.h1}`}
              onClick={() => trackEvent('site_navigation_click', {
                destination: page.slug,
                placement: 'home_topic_directory',
              })}
            >
              <span className="topic-card-label">{page.eyebrow}</span>
              <strong>{page.h1}</strong>
              <span className="topic-card-description">{page.cardDescription}</span>
              <span className="topic-card-link">Mehr erfahren <ArrowRight aria-hidden="true" /></span>
            </a>
          ))}
        </div>
      </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-copy">© CupCal · Der Kalender für deinen Wettkampf-Alltag</div>
          <nav className="topic-footer-links" aria-label="Weitere CupCal-Themen">
            {seoTopicPages.map((page) => (
              <a
                href={page.path}
                key={page.slug}
                data-testid={`link-footer-${page.slug}`}
                onClick={() => trackEvent('site_navigation_click', {
                  destination: page.slug,
                  placement: 'footer',
                })}
              >
                {page.eyebrow}
              </a>
            ))}
          </nav>
          <div className="footer-note">Community-Projekt · Keine offizielle Verbindung zu Epic Games</div>
        </div>
      </footer>
    </div>
  );
}

export default App;
