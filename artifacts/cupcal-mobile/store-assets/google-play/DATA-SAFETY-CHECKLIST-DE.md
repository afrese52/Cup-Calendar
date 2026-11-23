# Technische Vorprüfung: Datensicherheit

Stand: 23. November 2026. Diese Notiz ist eine Arbeitsgrundlage, keine
abgeschlossene Play-Console-Erklärung oder Rechtsberatung.

## Im CupCal-Quellcode nachvollziehbare Datenflüsse

- **Konto und Anmeldung:** E-Mail-Adresse und Passwort werden zur Registrierung,
  Anmeldung, Bestätigung, Passwortwiederherstellung und Kontolöschung an
  Supabase Auth übermittelt. Die mobile App speichert Sitzungsdaten über
  Android SecureStore. Ein in der App eingegebenes Passwort wird nicht als
  CupCal-Profilfeld gespeichert.
- **Favoriten:** Favorisierte Termin-IDs werden lokal gespeichert. Bei
  angemeldeten Konten werden Favoriten mit der Konto-ID an Supabase übertragen,
  damit sie auf mehreren Geräten erscheinen.
- **Termine:** Die App lädt öffentliche Turniertermine vom CupCal-API-Server
  und hält zuletzt geladene Daten lokal vor. Die öffentlichen Termindaten
  enthalten keine CupCal-Kontoinformationen.
- **Kontolöschung:** In der App lässt sich ein Löschlink anfordern. Das Konto
  wird erst nach Öffnen des Bestätigungslinks gelöscht.
- **Berechtigungen:** Die Android-Konfiguration fordert Internet- und
  Netzwerkstatus-Berechtigungen an. Eine Standort-, Kamera- oder
  Mikrofonberechtigung ist in der Android-Konfiguration nicht eingetragen.
- **Werbung und Analyse:** In den geprüften mobilen App-Dateien und direkten
  App-Abhängigkeiten wurde kein Werbe- oder Analytics-SDK-Aufruf gefunden.
  Die App-Build-Kette und die Dienstanbieter müssen vor dem Ausfüllen des
  Play-Formulars trotzdem vollständig geprüft werden.
- **Admin-Import:** Der Dateiimport für Spielpläne ist eine Admin-Funktion und
  für normale Konten nicht sichtbar. Das darf nicht als Funktion der
  öffentlichen Nutzerreise dargestellt werden.

## Mögliche Datenkategorien für die Betreiberprüfung

Diese Vorschläge müssen vor dem Absenden mit dem tatsächlich gebauten
Android-App-Bundle und den Anbieterverträgen abgeglichen werden:

- E-Mail-Adresse und Konto-/Nutzerkennung für Kontoerstellung und Anmeldung.
- Authentifizierungsdaten, weil das eingegebene Passwort an Supabase Auth
  übertragen wird.
- App-Aktivität bzw. gespeicherte Favoriten, weil Termin-IDs mit einer
  Konto-ID synchronisiert werden.
- Datenübermittlung an Supabase und den CupCal-API-Dienst für die genannten
  App-Funktionen.

Nicht als „Es werden keine Daten erhoben“ deklarieren. Ob Dienstanbieter
bestimmte Vorgänge als Erhebung oder Weitergabe behandeln, muss der Betreiber
anhand der Play-Definitionen, der Dienstanbieter und des finalen Builds
bestätigen. Auch eventuell beim Hosting oder in SDKs verarbeitete Diagnosedaten
sind zu prüfen.

## Vor Freigabe noch zu klären

1. Eine öffentlich erreichbare Datenschutzerklärung mit Anbieter/Kontakt,
   den Datenflüssen, Speicherdauer, Löschung und Dienstanbietern veröffentlichen
   und in der App sowie im Play-Eintrag verlinken.
2. Einen öffentlich erreichbaren Web-Löschpfad bereitstellen. Die vorhandene
   In-App-Bestätigung per E-Mail ersetzt den geforderten externen Link nicht.
3. Das finale APK/AAB und seine tatsächlich eingebundenen SDKs prüfen; die
   Liste in `package.json` allein ist für die Play-Erklärung nicht ausreichend.
4. Die Löschung gespeicherter Favoriten und möglicher weiterer Kontodaten
   anhand der Produktionsdatenbank und ihrer Aufbewahrungsregeln bestätigen.

## Quellen

- [Google Play: Datensicherheit](https://support.google.com/googleplay/android-developer/answer/10787469?hl=de)
- [Google Play: Kontolöschung](https://support.google.com/googleplay/android-developer/answer/13327111?hl=de)
- [Google Play: Nutzerdaten-Richtlinie](https://support.google.com/googleplay/android-developer/answer/10144311?hl=de)
