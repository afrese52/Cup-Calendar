# Prüfung von Favoriten-Speicherfehlern

## Automatisierte Prüfergebnisse

- Vier App-Kontext-Tests simulieren abgewiesene `AsyncStorage.getItem`- und
  `AsyncStorage.setItem`-Aufrufe für iOS und Android; alle vier bestehen.
- Ein Lesefehler zeigt „Favoriten konnten nicht geladen werden.“ an und lässt
  die Favoritenliste leer, bis Daten erfolgreich geladen wurden.
- Ein Schreibfehler zeigt „Favorit konnte nicht gespeichert werden. Bitte
  versuche es erneut.“ an; die sichtbare Favoritenliste bleibt unverändert.
- Zwei Bildschirmtests bestätigen, dass Speicherfehlermeldungen sowohl im
  Kalender als auch in der Merkliste sichtbar sind; beide bestehen.
- Die 13 bestehenden Favoritenspeichertests bestehen. Der mobile TypeScript-
  Typcheck besteht ebenfalls.
- Diese Tests bilden die Promise-Schnittstelle des nativen AsyncStorage nach.
  Sie sind keine Ausführung auf iOS- oder Android-Hardware.

## Nicht verfügbare Gerätechecks

Zum Prüfzeitpunkt war kein lokales Gerät registriert und es gab keine aktiven
Expo-iOS- oder Android-Simulator-Sitzungen. Deshalb konnten die Fehler nicht auf
echter Gerätehardware ausgelöst oder visuell bestätigt werden. Die Tests decken
die Fehlerbehandlung und Darstellung automatisiert ab; ein Gerätetest bleibt
offen.
