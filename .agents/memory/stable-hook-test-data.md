---
name: Stabile Daten in Hook-Tests
description: Verhindert Render-Schleifen durch instabile Mock-Antworten.
---

Wenn ein Test einen Daten-Hook mockt, dessen Antwort in einer `useEffect`-Abhängigkeit landet, sollten Antwort- und Datenobjekte über Renderings hinweg dieselbe Referenz behalten. Ein frisches Objekt pro Render kann den Effekt wiederholt auslösen, besonders wenn dieser Zustand aktualisiert.

**Why:** Ein wechselndes Mock-Antwortobjekt führte beim Testen der Favoritensynchronisierung zu einer endlosen Render-Schleife.

**How to apply:** Testantworten einmal in der Mock-Fabrik erstellen und nur dann austauschen, wenn der Test ausdrücklich eine neue Serverantwort simuliert.
