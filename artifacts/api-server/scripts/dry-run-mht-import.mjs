import { readFile } from "node:fs/promises";
import path from "node:path";

const REGION_CODES = new Set(["EU", "NAE", "NAC", "NAW", "BR", "ASIA", "OCE", "ME", "GLOBAL"]);
export const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;
const MONTHS = new Map([
  ["januar", 1], ["january", 1],
  ["februar", 2], ["february", 2],
  ["märz", 3], ["maerz", 3], ["march", 3],
  ["april", 4],
  ["mai", 5], ["may", 5],
  ["juni", 6], ["june", 6],
  ["juli", 7], ["july", 7],
  ["august", 8],
  ["september", 9],
  ["oktober", 10], ["october", 10],
  ["november", 11],
  ["dezember", 12], ["december", 12],
]);

function parseHeaders(source) {
  const headers = new Map();
  const unfolded = source.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
  }
  return headers;
}

function findHeaderSeparator(buffer) {
  const crlfSeparator = buffer.indexOf(Buffer.from("\r\n\r\n"));
  if (crlfSeparator >= 0) return { index: crlfSeparator, length: 4 };
  const lfSeparator = buffer.indexOf(Buffer.from("\n\n"));
  if (lfSeparator >= 0) return { index: lfSeparator, length: 2 };
  return null;
}

