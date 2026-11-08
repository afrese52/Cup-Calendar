# CupCal: Kalender für FN

Inoffizielle Android-first Begleit-App für Fortnite-Wettbewerbe mit Kalender, Filtern, Turnierdetails und lokal gespeicherten Favoriten.

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

- Android-first Paket-ID gemäß Feinkonzept: `com.cupcal.android`; nach dem ersten nativen Build nicht mehr ändern.
- Favoriten werden zunächst lokal mit AsyncStorage gespeichert; es gibt noch keine Konto- oder Cloud-Synchronisierung.
- Beispieltermine dürfen nicht als echte oder live synchronisierte Turnierdaten dargestellt werden.

## Product

- Monatskalender mit Monatsnavigation, markiertem Tag, Kategorie-Filtern und passender Tagesagenda.
- Agenda-Liste mit gespeicherten Favoriten und Turnierdetails.
- Veranstaltungen lokal in der Merkliste speichern oder entfernen.
- Der Einstellungsbereich enthält den Hinweis zum inoffiziellen Fanprojekt.
- Supabase, Live-Datenimport, Push-Nachrichten, Konten und Pro-Käufe sind noch nicht verbunden.

## User preferences

- Nutzerseitige Texte und Antworten sollen auf Deutsch sein.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
