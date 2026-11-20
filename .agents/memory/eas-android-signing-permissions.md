---
name: EAS-Android-Signaturrechte
description: Prüft, ob der verbundene Expo-Zugriff Android-Keystores erstellen oder verwalten darf.
---

Ein EAS-Zugriff mit `VIEW`- und `RUN`-Rechten kann einen Build starten, aber keinen fehlenden Android-Keystore anlegen. Vor dem Build muss daher entweder der Keystore in Expo remote eingerichtet sein oder der verbundene Zugriff die Berechtigung erhalten, Android-Signaturdaten zu erstellen.

**Why:** Ein CupCal-Build kam bis zur EAS-Signaturphase, scheiterte dort aber beim Erstellen von `AndroidKeystoreEntity`, weil dem verbundenen Expo-Zugriff `CREATE` fehlte.

**How to apply:** Vor einem erstmaligen Android-Build prüfen, ob Remote-Signaturdaten vorhanden sind und der EAS-Zugriff sie verwenden darf. Bei einer verweigerten Keystore-Erstellung zuerst Expo-Berechtigungen oder Credentials korrigieren, nicht wiederholt denselben Build starten. Keystores in Expo verwalten und nie ins Repository einchecken.
