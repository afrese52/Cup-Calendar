# CupCal: Kalender für FN

Inoffizielle Android-first Begleit-App für Fortnite-Wettbewerbe mit Kalender, Filtern, Turnierdetails und kontogebundener Merkliste.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/cupcal-mobile run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cupcal-mobile/app/` — Kalender, Merkliste, Einstellungen und Turnierdetails
- `artifacts/cupcal-mobile/data/events.ts` — deutlich gekennzeichnete Beispieldaten; Live-Daten sind noch nicht verbunden
- `artifacts/cupcal-mobile/state/AppContext.tsx` — gemeinsamer App-Zustand und lokale Favoriten
- `artifacts/cupcal-mobile/constants/colors.ts` — CupCal-Farbthema
- `lib/api-spec/openapi.yaml` — Quelle der API-Verträge

## Architecture decisions

- Neue Android-Paket-ID für einen separaten Google-Play-Eintrag: `de.cup.calendar`. Der bisherige Testeintrag `de.cup.calender` ist eine eigenständige App und erhält keine Updates aus diesem Paket.
- Termine dürfen nur mit aktivem Benutzerkonto gespeichert oder aus der Merkliste entfernt werden; Änderungen werden lokal zwischengespeichert und mit Supabase synchronisiert.
- Merkliste und Speichern-Schaltflächen gehören zum Kalender und zur Agenda, nicht zu Fortnite-Inhalten oder zum Infobereich. Nicht angemeldete Benutzer erhalten beim Tippen eine Anmeldeaufforderung.
- Beispieltermine dürfen nicht als echte oder live synchronisierte Turnierdaten dargestellt werden.

## Product

- Monatskalender mit Monatsnavigation, markiertem Tag, Kategorie-Filtern und passender Tagesagenda.
- Agenda-Liste mit kontogebundenen gespeicherten Turnieren und Turnierdetails.
- Speichern und Entfernen ist nur nach Anmeldung möglich; Gast-Benutzer werden beim Tippen zum Anmelden aufgefordert.
- Der Einstellungsbereich enthält den Hinweis zum inoffiziellen Fanprojekt.
- Supabase-Konten und Favoriten-Synchronisierung sind verbunden; Push-Nachrichten und Pro-Käufe sind noch nicht verbunden.

## User preferences

- Jegliche Kommunikation, Aufgaben und Beschreibungen im Projekt erfolgen auf Deutsch.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
