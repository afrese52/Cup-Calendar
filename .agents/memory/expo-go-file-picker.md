---
name: Expo-Go-Dateiauswahl
description: Android-Dateirechte beim Lesen ausgewählter Dateien innerhalb von Expo Go.
---

Bei einem CupCal-Test in Expo Go auf Android scheiterte `FileSystemFile.text()` zunächst mit „Missing READ permission“. Außerdem liefert `File.name` für `content://`-URIs nicht immer den ursprünglichen Dateinamen; Android muss daher den Anzeigenamen aus dem DocumentPicker-Asset verwenden. `copyToCacheDirectory: false` erhält die ursprüngliche URI. In der installierten SDK-Version erkennt der Legacy-Leser als SAF nur URIs des External-Storage-Anbieters; Downloads und andere Dokumentanbieter können damit unlesbar bleiben. Für solche Original-URIs ist die neue File-API zu verwenden und der echte Gerätetest erforderlich.

**Why:** Android-Provider geben Dateien als `content://`-URIs mit nicht lesbarem Pfadnamen aus und unterscheiden sich darin, ob der Legacy-Reader sie unterstützt.

**How to apply:** Den Anzeigenamen aus dem DocumentPicker-Asset übernehmen, Androids Original-URI ohne Cache-Kopie lesen, den neuen File-API-Reader vor dem Legacy-Reader erwägen und Änderungen auf einem echten Gerät prüfen.
