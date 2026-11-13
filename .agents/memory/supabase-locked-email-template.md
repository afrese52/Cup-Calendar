---
name: Gesperrte Supabase-Mailvorlage
description: Einschränkung der Magic-Link-Vorlage im CupCal-Supabase-Projekt.
---

Die Magic-Link-E-Mailvorlage des aktuellen CupCal-Supabase-Projekts ist laut Nutzer nicht änderbar. Der reale Kontolöschlink landete auf einer Google-Seite, während Site URL und Redirect-Allowlist als korrekt bestätigt wurden. Die lokale Dokumentation empfiehlt `{{ .ConfirmationURL }}`, aber die laufende Projektkonfiguration kann davon abweichen.

**Why:** Supabase muss die angeforderte App-Weiterleitung über die E-Mailvorlage übernehmen; eine nicht editierbare Vorlage kann den Redirect-Pfad blockieren oder auf ein anderes Ziel lenken.

**How to apply:** Bei Änderungen an E-Mail-Auth nicht voraussetzen, dass die Vorlage im Dashboard editierbar ist. Zuerst die tatsächliche Einschränkung und unterstützte Alternative klären; echte Tests nur mit entbehrlichen Konten ausführen.
