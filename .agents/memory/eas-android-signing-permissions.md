---
name: EAS-Android-Signaturrechte
description: Prüft, ob der verbundene Expo-Zugriff Android-Keystores erstellen oder verwalten darf.
---

Ein EAS-Zugriff mit `VIEW`- und `RUN`-Rechten kann einen Build starten, aber keinen fehlenden Android-Keystore anlegen. Vor dem Build muss daher entweder der Keystore in Expo remote eingerichtet sein oder der verbundene Zugriff die Berechtigung erhalten, Android-Signaturdaten zu erstellen. Bei mehreren verbundenen Expo-Integrationen kann eine Verbindung den vorhandenen Android-Keystore möglicherweise nicht lesen, während eine andere ihn für denselben Build verwenden kann.

**Why:** Ein früherer CupCal-Build scheiterte beim Erstellen von `AndroidKeystoreEntity`, weil dem verbundenen Zugriff `CREATE` fehlte. Ein späterer Build scheiterte beim Lesen vorhandener `AndroidAppCredentialsEntity`-Daten über eine Expo-Verbindung; die zweite verbundene Expo-Integration konnte denselben Remote-Keystore verwenden.

**How to apply:** Vor einem erstmaligen Android-Build prüfen, ob Remote-Signaturdaten vorhanden sind und der EAS-Zugriff sie verwenden darf. Bei einem verweigerten Credential-Zugriff über eine Expo-Verbindung eine weitere bereits verbundene Expo-Integration prüfen, bevor Berechtigungen oder Credentials geändert werden. Bei verweigerter Keystore-Erstellung zuerst Expo-Berechtigungen oder Credentials korrigieren, nicht wiederholt denselben Build starten. Keystores in Expo verwalten und nie ins Repository einchecken.
