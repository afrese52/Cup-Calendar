---
name: Supabase-PKCE auf nativen Geräten
description: PKCE-Verifier und Flow-Zuordnung in Supabase-Deep-Link-Callbacks.
---

Native Deep-Link-Callbacks sollten den `flow_id`-Parameter aus dem Supabase-Redirect an `exchangeCodeForSession(code, { flowId })` weiterreichen. Der SDK-Client kann auf Android und iOS den Callback nicht aus einer Browser-URL auslesen; ohne explizite Flow-ID fällt er auf den Verifier-Speicher für ältere einzelne Flows zurück.

**Why:** Neuere Supabase-Auth-SDKs speichern mehrere parallele PKCE-Verifier in separaten Slots. Ein Codeaustausch ohne die zugehörige Flow-ID kann den falschen Verifier auswählen und einen gültigen Einmalcode verbrauchen.

**How to apply:** Bei E-Mail-Bestätigung, Passwortwiederherstellung oder anderen PKCE-Deep-Links die `flow_id`-Query aus der Callback-URL zusammen mit dem Code an den Auth-SDK-Austausch übergeben. Den gemeinsamen Client auf `flowType: 'pkce'` setzen und die Sitzungen im nativen AsyncStorage halten.
