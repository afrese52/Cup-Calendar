import { createHash } from "node:crypto";
import {
  mapCategory,
  mapGameMode,
  mapGameRuleset,
  mapTeamFormat,
  mapTournamentSeries,
  mapTournamentType,
  wallTimeToEpoch,
} from "./dry-run-mht-import.mjs";

const DEFAULT_TIME_ZONE = "Europe/Berlin";
const REGION_CODES = new Set(["EU", "NAE", "NAW", "BR", "ASIA", "OCE", "ME", "GLOBAL"]);

function unfoldLines(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function splitContentLine(line) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    if (line[index] === ":" && !quoted) {
      return [line.slice(0, index), line.slice(index + 1)];
    }
  }
  return null;
}

function parseProperty(line) {
  const parts = splitContentLine(line);
  if (!parts) return null;
  const [rawName, value] = parts;
  const [name, ...rawParameters] = rawName.split(";");
  const parameters = new Map();
  for (const parameter of rawParameters) {
    const separator = parameter.indexOf("=");
    if (separator < 1) continue;
    parameters.set(
      parameter.slice(0, separator).toUpperCase(),
      parameter.slice(separator + 1).replace(/^"|"$/g, ""),
    );
  }
  return { name: name.toUpperCase(), parameters, value };
}

function decodeText(value) {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseCalendar(text) {
  if (!/^\uFEFF?BEGIN:VCALENDAR(?:\r?\n|$)/im.test(text.trimStart())) {
    throw new Error("Die Datei ist keine gültige ICS-Kalenderdatei.");
  }

  const events = [];
  const issues = [];
  let calendarName = "";
  let currentEvent = null;
  let componentDepth = 0;

  for (const line of unfoldLines(text.replace(/^\uFEFF/, ""))) {
    const property = parseProperty(line);
    if (!property) continue;
    if (property.name === "BEGIN") {
      componentDepth += 1;
      if (property.value.toUpperCase() === "VEVENT" && componentDepth === 2) {
        currentEvent = new Map();
      }
      continue;
    }
    if (property.name === "END") {
      if (property.value.toUpperCase() === "VEVENT" && componentDepth === 2 && currentEvent) {
        events.push(currentEvent);
        currentEvent = null;
      }
      componentDepth = Math.max(0, componentDepth - 1);
      continue;
    }
    if (currentEvent && componentDepth === 2) {
      const values = currentEvent.get(property.name) ?? [];
      values.push(property);
      currentEvent.set(property.name, values);
    } else if (componentDepth === 1 && property.name === "X-WR-CALNAME") {
      calendarName = decodeText(property.value);
    }
  }

  if (currentEvent) throw new Error("Ein Termin in der ICS-Datei ist nicht abgeschlossen.");
  if (events.length === 0) throw new Error("Die ICS-Datei enthält keine Termine.");
  return { events, issues, calendarName };
}

function firstProperty(event, name) {
  return event.get(name)?.[0] ?? null;
}

function dateParts(value) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/i);
  if (!match) throw new Error("Das Datum oder die Uhrzeit hat ein nicht unterstütztes Format.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, utcFlag] = match;
  const result = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText ?? "0"),
    minute: Number(minuteText ?? "0"),
    second: Number(secondText ?? "0"),
    hasTime: Boolean(hourText),
    isUtc: Boolean(utcFlag),
  };
  const check = new Date(Date.UTC(result.year, result.month - 1, result.day));
  if (
    check.getUTCFullYear() !== result.year
    || check.getUTCMonth() !== result.month - 1
    || check.getUTCDate() !== result.day
    || result.hour > 23
    || result.minute > 59
    || result.second > 59
  ) {
    throw new Error("Das Datum oder die Uhrzeit ist ungültig.");
  }
  return result;
}

function toInstant(property, timeZone) {
  if (!property) throw new Error("Start- oder Endzeit fehlt.");
  const parts = dateParts(property.value);
  if (parts.isUtc) return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )).toISOString();

  const zone = property.parameters.get("TZID") ?? timeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    throw new Error(`Die Zeitzone „${zone}“ wird nicht erkannt.`);
  }
  const timestamp = wallTimeToEpoch(
    { year: parts.year, month: parts.month, day: parts.day },
    parts.hour,
    parts.minute,
    zone,
  ) + parts.second * 1000;
  return new Date(timestamp).toISOString();
}

function eventId(uid, title, startTime, endTime, region) {
  const key = uid || `${region}\n${title}\n${startTime}\n${endTime}`;
  return `ics:${createHash("sha256").update(key).digest("hex")}`;
}

