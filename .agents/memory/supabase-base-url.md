---
name: Supabase-Projekt-URL
description: Projektbasis-URL statt API-Endpunkt für CupCal-Supabase-Clients.
---

Supabase-Clients müssen die Projektbasis als URL verwenden. Bekannte API-Endpfade wie `/auth/v1`, `/rest/v1`, `/storage/v1` oder `/functions/v1` am URL-Ende führen zu fehlerhaft zusammengesetzten Auth-Pfaden und einem 404. CupCal entfernt diese Endpfade vor dem Initialisieren des mobilen Clients.

**Why:** Die Registrierung schlug mit `Invalid path specified in request URL` fehl. Nach der Normalisierung bestätigte der Nutzer, dass das Konto erfolgreich erstellt wurde.

**How to apply:** Bei Supabase-Auth-404 zuerst prüfen, ob die konfigurierte Projekt-URL bereits einen API-Pfad enthält; weiterhin nur die Projektbasis verwenden.
