import { ArrowRight, CalendarDays, Clock3, Download, Filter } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { seoTopicPages, type SeoTopicPage } from '../content/seo-pages';

const websiteLogo = `${import.meta.env.BASE_URL}cupcal-website-logo-transparent.webp`;

const topicIcons = [CalendarDays, Filter, Clock3];

interface SeoTopicPageViewProps {
  page: SeoTopicPage;
  androidStoreUrl: string | null;
}

export function SeoTopicPageView({ page, androidStoreUrl }: SeoTopicPageViewProps) {
  const relatedPages = seoTopicPages.filter((topic) => topic.slug !== page.slug);
  const pageIndex = seoTopicPages.findIndex((topic) => topic.slug === page.slug);
  const Icon = topicIcons[pageIndex] ?? CalendarDays;

  return (
    <div className="site-shell topic-shell">
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
      <header className="container topbar">
        <a
          className="brand"
          href="/"
          aria-label="CupCal – zur Startseite"
          data-testid="link-topic-home"
          onClick={() => trackEvent('site_navigation_click', { destination: 'home', placement: 'topic_brand' })}
        >
          <img
            className="website-logo"
            src={websiteLogo}
            alt="CupCal – Turnierkalender"
            width={500}
            height={162}
          />
        </a>
        <nav className="nav-links" aria-label="CupCal-Themen">
          {seoTopicPages.map((topic) => (
            <a
              href={topic.path}
              key={topic.slug}
              aria-current={topic.slug === page.slug ? 'page' : undefined}
              data-testid={`link-topic-nav-${topic.slug}`}
              onClick={() => trackEvent('site_navigation_click', {
                destination: topic.slug,
                placement: 'topic_nav',
              })}
            >
              {topic.eyebrow}
            </a>
          ))}
        </nav>
        <a
          className="nav-cta"
          href="/"
          data-testid="link-topic-startseite"
          onClick={() => trackEvent('site_navigation_click', { destination: 'home', placement: 'topic_cta' })}
        >
          <span>Zur Startseite</span><ArrowRight aria-hidden="true" />
        </a>
      </header>

      <main id="main-content" tabIndex={-1}>
      <article className="container topic-article" data-analytics-section="topic_article">
        <nav className="topic-breadcrumb" aria-label="Brotkrumennavigation">
          <a
            href="/"
            data-testid="link-topic-breadcrumb-home"
            onClick={() => trackEvent('site_navigation_click', {
              destination: 'home',
              placement: 'topic_breadcrumb',
            })}
          >
            Startseite
          </a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{page.eyebrow}</span>
        </nav>

        <header className="topic-hero">
          <div className="eyebrow"><Icon aria-hidden="true" /> CupCal · {page.eyebrow}</div>
          <h1>{page.h1}</h1>
          <p className="topic-intro">{page.intro}</p>
          {page.slug === 'turnierkalender-app' && androidStoreUrl && (
            <a
              className="button-primary topic-store-cta"
              href={androidStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-topic-google-play"
              onClick={() => trackEvent('availability_cta_click', {
                placement: 'calendar_app_topic',
                platform: 'android',
              })}
            >
              <Download aria-hidden="true" /> Android bei Google Play herunterladen <ArrowRight aria-hidden="true" />
            </a>
          )}
        </header>

        <div className="topic-sections">
          {page.sections.map((section) => (
            <section className="topic-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.steps && (
                <ol className="topic-steps">
                  {section.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              )}
              {section.bullets && (
                <ul className="topic-bullets">
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <aside className="topic-disclaimer">
          CupCal ist ein unabhängiges Community-Projekt. Es besteht keine offizielle Verbindung zu Epic Games.
        </aside>
      </article>

      <section
        className="container topic-related"
        aria-labelledby="related-topics-heading"
        data-analytics-section="related_topics"
      >
        <div className="section-label">Weiterlesen</div>
        <h2 className="section-title" id="related-topics-heading">Mehr zu <span>CupCal.</span></h2>
        <div className="topic-card-grid">
          {relatedPages.map((topic) => (
            <a
              className="topic-card"
              href={topic.path}
              key={topic.slug}
              data-testid={`link-related-${topic.slug}`}
              aria-label={`${topic.eyebrow}: ${topic.h1}`}
              onClick={() => trackEvent('site_navigation_click', {
                destination: topic.slug,
                placement: 'related_topic',
              })}
            >
              <span className="topic-card-label">{topic.eyebrow}</span>
              <strong>{topic.h1}</strong>
              <span className="topic-card-description">{topic.cardDescription}</span>
              <span className="topic-card-link">Mehr erfahren <ArrowRight aria-hidden="true" /></span>
            </a>
          ))}
        </div>
      </section>

      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-copy">© CupCal · Der Kalender für deinen Wettkampf-Alltag</div>
          <a
            className="topic-footer-home"
            href="/"
            data-testid="link-topic-footer-home"
            onClick={() => trackEvent('site_navigation_click', {
              destination: 'home',
              placement: 'topic_footer',
            })}
          >
            CupCal-Startseite
          </a>
          <nav className="legal-footer-links" aria-label="Rechtliche Informationen">
            <a href="/datenschutz/">Datenschutzerklärung</a>
            <a href="/konto-loeschen/">Konto löschen</a>
          </nav>
          <div className="footer-note">Community-Projekt · Keine offizielle Verbindung zu Epic Games</div>
        </div>
      </footer>
    </div>
  );
}
