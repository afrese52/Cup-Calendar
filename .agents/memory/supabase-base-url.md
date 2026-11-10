---
name: Supabase-Projekt-URL
description: Projektbasis-URL statt API-Endpunkt für CupCal-Supabase-Clients.
---

Supabase-Clients müssen die Projektbasis als URL verwenden. Bekannte API-Endpfade wie `/auth/v1`, `/rest/v1`, `/storage/v1` oder `/functions/v1` am URL-Ende führen zu fehlerhaft zusammengesetzten Auth-Pfaden und können als 401 oder 404 erscheinen. CupCal entfernt diese Endpfade vor dem Initialisieren sowohl mobiler als auch serverseitiger Clients.

**Why:** Die Registrierung schlug mit `Invalid path specified in request URL` fehl; später verweigerte der Admin-Import die Sitzungsprüfung. In beiden Fällen kann eine Supabase-URL mit angehängtem API-Pfad die Auth-Endpunkte fehlerhaft zusammensetzen.

**How to apply:** Bei Auth-Fehlern in mobilen oder serverseitigen Supabase-Clients zuerst prüfen, ob die konfigurierte Projekt-URL bereits einen API-Pfad enthält; nur die Projektbasis an `createClient` übergeben.
