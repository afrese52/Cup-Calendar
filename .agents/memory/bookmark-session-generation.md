---
name: Favoriten-Sync nach Sitzungswechsel
description: Schutz gegen verspätete Favoritenantworten aus einer vorherigen Auth-Sitzung.
---

Jeder Favoriten-Sync und jede wartende Screenreader-Ansage muss zur konkreten Auth-Sitzung gehören, nicht nur zur Benutzerkennung. Nach einem Wechsel der Sitzung dürfen verspätete Ergebnisse keinen lokalen Abgleich, UI-Zustand oder Screenreader-Hinweis mehr auslösen.

**Why:** Eine Benutzerkennung kann nach Ab- und erneuter Anmeldung gleich sein, obwohl die Antwort zur vorherigen Sitzung gehört; nur der Benutzervergleich reicht dann nicht.

**How to apply:** Bei asynchronen Auth-abhängigen Favoritenabläufen eine Sitzungsrevision erfassen und nach jedem `await` vor weiteren Schreib-, Abgleich- oder Ansageaktionen prüfen.
