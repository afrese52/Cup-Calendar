---
name: Vite-Assets in Layouttests
description: Browserbasierte Tests für vorgebaute Websites müssen den Asset-Pfad des Vite-Builds korrekt ausliefern.
---

Rendert ein Browsercheck den vorab gerenderten HTML-Inhalt über einen lokalen statischen Server, muss dieser Server auch den Asset-Präfix bedienen, den die gebaute `index.html` für CSS und JavaScript verwendet. Den Präfix aus einem vorhandenen `src`- oder `href`-Assetpfad ableiten, statt `/assets` anzunehmen.

**Why:** Die HTML-Seite kann ohne die fehlenden Styles und Skripte weiterhin sichtbar sein und dadurch irreführend bestandene Layouttests liefern.

**How to apply:** Vor einem visuellen oder responsiven Browsercheck prüfen, ob das Produktions-CSS und die App-Skripte erfolgreich aus dem Testserver geladen werden.
