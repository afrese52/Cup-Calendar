---
name: Supabase-Realtime-Testabos
description: Bestätigte Anmeldung und zuverlässige Postgres-Changes-Abos in lokalen CLI-Tests.
---

In lokalen Supabase-CLI-Tests bedeutet ein unmittelbarer `SUBSCRIBED`-Status nicht zwingend, dass die Postgres-Changes-Replikation bereits aktiv ist. Für Kanäle mit Datenbankänderungen `config.postgres_changes_options.wait: true` setzen. Bei manuell angemeldeten Testclients außerdem `client.realtime.setAuth(session.access_token)` vor dem Abonnieren abwarten.

**Why:** Der lokale Supabase-Stack kann die Kanalbestätigung senden, bevor die Datenbankänderungs-Abonnementverbindung bereit ist; ein direkt danach ausgeführtes Update wird sonst nicht empfangen.

**How to apply:** End-to-End-Tests für `postgres_changes` im temporären CLI-Stack sollen zuerst die Sitzung am Realtime-Client setzen, dann mit `wait: true` abonnieren und erst nach `SUBSCRIBED` die zu prüfende Änderung auslösen.
