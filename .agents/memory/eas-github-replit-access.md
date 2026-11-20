---
name: EAS- und Replit-GitHub-Zugriff
description: Unterscheidet GitHub-Zugriff für EAS-Builds von Replits Zugriff auf Projektquellcode.
---

Die GitHub-Verknüpfung in einem Expo/EAS-Projekt und die GitHub-Verbindung in Replit sind unabhängig voneinander. Ein Repository, das im Expo-Dashboard als verbunden erscheint, kann für EAS-Builds verfügbar sein, ohne dass der Replit-Arbeitsbereich einen GitHub-Remote oder der Agent Zugriff auf das private Repository hat.

**Why:** Ein CupCal-Repository war im Expo-Builddialog verbunden, während die GitHub-Verbindung in Replit weiterhin nicht aktiv war und das Arbeitsverzeichnis keinen GitHub-Remote hatte.

**How to apply:** Vor einem Build aus GitHub EAS-Zugriff und Replit-Konto-/Remote-Zugriff getrennt prüfen. Nie aus der Expo-Verknüpfung allein ableiten, dass Replit lesen oder schreiben kann.
