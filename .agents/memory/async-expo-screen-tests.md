---
name: Asynchrone Expo-Bildschirmtests
description: Asynchrone Testabläufe mit React Native Testing Library 14 für CupCal-Bildschirme.
---

Mit React Native Testing Library 14 müssen `render` und Aktionen wie `fireEvent.press` oder `fireEvent.changeText` abgewartet werden, bevor Abfragen oder weitere Interaktionen beginnen.

**Why:** Ohne `await` liefen Zustandsänderungen parallel weiter; Tests sahen alte Formularwerte, ungebundene React-Updates und zeitweise noch die vorherige gerenderte Ansicht.

**How to apply:** In neuen Expo-Bildschirmtests alle asynchronen Render- und Interaktionsaufrufe abwarten und erst danach sichtbare Meldungen, Eingabewerte oder Schaltflächenzustände prüfen.

Für einen schnellen Mehrfachklick, der vor dem nächsten React-Render abgefangen
werden muss, `fireEvent.press` nicht parallel aufrufen: Das erzeugt überlappende
`act()`-Aufrufe. Der gerenderte React-Native-`Pressable` stellt stattdessen den
Pressability-Handler unter `onClick` bereit. Mehrere synchrone Aufrufe dieses
Handlers mit `currentTarget === target` innerhalb eines einzelnen `act()` prüfen
die synchrone Sperre, bevor `disabled` neu gerendert wird.

**Why:** Der Button wird nach dem Start zwar sofort deaktiviert, aber die
zusätzliche Ref-Sperre muss auch mehrere Ereignisse abweisen, die vor diesem
Render bereits eingereiht wurden.
