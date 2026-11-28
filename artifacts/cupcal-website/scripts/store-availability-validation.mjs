import assert from 'node:assert/strict';

function splitAvailabilityClauses(value) {
  return value
    .replace(/(\d)\.(?=\s+[A-ZÄÖÜ])/g, '$1')
    .split(/[.!?;]\s+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function getPlatformPattern(platform) {
  return platform === 'android' ? /\bandroid(?:-app)?\b/i : /\bios\b/i;
}

export function assertPlatformAvailability(value, platform, available, label) {
  const platformPattern = getPlatformPattern(platform);
  const unavailablePattern =
    /\b(?:noch\s+nicht|nicht)\b.{0,90}\bverfügbar\b|\b(?:geplant|termin\s+offen|termin\s+steht\s+noch\s+nicht\s+fest|noch\s+ausstehend)\b|\btermin\b.{0,35}\bnoch\s+aus\b/i;
  const negatedAvailablePattern = /\b(?:noch\s+nicht|nicht)\b.{0,90}\bverfügbar\b/i;
  const clauses = splitAvailabilityClauses(value)
    .filter((clause) => platformPattern.test(clause));
  const hasAvailableClaim = clauses.some((clause) =>
    /\bverfügbar\b/i.test(clause) && !negatedAvailablePattern.test(clause),
  );
  const hasUnavailableClaim = clauses.some((clause) => unavailablePattern.test(clause));

  if (available) {
    assert.ok(
      hasAvailableClaim,
      `${label} kennzeichnet ${platform} nicht als verfügbar.`,
    );
    assert.ok(
      !hasUnavailableClaim,
      `${label} enthält neben dem bestätigten Store-Link eine gegenteilige ${platform}-Aussage.`,
    );
    return;
  }

  assert.ok(
    !hasAvailableClaim,
    `${label} behauptet ${platform} trotz fehlender bestätigter Store-URL als verfügbar.`,
  );
  assert.ok(
    hasUnavailableClaim,
    `${label} kennzeichnet ${platform} nicht als geplant oder noch nicht verfügbar.`,
  );
}

export function assertPlatformAvailabilityIfMentioned(value, platform, available, label) {
  if (!getPlatformPattern(platform).test(value)) return;
  assertPlatformAvailability(value, platform, available, label);
}
