---
name: Expo-Router-Integrationstests
description: Echte Expo-Router-Navigation mit renderRouter im CupCal-Jest-Setup testen.
---

Für eine echte Navigation `renderRouter` und `testRouter` aus
`expo-router/testing-library` in einer separaten Testsuite verwenden, die
`expo-router` nicht mockt. Bestehende Screen-Tests, die `useRouter` und
`useLocalSearchParams` mocken, können den echten Router-Renderer nicht
gleichzeitig nutzen. In-Memory-Routen als Schlüssel ohne Erweiterung übergeben,
zum Beispiel `'(tabs)/settings'`; der Router-Helper normalisiert Dateiendungen
bei der Routensuche.

**Why:** Der Router-Helper lädt echte Navigation und native Expo-Router-Pakete,
während die klassischen Bildschirmtests die Router-Hooks vollständig ersetzen.

**How to apply:** Für Integrationstests eine eigene Datei anlegen, den
In-Memory-Router über einen URL-Pfad navigieren lassen und die nötigen Expo-
Module, Bilddateien und ESM-Abhängigkeiten in der Jest-Konfiguration gezielt
mocken beziehungsweise transformieren.
