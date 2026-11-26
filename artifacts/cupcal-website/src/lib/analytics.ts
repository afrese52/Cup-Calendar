type AnalyticsData = Record<string, string | number | boolean>;

const AVAILABILITY_CTA_PLACEMENT_KEY = 'cupcal:availability-cta-placement';

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