function parseEvent(event, index, region, calendarName, timeZone) {
  const summary = firstProperty(event, "SUMMARY");
  const description = firstProperty(event, "DESCRIPTION");
  const location = firstProperty(event, "LOCATION");
  const title = decodeText(summary?.value ?? "");
  const desc = decodeText(description?.value ?? "");
  const details = `${title} ${desc} ${decodeText(location?.value ?? "")} ${calendarName}`;
  const errors = [];
  if (!title) errors.push("Der Terminname fehlt.");
  if (firstProperty(event, "RRULE")) {
    errors.push("Wiederkehrende ICS-Termine werden derzeit nicht unterstützt.");
  }

  let startTime = null;
  let endTime = null;
  try {
    const startProperty = firstProperty(event, "DTSTART");
    const endProperty = firstProperty(event, "DTEND");
    if (!startProperty || !endProperty) throw new Error("Start- oder Endzeit fehlt.");
    startTime = toInstant(startProperty, timeZone);
    endTime = toInstant(endProperty, timeZone);
    if (Date.parse(endTime) <= Date.parse(startTime)) {
      throw new Error("Die Endzeit liegt nicht nach der Startzeit.");
    }
    if (startProperty.parameters.get("VALUE")?.toUpperCase() === "DATE") {
      const start = dateParts(startProperty.value);
      const end = dateParts(endProperty.value);
      const daySpan = (Date.UTC(end.year, end.month - 1, end.day)
        - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000;
      if (daySpan > 1) errors.push("Mehrtagestermine können nicht als einzelner Turniertermin importiert werden.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Datum und Uhrzeit konnten nicht gelesen werden.");
  }

  const tournamentType = mapTournamentType(details);
  const gameMode = mapGameMode(details);
  const teamFormat = mapTeamFormat(details);
  if (!tournamentType) errors.push("Turnierart fehlt oder ist nicht eindeutig im Namen oder in der Beschreibung angegeben.");
  if (!gameMode) errors.push("Spielmodus fehlt oder ist nicht eindeutig im Namen oder in der Beschreibung angegeben.");
  if (!teamFormat) errors.push("Spielformat fehlt oder ist nicht eindeutig im Namen oder in der Beschreibung angegeben.");

  if (errors.length) {
    return {
      issue: {
        id: firstProperty(event, "UID")?.value
          ? eventId(firstProperty(event, "UID").value, title, startTime ?? "", endTime ?? "", region)
          : `ics-row-${index + 1}`,
        title: title || null,
        errors,
      },
    };
  }

  const uid = firstProperty(event, "UID")?.value?.trim() ?? "";
  return {
    event: {
      id: eventId(uid, title, startTime, endTime, region),
      title,
      description: desc,
      poster_url: null,
      region,
      game_mode: gameMode,
      game_ruleset: mapGameRuleset(details, gameMode),
      tournament_series: mapTournamentSeries(details),
      team_format: teamFormat,
      tournament_type: tournamentType,
      category: mapCategory(details, tournamentType),
      start_time: startTime,
      end_time: endTime,
      is_featured: false,
      review_warnings: [],
    },
  };
}

export function parseIcsSchedule(text, options = {}) {
  const region = String(options.region ?? "").toUpperCase();
  if (!REGION_CODES.has(region)) {
    throw new Error("Bitte wähle eine gültige Turnierregion für den ICS-Import.");
  }
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const calendar = parseCalendar(text);
  const now = new Date().toISOString();
  const seenIds = new Set();
  const parsedEvents = calendar.events.map((event, index) =>
    parseEvent(event, index, region, calendar.calendarName, timeZone),
  );
  const events = [];
  const issues = [];
  for (const item of parsedEvents) {
    if (item.issue) {
      issues.push(item.issue);
    } else if (item.event) {
      if (seenIds.has(item.event.id)) {
        issues.push({
          id: item.event.id,
          title: item.event.title,
          errors: ["Die Datei enthält dieselbe UID mehrmals."],
        });
      } else {
        seenIds.add(item.event.id);
        events.push(item.event);
      }
    }
  }
  return {
    sourceUrl: null,
    snapshotAt: now,
    snapshotAgeMs: 0,
    isSnapshotStale: false,
    region,
    timeZone,
    cardCount: calendar.events.length,
    validCount: events.length,
    invalidCount: issues.length,
    upcomingAtSnapshot: events.filter((event) => Date.parse(event.start_time) >= Date.parse(now)).length,
    events,
    issues,
  };
}
