---
name: Supabase-PKCE auf nativen Geräten
description: PKCE-Verifier und Flow-Zuordnung in Supabase-Deep-Link-Callbacks.
---

Bei Supabase Auth JS enthält die PKCE-Flow-ID bei aktivierter Option `appendPkceFlowIdToRedirects` den Query-Parameter `sb_flow_id`; ältere Integrationen können `flow_id` verwenden. Native Deep-Link-Callbacks müssen den tatsächlich empfangenen Wert an `exchangeCodeForSession(code, { flowId })` weiterreichen.

**Why:** Neuere Supabase-Auth-SDKs speichern mehrere parallele PKCE-Verifier in separaten Slots. Ohne Flow-ID-Korrelation kann ein Code mit dem falschen Verifier ausgetauscht werden. Die SDK-Option hängt `sb_flow_id` an Redirects an, ist standardmäßig aber deaktiviert und der zusätzliche Query-Parameter muss von der Redirect-Allowlist zugelassen werden.

**How to apply:** Bei E-Mail-Bestätigung, Passwortwiederherstellung oder anderen PKCE-Deep-Links den empfangenen `sb_flow_id`- oder älteren `flow_id`-Wert zusammen mit dem Code an den SDK-Austausch geben. Die Flow-ID-Option nur aktivieren, wenn die Redirect-Allowlist den zusätzlichen Parameter erlaubt. Den gemeinsamen Client auf `flowType: 'pkce'` setzen und Sitzungen auf nativen Geräten in AsyncStorage halten.
