---
name: Supabase-Migrationsabgleich
description: Umgang mit einem teilweise eingerichteten CupCal-Supabase-Schema ohne Migrationserfassung.
---

Das verbundene CupCal-Supabase-Projekt kann bereits Kalender-, Favoriten- und Profiltabellen enthalten, obwohl `supabase_migrations.schema_migrations` fehlt. In diesem Zustand stuft die Supabase-CLI alle lokalen Migrationen als ausstehend ein; ein vollständiges `db push` kann bestehende Tabellen und Sicherheitsregeln erneut bearbeiten.

**Why:** Beim ICS-Import war das Remote-Schema teilweise vorhanden, aber Importtabelle, Metadatenfelder und RPC fehlten. Ein Dry-Run zeigte alle Migrationen als ausstehend, nicht nur die tatsächlich fehlenden.

**How to apply:** Vor Remote-Migrationen die Migrationserfassung und relevanten Tabellen, Spalten, Funktionen, Policies und Realtime-Einträge lesend prüfen. Nur nachweislich erfüllte Migrationen mit `migration repair` als angewendet erfassen, anschließend den Dry-Run prüfen und nur die ausstehenden Migrationen anwenden. Keine Datenbank-DDL mit dem App-Service-Schlüssel improvisieren.
