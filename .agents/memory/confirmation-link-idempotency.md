---
name: Bestätigungslink-Idempotenz
description: Deduplizierung mehrfach zugestellter Bestätigungslinks innerhalb eines offenen Bildschirms.
---

Ein Bestätigungsbildschirm muss alle bereits verarbeiteten Linkkennungen während seiner gesamten offenen Lebensdauer speichern und wiederholte Zustellungen ignorieren. Nur den zuletzt verarbeiteten Link zu merken reicht nicht: Ein anderer Callback kann dazwischenliegen.

**Why:** Betriebssysteme können App-Links erneut zustellen, und die Wiederholung darf weder den einmaligen Codeaustausch noch eine bereits gezeigte Bestätigung erneut auslösen.

**How to apply:** Bei Auth-Callback-Handlern Identitäten aus den normalisierten Callback-Feldern bilden und schon vor asynchroner Verarbeitung als gesehen markieren. Unterschiedliche Callback-Identitäten müssen weiter verarbeitet werden können.
