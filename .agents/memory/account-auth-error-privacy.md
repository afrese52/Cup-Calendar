---
name: Datenschutz bei Kontoauth-Fehlern
description: Abgrenzung zwischen nutzerfreundlichen Anmeldehinweisen und Fehlerdiagnosen anderer Auth-Abläufe.
---

Unbekannte Fehler beim Anmelden und Registrieren dürfen weder rohe Servertexte noch Fehlercodes oder HTTP-Status im Konto-UI anzeigen. Diese Abläufe verwenden stattdessen einen klaren, modusspezifischen Hinweis und behalten die eingegebenen Daten.

**Why:** Die allgemeine Fehlerübersetzung wird auch für andere Abläufe wie Kontolöschung und Passwortlinks verwendet. Unbekannte Details dort pauschal zu unterdrücken kann bestehende Diagnose- und Nutzerhinweise verändern.

**How to apply:** Bei Änderungen an `friendlyAuthError` den Datenschutzmodus nur für die betroffenen Auth-Abläufe aktivieren; die Rücksetz- und Kontolöschpfade separat prüfen.

Passwortlink-Fehler an die E-Mail-Adresse des fehlgeschlagenen Versands binden
und entfernen, sobald die Person eine andere Adresse eingibt. Allgemeine
Sitzungs- oder Kontoauth-Fehler nicht allein durch eine Adressänderung löschen.

**Why:** Eine Rate-Limit- oder Versandmeldung zu einer vorherigen Adresse ist
nach einer Korrektur irreführend, während Fehler zur Sitzung weiterhin gelten.

**How to apply:** Bei Änderungen am Wiederherstellungsformular den Fehler nur
mit dem zugehörigen Anfragekontext zurücksetzen und einen erneuten Versuch mit
der korrigierten Adresse testen.
