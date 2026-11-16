---
name: Screenreader-Ansagen im Passwortspeicher
description: Plattformgerechte VoiceOver- und TalkBack-Ansagen im Passwortspeicher.
---

Für Zustandsmeldungen beim Passwortspeichern iOS-Ansagen über `AccessibilityInfo.announceForAccessibility` und Android-Ansagen über `accessibilityLiveRegion` auslösen. Für Fehler nicht zusätzlich eine manuelle Ansage und eine aktive iOS-Alert-Rolle oder Android-Live-Region kombinieren.

**Why:** Eine Meldung, die gleichzeitig über native Statussemantik und manuelle Ansage ausgelöst wird, kann mehrfach und störend vorgelesen werden.

**How to apply:** Bei Änderungen an Speichern, Fehlern oder Erfolg die Ansage je Plattform auf genau einen aktiven Ausgabepfad begrenzen und beide Plattformen getrennt testen.
