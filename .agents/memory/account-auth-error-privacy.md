---
name: Datenschutz bei Kontoauth-Fehlern
description: Abgrenzung zwischen nutzerfreundlichen Anmeldehinweisen und Fehlerdiagnosen anderer Auth-Abläufe.
---

Unbekannte Fehler beim Anmelden und Registrieren dürfen weder rohe Servertexte noch Fehlercodes oder HTTP-Status im Konto-UI anzeigen. Diese Abläufe verwenden stattdessen einen klaren, modusspezifischen Hinweis und behalten die eingegebenen Daten.

**Why:** Die allgemeine Fehlerübersetzung wird auch für andere Abläufe wie Kontolöschung und Passwortlinks verwendet. Unbekannte Details dort pauschal zu unterdrücken kann bestehende Diagnose- und Nutzerhinweise verändern.

**How to apply:** Bei Änderungen an `friendlyAuthError` den Datenschutzmodus nur für die betroffenen Auth-Abläufe aktivieren; die Rücksetz- und Kontolöschpfade separat prüfen.
