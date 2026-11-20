---
name: Screenreader-Ansagen im Passwortspeicher
description: Plattformgerechte VoiceOver- und TalkBack-Ansagen im Passwortspeicher.
---

Für Zustandsmeldungen beim Passwortspeichern iOS-Ansagen über `AccessibilityInfo.announceForAccessibility` und Android-Ansagen über `accessibilityLiveRegion` auslösen. Für Fehler nicht zusätzlich eine manuelle Ansage und eine aktive iOS-Alert-Rolle oder Android-Live-Region kombinieren.

Bei Countdowns die wechselnde Restzeit im Button-Namen belassen, aber nicht sekündlich als Live-Region melden. Das Ende einmalig auf iOS direkt ansagen und auf Android über eine höfliche Live-Region melden; den Fokus dabei nicht verschieben.

**Why:** Eine Meldung, die gleichzeitig über native Statussemantik und manuelle Ansage ausgelöst wird, kann mehrfach und störend vorgelesen werden.

**How to apply:** Bei Änderungen an Speichern, Countdowns, Fehlern oder Erfolg die Ansage je Plattform auf genau einen aktiven Ausgabepfad begrenzen und beide Plattformen getrennt testen.
