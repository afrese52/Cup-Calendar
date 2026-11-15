---
name: Supabase-CLI-Migrationstests
description: Lokale Migrationstests mit der vollständigen Supabase-CLI-Umgebung.
---

Für den zusätzlichen Supabase-CLI-Migrationstest eine temporäre Projektkonfiguration mit kopierten Migrationen und freien lokalen Ports verwenden. `supabase start` startet PostgreSQL, Auth und Realtime und wendet dabei die Migrationen bereits an. Das Projekt darf nicht mit einem gehosteten Projekt verknüpft werden; keine Remote-Option verwenden.

**Why:** In dieser Replit-Docker-Umgebung schlug `supabase db reset` nach erfolgreichem Anwenden der Migrationen beim Neustart des Kong-Containers mit `OCI runtime exec failed` fehl. Der reine lokale Start lief durch und prüfte dieselben Migrationen.

**How to apply:** Für den Migrationscheck `supabase start` als lokalen Testlauf verwenden, anschließend die Datenbank direkt lokal prüfen und den temporären Stack mit `supabase stop --no-backup` beenden.
