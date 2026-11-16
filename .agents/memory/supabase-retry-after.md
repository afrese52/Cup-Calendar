---
name: Supabase-Retry-After
description: Supabase Auth-Fehler verlieren HTTP-Antwortheader, bevor die App sie verarbeitet.
---

Wenn CupCal eine Supabase-Auth-Drosselung mit `Retry-After` auswerten muss, muss die benutzerdefinierte Fetch-Schicht die verlässliche Wartezeit erhalten, bevor sie als `AuthApiError` verloren geht. Ein Fehlerobjekt des Supabase-SDKs enthält normalerweise nur Nachricht, Code und HTTP-Status.

**Why:** Die Auth-SDK-Verarbeitung erstellt einen neuen Fehler aus dem Antworttext und dem Status, übernimmt aber keine Antwortheader. Nur im nachgelagerten Fehlermapper nach `Retry-After` zu suchen reicht daher für echte HTTP-Antworten nicht.

**How to apply:** Bei Änderungen an Supabase-Rate-Limit-Hinweisen sowohl den Response-Header-Eingriff in `createSupabaseClient` als auch die sichere Auswertung im Auth-Fehlerdienst prüfen. Ohne gültige Wartezeit weiterhin den allgemeinen Hinweis verwenden.
