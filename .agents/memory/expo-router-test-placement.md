---
name: Expo-Router-Testdateien
description: Verhindert, dass Jest- und React-Native-Testing-Library-Code in Expo-Routen geladen wird.
---

Dateien unter `app/` gehören dem Expo Router. Bildschirmtests müssen außerhalb dieses Ordners liegen, auch wenn ihr Dateiname auf `.test.tsx` endet. Andernfalls kann der Router die Testdatei als Route laden und Metro versucht, Jest- oder Testing-Library-Code in den App-Build aufzunehmen.

**Why:** Ein in `app/(tabs)` abgelegter Einstellungsbildschirmtest führte beim nativen Start zu einem Metro-500-Fehler aus `@testing-library/react-native`.

**How to apply:** Tests in einem Ordner wie `tests/` ablegen und Komponenten über einen relativen Pfad aus dem App-Ordner importieren.
