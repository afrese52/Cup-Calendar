---
name: Supabase-Migrationen für Live-Tests
description: Hinweise zu Live-Tests, wenn das bereitgestellte Supabase-Schema lokale Migrationen noch nicht enthält.
---

Ein vorhandenes `user_event_bookmarks`-Objekt bedeutet nicht, dass die lokale CupCal-Migration bereits live ist. Fehlen `is_favorite` oder `sync_user_event_bookmark`, können Integrationstests für RLS und RPC nicht sinnvoll ausgeführt werden. Die Umstellung muss über einen autorisierten SQL-Weg in Supabase erfolgen; die App-Schlüssel reichen dafür nicht aus.

**Why:** Ein Zwei-Konten-Test traf auf eine vorhandene, aber veraltete Tabelle ohne die Spalte `is_favorite` und ohne Synchronisierungs-RPC.

**How to apply:** Vor dem Live-Test Schema und Funktion durch den Test prüfen lassen. Bei fehlendem Schema die Migrationen `0002` und `0003` über den autorisierten Supabase-SQL-Weg anwenden lassen, dann den Test erneut ausführen. Keine Live-Schemamigration mit dem App-Service-Schlüssel improvisieren.
