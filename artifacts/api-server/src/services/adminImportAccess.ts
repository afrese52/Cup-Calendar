export type AdminImportAccessReason = "not_configured" | "not_admin";

export function parseAdminEmailAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function getAdminImportAccess(
  email: string | null | undefined,
  configuredEmails: Set<string>,
): { authorized: true; reason: null } | { authorized: false; reason: AdminImportAccessReason } {
  if (configuredEmails.size === 0) {
    return { authorized: false, reason: "not_configured" };
  }
  if (!email || !configuredEmails.has(email.trim().toLowerCase())) {
    return { authorized: false, reason: "not_admin" };
  }
  return { authorized: true, reason: null };
}

export function getSafeUpcomingEvents<T extends {
  start_time: string;
  review_warnings: string[];
}>(
  events: T[],
  snapshotAt: string | null,
): { upcoming: T[]; importable: T[]; skippedPastCount: number } {
  if (!snapshotAt) {
    return { upcoming: [], importable: [], skippedPastCount: events.length };
  }
  const snapshotTimestamp = Date.parse(snapshotAt);
  const upcoming = events.filter((event) => Date.parse(event.start_time) >= snapshotTimestamp);
  return {
    upcoming,
    importable: upcoming.filter((event) => event.review_warnings.length === 0),
    skippedPastCount: events.length - upcoming.length,
  };
}