function decodeQuotedPrintable(buffer) {
  const source = buffer.toString("latin1").replace(/=\r?\n/g, "");
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "=" && /^[\da-f]{2}$/i.test(source.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(source.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(source.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeMimeBody(buffer, transferEncoding = "") {
  const encoding = transferEncoding.toLowerCase();
  if (encoding === "base64") return Buffer.from(buffer.toString("ascii"), "base64").toString("utf8");
  if (encoding === "quoted-printable") return decodeQuotedPrintable(buffer);
  return buffer.toString("utf8");
}

export function extractMhtHtml(buffer) {
  const topSeparator = findHeaderSeparator(buffer);
  if (!topSeparator) throw new Error("Die MHT-Datei enthält keinen gültigen MIME-Kopf.");

  const topHeaders = parseHeaders(buffer.subarray(0, topSeparator.index).toString("latin1"));
  const contentType = topHeaders.get("content-type") ?? "";
  const boundaryMatch = contentType.match(/\bboundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) throw new Error("In der MHT-Datei wurde keine Multipart-Grenze gefunden.");

  const boundary = Buffer.from(`--${boundaryMatch[1] ?? boundaryMatch[2]}`);
  const firstBoundary = buffer.indexOf(boundary, topSeparator.index + topSeparator.length);
  if (firstBoundary < 0) throw new Error("Der erste MHT-Abschnitt fehlt.");

  let partStart = firstBoundary + boundary.length;
  if (buffer.subarray(partStart, partStart + 2).toString() === "--") {
    throw new Error("Die MHT-Datei enthält keinen HTML-Abschnitt.");
  }
  while (buffer[partStart] === 10 || buffer[partStart] === 13) partStart += 1;

  const nextBoundary = buffer.indexOf(boundary, partStart);
  if (nextBoundary < 0) throw new Error("Der HTML-Abschnitt ist nicht abgeschlossen.");
  let part = buffer.subarray(partStart, nextBoundary);
  while (part.length && (part[part.length - 1] === 10 || part[part.length - 1] === 13)) {
    part = part.subarray(0, part.length - 1);
  }

  const partSeparator = findHeaderSeparator(part);
  if (!partSeparator) throw new Error("Der erste MHT-Abschnitt hat keinen MIME-Kopf.");
  const partHeaders = parseHeaders(part.subarray(0, partSeparator.index).toString("latin1"));
  const partType = partHeaders.get("content-type") ?? "";
  if (!partType.toLowerCase().startsWith("text/html")) {
    throw new Error(`Der erste MHT-Abschnitt ist kein HTML (${partType || "unbekannter Typ"}).`);
  }

  const html = decodeMimeBody(
    part.subarray(partSeparator.index + partSeparator.length),
    partHeaders.get("content-transfer-encoding"),
  );
  const sourceUrl =
    topHeaders.get("snapshot-content-location") ??
    partHeaders.get("content-location") ??
    null;
  const snapshotDate = topHeaders.get("date");
  const parsedSnapshotDate = snapshotDate ? Date.parse(snapshotDate) : Number.NaN;

  return {
    html,
    sourceUrl,
    snapshotAt: Number.isFinite(parsedSnapshotDate)
      ? new Date(parsedSnapshotDate).toISOString()
      : null,
  };
}

export function getSnapshotFreshness(snapshotAt, now = new Date()) {
  if (!snapshotAt) {
    return { snapshotAgeMs: null, isSnapshotStale: false };
  }

  const snapshotTime = Date.parse(snapshotAt);
  const nowTime = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(snapshotTime) || !Number.isFinite(nowTime)) {
    return { snapshotAgeMs: null, isSnapshotStale: false };
  }

  const snapshotAgeMs = nowTime - snapshotTime;
  return {
    snapshotAgeMs,
    isSnapshotStale: snapshotAgeMs > MAX_SNAPSHOT_AGE_MS,
  };
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: "\"",
    rsquo: "’",
    lsquo: "‘",
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);?/gi, (entity, code) => {
    if (code[0] === "#") {
      const isHex = code[1]?.toLowerCase() === "x";
      const point = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(point);
      } catch {
        return entity;
      }
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function parseAttributes(tag) {
  const attributes = {};
  const body = tag.replace(/^<\s*[a-z][\w:-]*/i, "").replace(/\/?>$/, "");
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of body.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
}

function htmlFragmentToText(fragment) {
  return decodeHtmlEntities(fragment.replace(/<!--[\s\S]*?-->|<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateLabel(text) {
  const match = text.match(
    /(?:^|\D)(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(20\d{2})(?:\D|$)/,
  );
  if (!match) return null;
  const month = MONTHS.get(match[2].toLowerCase());
  if (!month) return null;
  const day = Number(match[1]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function zonedParts(epochMs, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function sameWallTime(actual, expected) {
  return Object.keys(expected).every((key) => actual[key] === expected[key]);
}

function getTimeZoneOffset(epochMs, timeZone) {
  const parts = zonedParts(epochMs, timeZone);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ) - epochMs;
}

export function wallTimeToEpoch(dateParts, hours, minutes, timeZone) {
  const expected = {
    ...dateParts,
    hour: hours,
    minute: minutes,
    second: 0,
  };
  const wallAsUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hours,
    minutes,
  );
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((hoursFromWall) =>
      getTimeZoneOffset(wallAsUtc + hoursFromWall * 60 * 60 * 1000, timeZone),
    ),
  );
  const matches = [...offsets]
    .map((offset) => wallAsUtc - offset)
    .filter((instant) => sameWallTime(zonedParts(instant, timeZone), expected))
    .sort((left, right) => left - right);

  if (!matches.length) {
    throw new Error(`Die lokale Uhrzeit ist in ${timeZone} ungültig oder nicht vorhanden.`);
  }
  return matches[0];
}

function datePlusOneDay(dateParts) {
  const nextDay = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + 1));
  return {
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth() + 1,
    day: nextDay.getUTCDate(),
  };
}

export function mapTournamentType(title) {
  const indicators = [
    [/\bFNCS\b/i, "FNCS"],
    [/\b(?:CASH CUP|VICTORY CUP)\b/i, "Cash Cup"],
    [/\bRANKED CUP\b/i, "Ranked Cup"],
    [/\bCOMMUNITY\s+(?:CUP|TOURNAMENT)\b/i, "Community"],
  ];
  const matches = [...new Set(
    indicators
      .filter(([pattern]) => pattern.test(title))
      .map(([, type]) => type),
  )];
  return matches.length === 1 ? matches[0] : null;
}

export function mapCategory(title, tournamentType) {
  const lower = title.toLowerCase();
  if (lower.includes("qualifier") || lower.includes("qualification") || lower.includes("qualifikation")) {
    return "Qualifikation";
  }
  if (lower.includes("scrim") || lower.includes("training") || lower.includes("practice")) {
    return "Trainingsrunde";
  }
  if (tournamentType === "FNCS" && (lower.includes("league") || lower.includes("division"))) {
    return "Liga";
  }
  return "Turnier";
}

export function mapGameMode(title) {
  const lower = title.toLowerCase();
  const hasZeroBuild = /\bzero[\s-]+build\b|\bnull bauen\b/i.test(lower);
  const hasReload = /\breload\b/i.test(lower);
  const hasCreative = /\bcreative\b/i.test(lower);
  const hasBattleRoyale = /\bbattle royale\b/i.test(lower);

  // Epic uses Battle Royale as the broad event category, while the card can
  // name a more specific ruleset. In the Reload Zero Build event variant,
  // Zero Build is the distinguishing ruleset; otherwise Reload takes
  // precedence over the broad Battle Royale label. Do not guess when
  // unrelated concrete modes (such as Creative and Reload) are both present.
  if (hasCreative && (hasZeroBuild || hasReload || hasBattleRoyale)) return null;
  if (hasZeroBuild) return "Zero Build";
  if (hasReload) return "Reload";
  if (hasBattleRoyale) return "Battle Royale";

  const modes = [
    [/\bcreative\b/i, "Community"],
  ];
  const matches = [...new Set(
    modes
      .filter(([pattern]) => pattern.test(lower))
      .map(([, mode]) => mode),
  )];
  return matches.length === 1 ? matches[0] : null;
}

export function mapTournamentSeries(title) {
  return /\breload\b/i.test(title) ? "Reload" : null;
}

export function mapGameRuleset(title, gameMode) {
  const lower = title.toLowerCase();
  if (/\bzero[\s-]+build\b|\bnull bauen\b/i.test(lower)) return "Zero Build";
  if (/\bbattle royale\b/i.test(lower) || gameMode === "Reload") return "Battle Royale";
  if (gameMode === "Community") return "Community";
  return null;
}

export function mapTeamFormat(cardText, officialEventSlug = "") {
  const formats = [
    [/\bsolos?\b/i, "Solo"],
    [/\bduos?\b/i, "Duos"],
    [/\btrios?\b/i, "Trios"],
    [/\bsquads?\b/i, "Squads"],
  ];
  const matches = formats
    .filter(([pattern]) => pattern.test(cardText))
    .map(([, format]) => format);
  // Epic's official event slug can disambiguate a generic "Team" card, but
  // only explicit squad tokens in that slug count as evidence.
  const slugWords = officialEventSlug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  if (slugWords.some((word) => /^squads?$/i.test(word))) matches.push("Squads");
  const distinctMatches = [...new Set(matches)];
  return distinctMatches.length === 1 ? distinctMatches[0] : null;
}

function getRegion(sourceUrl, regionOverride) {
  const candidate = regionOverride;
  if (candidate && REGION_CODES.has(candidate.toUpperCase())) return candidate.toUpperCase();
  if (candidate) throw new Error(`Unbekannte Region: ${candidate}`);
  if (!sourceUrl) throw new Error("Die Region fehlt; gib sie mit --region an.");

  let region;
  try {
    region = new URL(sourceUrl).searchParams.get("region");
  } catch {
    throw new Error("Die Quell-URL ist ungültig; gib die Region mit --region an.");
  }
  if (!region || !REGION_CODES.has(region.toUpperCase())) {
    throw new Error("Die Region fehlt oder ist ungültig; gib sie mit --region an.");
  }
  return region.toUpperCase();
}

function extractEventAnchors(html, sourceUrl, timeZone, region) {
  const events = [];
  const issues = [];
  const seenIds = new Set();
  let currentDate = null;
  let cursor = 0;
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g;

  while (true) {
    tokenPattern.lastIndex = cursor;
    const tokenMatch = tokenPattern.exec(html);
    if (!tokenMatch) break;
    const token = tokenMatch[0];
    const tokenStart = tokenMatch.index;
    const tokenEnd = tokenPattern.lastIndex;

    if (token.startsWith("<!--") || token.startsWith("<!")) {
      cursor = tokenEnd;
      continue;
    }

    const openingTag = token.match(/^<\s*([a-z][\w:-]*)\b/i);
    if (!openingTag) {
      const date = parseDateLabel(decodeHtmlEntities(token).replace(/\s+/g, " ").trim());
      if (date) currentDate = date;
      cursor = tokenEnd;
      continue;
    }

    const tagName = openingTag[1].toLowerCase();
    if (tagName === "script" || tagName === "style" || tagName === "noscript") {
      const closePattern = new RegExp(`<\\/\\s*${tagName}\\s*>`, "ig");
      closePattern.lastIndex = tokenEnd;
      const closing = closePattern.exec(html);
      cursor = closing ? closePattern.lastIndex : html.length;
      continue;
    }

    if (tagName !== "a") {
      cursor = tokenEnd;
      continue;
    }

    const attributes = parseAttributes(token);
    if (!attributes.id?.startsWith("schedule-event-link-")) {
      cursor = tokenEnd;
      continue;
    }

    const closingAnchorPattern = /<\/a\s*>/ig;
    closingAnchorPattern.lastIndex = tokenEnd;
    const closingAnchor = closingAnchorPattern.exec(html);
    if (!closingAnchor) {
      issues.push({ anchorId: attributes.id, errors: ["Der Turnierlink ist nicht geschlossen."] });
      break;
    }

    const title = htmlFragmentToText(html.slice(tokenEnd, closingAnchor.index));
    const eventUrl = (() => {
      try {
        return new URL(attributes.href ?? "", sourceUrl ?? undefined);
      } catch {
        return null;
      }
    })();
    const isOfficialFortniteDomain = eventUrl
      && (eventUrl.hostname === "fortnite.com" || eventUrl.hostname.endsWith(".fortnite.com"));
    const isOfficialFortniteEventUrl = eventUrl?.protocol === "https:"
      && isOfficialFortniteDomain;
    const eventPathMatch = eventUrl?.pathname.match(/^\/competitive\/events\/([^/]+)\/?$/);
    let eventSlug = null;
    if (eventPathMatch) {
      try {
        const decodedSlug = decodeURIComponent(eventPathMatch[1]);
        if (decodedSlug && !decodedSlug.includes("/")) eventSlug = decodedSlug;
      } catch {
        eventSlug = null;
      }
    }
    const roundIds = eventUrl?.searchParams.getAll("round") ?? [];
    const roundId = roundIds.length === 1 ? roundIds[0] : null;
    const hasMultipleRoundIds = roundIds.length > 1;
    const hasEmptyRoundId = roundIds.length === 1 && roundId.trim().length === 0;
    const hasRecognizedOfficialEventFormat = isOfficialFortniteEventUrl
      && Boolean(eventSlug)
      && roundIds.length === 1
      && !hasEmptyRoundId;
    const officialFormatNeedsReview = isOfficialFortniteDomain
      && !hasMultipleRoundIds
      && !hasEmptyRoundId
      && !hasRecognizedOfficialEventFormat;
    const officialEventSlug = hasRecognizedOfficialEventFormat ? eventSlug : "";
    const id = eventSlug
      && roundId
      && !hasEmptyRoundId
      && (!isOfficialFortniteDomain || hasRecognizedOfficialEventFormat)
      ? `epic:${eventSlug}:${roundId}`
      : null;
    const errors = [];
    const timeRange = (attributes["aria-label"] ?? "").match(
      /(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})\s*(?:Uhr)?/i,
    );

    if (!currentDate) errors.push("Kein Tagesdatum vor der Turnierkarte gefunden.");
    if (!title) errors.push("Der Turniername fehlt.");
    if (!timeRange) errors.push("Die Start- und Endzeit fehlt oder ist nicht lesbar.");
    if (hasMultipleRoundIds) {
      errors.push("Der Link enthält mehrere Rundenkennungen und ist dadurch mehrdeutig.");
    } else if (hasEmptyRoundId) {
      errors.push("Die Rundenkennung im Link ist leer.");
    } else if (officialFormatNeedsReview) {
      errors.push(
        "Das offizielle Eventlink-Format wird nicht erkannt; Link vor dem Import prüfen.",
      );
    } else if (!id) {
      errors.push("Event- oder Rundenkennung fehlt im Link.");
    }
    if (!isOfficialFortniteEventUrl && !officialFormatNeedsReview) {
      errors.push("Der Eventlink verweist nicht auf eine offizielle Fortnite-Domain.");
    }

    if (errors.length) {
      issues.push({ anchorId: attributes.id, id, title, errors });
      cursor = closingAnchorPattern.lastIndex;
      continue;
    }

    if (seenIds.has(id)) {
      issues.push({ anchorId: attributes.id, title, errors: ["Doppelte Event-/Rundenkennung."] });
      cursor = closingAnchorPattern.lastIndex;
      continue;
    }
    seenIds.add(id);

    try {
      const [startHour, startMinute] = timeRange[1].split(":").map(Number);
      const [endHour, endMinute] = timeRange[2].split(":").map(Number);
      const start = wallTimeToEpoch(currentDate, startHour, startMinute, timeZone);
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      const endDate = endMinutes < startMinutes ? datePlusOneDay(currentDate) : currentDate;
      const end = wallTimeToEpoch(endDate, endHour, endMinute, timeZone);
      if (end <= start) throw new Error("Die Endzeit liegt nicht nach der Startzeit.");

      const tournamentType = mapTournamentType(`${title} ${attributes["aria-label"] ?? ""}`);
      if (!tournamentType) {
        issues.push({
          anchorId: attributes.id,
          id,
          title,
          errors: ["Turnierart fehlt oder ist nicht eindeutig angegeben."],
        });
        cursor = closingAnchorPattern.lastIndex;
        continue;
      }
      const teamFormat = mapTeamFormat(`${title} ${attributes["aria-label"] ?? ""}`, officialEventSlug);
      const gameMode = mapGameMode(`${title} ${attributes["aria-label"] ?? ""}`);
      if (!gameMode) {
        issues.push({
          anchorId: attributes.id,
          id,
          title,
          errors: ["Spielmodus fehlt oder ist nicht eindeutig angegeben."],
        });
        cursor = closingAnchorPattern.lastIndex;
        continue;
      }
      const classificationText = `${title} ${attributes["aria-label"] ?? ""}`;
      const tournamentSeries = mapTournamentSeries(classificationText);
      const gameRuleset = mapGameRuleset(classificationText, gameMode);
      if (!teamFormat) {
        issues.push({
          anchorId: attributes.id,
          id,
          title,
          errors: ["Spielformat fehlt oder ist nicht eindeutig angegeben."],
        });
        cursor = closingAnchorPattern.lastIndex;
        continue;
      }

      events.push({
        id,
        title,
        description: "",
        poster_url: null,
        region,
        game_mode: gameMode,
        game_ruleset: gameRuleset,
        tournament_series: tournamentSeries,
        team_format: teamFormat,
        tournament_type: tournamentType,
        category: mapCategory(title, tournamentType),
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        is_featured: false,
        review_warnings: [],
      });
    } catch (error) {
      issues.push({
        anchorId: attributes.id,
        title,
        errors: [error instanceof Error ? error.message : "Zeitangabe konnte nicht verarbeitet werden."],
      });
    }

    cursor = closingAnchorPattern.lastIndex;
    if (tokenStart >= cursor) cursor = tokenEnd;
  }

  return { events, issues };
}

export function parseMhtSchedule(buffer, options = {}) {
  const { html, sourceUrl, snapshotAt } = extractMhtHtml(buffer);
  const region = getRegion(sourceUrl, options.region);
  const timeZone = options.timeZone ?? "Europe/Berlin";
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new Error(`Unbekannte Zeitzone: ${timeZone}`);
  }

  const { events, issues } = extractEventAnchors(html, sourceUrl, timeZone, region);
  if (!events.length && !issues.length) {
    throw new Error("In der MHT-Datei wurden keine Turnierkarten gefunden.");
  }

  const snapshotTime = snapshotAt ? Date.parse(snapshotAt) : Number.NaN;
  const freshness = getSnapshotFreshness(snapshotAt, options.now);
  const upcomingAtSnapshot = Number.isFinite(snapshotTime)
    ? events.filter((event) => Date.parse(event.start_time) >= snapshotTime).length
    : null;

  return {
    sourceUrl,
    snapshotAt,
    ...freshness,
    region,
    timeZone,
    cardCount: events.length + issues.length,
    validCount: events.length,
    invalidCount: issues.length,
    upcomingAtSnapshot,
    events,
    issues,
  };
}

export function parseArguments(args) {
  const result = { file: null, timeZone: "Europe/Berlin", region: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--file") result.file = args[++index] ?? null;
    else if (argument === "--timezone") result.timeZone = args[++index] ?? "";
    else if (argument === "--region") result.region = args[++index] ?? "";
    else if (argument === "--json") result.json = true;
    else if (argument === "--help" || argument === "-h") result.help = true;
    else throw new Error(`Unbekannte Option: ${argument}`);
  }
  return result;
}
export function printUsage() {
  console.log(
    [
      "MHT-Turnierimport im Trockenlauf (schreibt nichts nach Supabase).",
      "",
      "Aufruf:",
      "  pnpm --filter @workspace/api-server run dry-run:mht -- --file <datei.mht>",
      "    [--timezone Europe/Berlin] [--region EU] [--json]",
    ].join("\n"),
  );
}

export async function runDryRun(options) {
  if (!options.file) throw new Error("Bitte gib die MHT-Datei mit --file an.");
  const filePath = path.resolve(process.cwd(), options.file);
  const buffer = await readFile(filePath);
  const result = parseMhtSchedule(buffer, {
    timeZone: options.timeZone,
    region: options.region,
  });

  if (options.json) {
    console.log(JSON.stringify({ file: path.basename(filePath), ...result }, null, 2));
    return result;
  }

  const upcoming = result.events.filter((event) => {
    if (!result.snapshotAt) return false;
    return Date.parse(event.start_time) >= Date.parse(result.snapshotAt);
  });
  const reviewCount = result.events.filter((event) => event.review_warnings.length).length;
  console.log("MHT-Turnierimport: Trockenlauf");
  console.log(`Datei: ${path.basename(filePath)}`);
  console.log(`Quellseite: ${result.sourceUrl ?? "nicht in der Datei angegeben"}`);
  console.log(`Snapshot: ${result.snapshotAt ?? "Zeitpunkt nicht angegeben"}`);
  console.log(
    `Snapshot-Alter: ${result.snapshotAgeMs === null
      ? "nicht bestimmbar"
      : `${Math.max(0, Math.floor(result.snapshotAgeMs / (60 * 60 * 1000)))} Stunden`}`,
  );
  if (result.isSnapshotStale) {
    console.log("WARNUNG: Der Snapshot ist älter als 24 Stunden. Prüfe vor dem Import eine aktuelle Datei.");
  }
  console.log(`Region: ${result.region} · Zeitzone: ${result.timeZone}`);
  console.log(`Karten erkannt: ${result.cardCount}`);
  console.log(`Importierbar: ${result.validCount} · fehlerhaft: ${result.invalidCount}`);
  console.log(
    `Termine ab Snapshot-Zeitpunkt: ${result.upcomingAtSnapshot ?? "nicht bestimmbar"}`,
  );
  console.log(`Datensätze mit Zuordnungswarnungen: ${reviewCount}`);
  console.log("Datenbank: keine Verbindung hergestellt; es wurden keine Daten geschrieben.");

  for (const event of upcoming.slice(0, 5)) {
    console.log(
      `  ${event.start_time} · ${event.title} · ${event.id}`,
    );
  }
  for (const issue of result.issues) {
    const eventReference = issue.id ? `${issue.id} · ` : "";
    console.log(
      `  FEHLER ${eventReference}${issue.title || issue.anchorId}: ${issue.errors.join(" ")}`,
    );
  }
  return result;
} // Keep the shared parser free of command-line side effects.
