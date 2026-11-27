type AnalyticsData = Record<string, string | number | boolean>;

const AVAILABILITY_CTA_PLACEMENT_KEY = 'cupcal:availability-cta-placement';
const TOPIC_ENTRY_ATTRIBUTION_KEY = 'cupcal:topic-entry-attribution';
const TOPIC_ENTRY_ATTRIBUTION_MAX_AGE_MS = 5 * 60 * 1000;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Tracking must never interrupt normal site behavior.
  }
}

export function trackTopicNavigationClick(destination: string, placement: string): void {
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        TOPIC_ENTRY_ATTRIBUTION_KEY,
        JSON.stringify({ destination, placement, clickedAt: Date.now() }),
      );
    } catch {
      // Analytics storage must never interrupt normal site behavior.
    }
  }

  trackEvent('site_navigation_click', { destination, placement });
}

export function trackTopicPageEntry(destination: string): void {
  if (typeof window === 'undefined') return;

  try {
    const attribution = window.sessionStorage.getItem(TOPIC_ENTRY_ATTRIBUTION_KEY);
    if (!attribution) return;

    window.sessionStorage.removeItem(TOPIC_ENTRY_ATTRIBUTION_KEY);
    const parsed: unknown = JSON.parse(attribution);
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !('destination' in parsed)
      || !('placement' in parsed)
      || !('clickedAt' in parsed)
      || parsed.destination !== destination
      || typeof parsed.placement !== 'string'
      || typeof parsed.clickedAt !== 'number'
      || Date.now() - parsed.clickedAt > TOPIC_ENTRY_ATTRIBUTION_MAX_AGE_MS
      || parsed.clickedAt > Date.now()
    ) {
      return;
    }

    trackEvent('topic_page_entry', {
      destination,
      placement: parsed.placement,
    });
  } catch {
    // Analytics storage must never interrupt normal site behavior.
  }
}

export function trackAvailabilityCtaClick(placement: string): void {
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(AVAILABILITY_CTA_PLACEMENT_KEY, placement);
    } catch {
      // Analytics storage must never interrupt normal site behavior.
    }
  }

  trackEvent('availability_cta_click', { placement });
}

export function getAvailabilityCtaPlacement(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.sessionStorage.getItem(AVAILABILITY_CTA_PLACEMENT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
