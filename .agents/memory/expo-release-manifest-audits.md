---
name: Expo-Release-Manifest prüfen
description: Warum CupCal-Store-Angaben das zusammengeführte AAB statt nur die Expo-Konfiguration benötigen.
---

Store-Angaben zu Android-Berechtigungen müssen mit dem zusammengeführten
Manifest des vorgesehenen Release-AAB abgeglichen werden, nicht nur mit
der expliziten Berechtigungsliste der Expo-Konfiguration.

**Why:** Bei CupCal enthielt ein bereitgestelltes Release Kamera-, Mikrofon-
und Overlay-Berechtigungen, die die Quellcode-Vorprüfung nicht erfasst hatte.
Native Abhängigkeiten können zusätzliche Rechte einbringen.

**How to apply:** Nach Änderungen an Modulen oder Berechtigungen das fertige
Manifest erneut prüfen. Deklarierte Rechte nicht mit tatsächlicher Nutzung
oder Datenübertragung gleichsetzen; diese separat belegen. Ebenso die
eingebettete Buildkonfiguration prüfen, da lokale Korrekturen bereits
gebaute Dateien nicht verändern.
