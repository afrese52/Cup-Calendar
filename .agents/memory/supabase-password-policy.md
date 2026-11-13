---
name: Supabase-Passwortregel
description: Vom Nutzer bestätigte Passwortanforderung für CupCal-Auth.
---

Die aktive Supabase-Regel lautet mindestens sechs Zeichen; weitere Zeichenanforderungen sind nicht aktiviert.

**Why:** Der öffentliche Auth-Einstellungs-Endpunkt zeigt zusätzliche Zeichenregeln nicht an. Die tatsächliche Einstellung wurde im Supabase-Dashboard bestätigt.

**How to apply:** Passwortfelder, lokale Prüfungen und Tests für CupCal an dieser Regel ausrichten. Keine Ziffern-, Großbuchstaben- oder Sonderzeichenpflicht ergänzen, solange die Dashboard-Einstellung sich nicht ändert.
