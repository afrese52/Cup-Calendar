---
name: Supabase-Passwortregel
description: Vom Nutzer bestätigte Passwortanforderung für CupCal-Auth.
---

Die aktive Supabase-Regel lautet mindestens sechs Zeichen; weitere Zeichenanforderungen sind nicht aktiviert.

**Why:** Der öffentliche Auth-Einstellungs-Endpunkt zeigt zusätzliche Zeichenregeln nicht an. Die tatsächliche Einstellung wurde im Supabase-Dashboard bestätigt.

**How to apply:** Passwortfelder, lokale Prüfungen und Tests für CupCal an dieser Regel ausrichten. Keine Ziffern-, Großbuchstaben- oder Sonderzeichenpflicht ergänzen, solange die Dashboard-Einstellung sich nicht ändert.

Ein Live-Test mit einem kurzlebigen Testkonto zeigte, dass Supabase die Mindestlänge in UTF-8-Bytes bewertet: fünf ASCII-Bytes und fünf UTF-8-Bytes werden abgelehnt; sechs UTF-8-Bytes werden akzeptiert. CupCal zählt lokal weiter Unicode-Codepoints. Dadurch bleibt die lokale Sechs-Zeichen-Prüfung strenger bei Emoji und Akzenten, lässt aber kein Passwort durch, das Supabase wegen weniger als sechs UTF-8-Bytes ablehnen würde.

**Why:** Die Supabase-Grenze ist bei mehrbyteigen Zeichen nicht dieselbe wie die sichtbare oder lokale Unicode-Zeichenanzahl.

**How to apply:** Bei künftigen Änderungen an der Mindestlänge beide Zählweisen erneut mit einem entbehrlichen Supabase-Konto vergleichen. Die lokale Regel nur ändern, wenn sich die gewünschte sichtbare Passwortanforderung ebenfalls ändert.
