---
name: Gesperrte Supabase-Mailvorlage
description: Einschränkung der Magic-Link-Vorlage im CupCal-Supabase-Projekt.
---

Die Magic-Link-E-Mailvorlage des aktuellen CupCal-Supabase-Projekts ist laut Nutzer nicht änderbar. Der reale Kontolöschlink landete auf einer Google-Seite, während Site URL und Redirect-Allowlist als korrekt bestätigt wurden. Die lokale Dokumentation empfiehlt `{{ .ConfirmationURL }}`, aber die laufende Projektkonfiguration kann davon abweichen.

**Why:** Supabase muss die angeforderte App-Weiterleitung über die E-Mailvorlage übernehmen; eine nicht editierbare Vorlage kann den Redirect-Pfad blockieren oder auf ein anderes Ziel lenken.

**How to apply:** Bei Änderungen an E-Mail-Auth nicht voraussetzen, dass die Vorlage im Dashboard editierbar ist. Zuerst die tatsächliche Einschränkung und unterstützte Alternative klären; echte Tests nur mit entbehrlichen Konten ausführen.

Ein Supabase **Send Email Hook** ist die unterstützte Alternative zur gesperrten Vorlage: Er ersetzt den eingebauten Auth-Mailversand und erhält Token-Hash und angeforderten Rücksprung. Ein eigener SMTP-Server allein ersetzt die Vorlage nicht. Die konkrete Sperrursache ist weiterhin unbestätigt; laut Supabase dürfen Developer-/Read-Only-Rollen keine Projekteinstellungen ändern.

**Why:** Ohne berechtigte Konfigurationsfreigabe und tatsächlichen Mailanbieter kann App-Code den Versandweg nicht aktivieren. Ein Google-Linkwrapper allein belegt außerdem kein falsches endgültiges Rücksprungziel.

**How to apply:** Owner-/Administrator-Zugriff für die Prüfung und gegebenenfalls Hook-Einrichtung verlangen, keine Auth-Einstellungen ungefragt ändern. Keinen allgemeinen Login anhand eines lokal gespeicherten Löschwunschs als Löschbestätigung behandeln. Echten Browser-/Android-Nachweis ausdrücklich offen lassen, bis er mit entbehrlichen Konten und installiertem Build erfolgt.
