---
name: EAS Android Java-Version
description: Android-Remote-Builds können an einer zu alten Java-Laufzeit scheitern.
---

**Beobachtung:** Ein EAS-Android-Build mit Gradle 9.4.1 schlug fehl, weil der Build-Prozess JVM 11 verwendete; Gradle verlangte mindestens JVM 17.

**Why:** Die Laufzeit der Remote-Build-Umgebung ist nicht allein aus der lokalen Expo-Konfiguration ersichtlich.

**How to apply:** Bei diesem Fehler die Java-Version des Android-Build-Images prüfen und vor einem weiteren Build auf Java 17 oder neuer ausrichten.
