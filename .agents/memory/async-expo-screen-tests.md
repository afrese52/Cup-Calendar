---
name: Asynchrone Expo-Bildschirmtests
description: Asynchrone Testabläufe mit React Native Testing Library 14 für CupCal-Bildschirme.
---

Mit React Native Testing Library 14 müssen `render` und Aktionen wie `fireEvent.press` oder `fireEvent.changeText` abgewartet werden, bevor Abfragen oder weitere Interaktionen beginnen.

**Why:** Ohne `await` liefen Zustandsänderungen parallel weiter; Tests sahen alte Formularwerte, ungebundene React-Updates und zeitweise noch die vorherige gerenderte Ansicht.

**How to apply:** In neuen Expo-Bildschirmtests alle asynchronen Render- und Interaktionsaufrufe abwarten und erst danach sichtbare Meldungen, Eingabewerte oder Schaltflächenzustände prüfen.
