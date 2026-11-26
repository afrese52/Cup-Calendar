# Statische Prüfung des bereitgestellten CupCal-AAB

Prüfdatum: 26. November 2026.

## Ergebnis

**Dieses AAB ist keine geeignete Grundlage für die abschließende
Datensicherheitserklärung eines korrigierten Releases.** Es enthält weiterhin
eine leere Supabase-Konfiguration und zusätzliche Android-Berechtigungen,
die in der bisherigen Quellcode-Vorprüfung nicht berücksichtigt waren.

Es wurde nichts installiert, ausgeführt, hochgeladen, eingereicht oder
veröffentlicht. Dies ist eine statische Prüfung, kein Laufzeit- oder
vollständiger Sicherheitsnachweis.

## Eindeutige Zuordnung

- Bereitgestellte Datei:
  `0_application-6c2edfee-6596-4cd7-8952-307bcfdacd11_1795688465472.aab`
- SHA-256:
  `bc79d264fd131232bd4ddc921da6317d69406638f0e0f0bf5c301baad0d538aa`
- Paketkennung im zusammengeführten Android-Manifest: `de.cup.calender`
- Versionsname: `1.0.0`
- Versionscode: `1`
- Mindest-Android-SDK: `24`; Ziel-SDK: `36`
- Eingebetteter Expo-Appname: `CupCal: Kalender für FN`

Die aktuelle Projektkonfiguration verwendet hingegen `de.cup.calendar`.
Diese Kennungen bezeichnen unterschiedliche Android-Apps. Die Prüfung
dieser Datei bestätigt daher nicht einen künftigen Build mit der neuen
Kennung oder dessen Zuordnung zu einem Store-Eintrag.

## 1. Supabase ist in diesem Build nicht konfiguriert

Geprüft wurde das tatsächlich eingebettete Hermes-JavaScript
`base/assets/index.android.bundle`, nicht nur die lokale Buildkonfiguration.

Die disassemblierte Initialisierung lädt eine leere Zeichenfolge, übergibt
diese an die Normalisierung der Supabase-Adresse und verwendet dieselbe
leere Zeichenfolge als Schlüsselargument. Damit bleibt die
Konfigurationsprüfung negativ und der Supabase-Client wird nicht erstellt.
Die Texte für die beiden fehlenden Expo-Variablen und den bekannten
Konfigurationshinweis sind enthalten.

Zusätzlich wurde keine Supabase-Projektadresse im Bundle gefunden.
Das allein wäre kein hinreichender Beweis; entscheidend sind hier die
leeren Argumente in der Initialisierung.

Folge: Dieses AAB enthält den bereits gemeldeten Konfigurationsfehler.
Eine nachträgliche Änderung von Expo-Variablen repariert diese unveränderte
Datei nicht. Vor einer abschließenden Store-Erklärung ist das tatsächlich
vorgesehene korrigierte Release zu prüfen.

## 2. Tatsächliche Android-Berechtigungen

Das zusammengeführte Manifest enthält:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`
- `ACCESS_NETWORK_STATE`
- `INTERNET`
- `READ_EXTERNAL_STORAGE`, höchstens SDK 32
- `WRITE_EXTERNAL_STORAGE`, höchstens SDK 32
- `RECORD_AUDIO`
- `CAMERA`
- `SYSTEM_ALERT_WINDOW`
- `VIBRATE`
- `USE_BIOMETRIC`
- `USE_FINGERPRINT`
- Die appinterne Berechtigung
  `de.cup.calender.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

Insbesondere Kamera, Mikrofon und Overlay-Berechtigung wurden in der
bisherigen Vorprüfung nicht erfasst. In den eingebetteten
Abhängigkeitsmetadaten ist unter anderem Expo ImagePicker vorhanden.
Die Berechtigungen allein belegen weder tatsächlichen Zugriff noch eine
Übertragung von Fotos, Audio oder Standortdaten.

Vor dem nächsten Release sind nicht benötigte Berechtigungen gezielt
auszuschließen und das neu zusammengeführte Manifest erneut zu prüfen.
Sie dürfen nicht allein aufgrund einer kürzeren Liste in `app.json` als
entfernt gelten.

## 3. Dienste und verschlüsselte Übertragung

- Das Bundle enthält die CupCal-API-Domain. Die aktuelle
  Quellcodekonfiguration verwendet HTTPS für diese API.
- Es wurde keine konfigurierte Supabase-Projektadresse in diesem AAB
  nachgewiesen; eine funktionierende verschlüsselte Supabase-Verbindung
  kann deshalb für diese Datei nicht bestätigt werden.
- Im Manifest sind keine expliziten Attribute `usesCleartextTraffic`
  oder `networkSecurityConfig` vorhanden. Das ist keine vollständige
  Prüfung sämtlicher Verbindungen und nativer SDKs.
- In den geprüften DEX-Klassenmarkern und Abhängigkeitsmetadaten wurden
  keine Hinweise auf Firebase Analytics, Sentry, Crashlytics, Mixpanel,
  Amplitude oder das Google-Mobile-Ads-SDK gefunden. Diese begrenzte
  statische Suche ersetzt keinen vollständigen SDK- oder Laufzeitnachweis.
- Google Play Services für Standort sowie Expo-Module sind enthalten.
  Daraus allein folgt keine bestimmte Datenweitergabe.

Die globale Play-Frage nach Verschlüsselung **aller** Nutzerdaten wird
auf dieser Grundlage nicht abschließend bestätigt.

## 4. Android-Gerätesicherungen sind separat zu betrachten

Das Manifest setzt `allowBackup=true` und verweist auf
SecureStore-Sicherungsregeln. Die ältere Full-Backup-Regel schließt
Shared Preferences grundsätzlich ein und `SecureStore` aus.
Es gibt zusätzlich Regeln für Cloud-Backup und Geräteübertragung.

Damit sind Android-Gerätesicherungen nicht pauschal deaktiviert.
Welche konkreten App-Daten dadurch gesichert werden, ist gesondert mit
den Speicherorten abzugleichen. Eine Sieben-Tage-Aufbewahrung für
Supabase-Sicherungen legt keine entsprechende Frist für Google- oder
Gerätesicherungen fest.

## Offene Punkte vor Abschluss

1. Korrigiertes Release mit tatsächlich vorhandener öffentlicher
   Supabase-Konfiguration prüfen; keine privaten Service-Schlüssel einbetten.
2. Richtige Paketkennung und Store-Zuordnung des vorgesehenen Releases
   beibehalten beziehungsweise ausdrücklich abgleichen.
3. Nicht benötigte Kamera-, Mikrofon- und Overlay-Rechte entfernen und
   das fertige Manifest erneut prüfen.
4. Datenflüsse und SDKs des korrigierten AAB mit den Play-Datenkategorien
   und der Datenschutzerklärung abgleichen.
5. Android-Gerätesicherungen getrennt von Supabase-Sicherungen bewerten.
6. Supabase-Aufbewahrung erst nach bestätigtem Upgrade und Abgleich
   aktiver Projekteinstellungen als eingerichtet behandeln.

Ein neuer Build, ein kostenpflichtiges Upgrade oder eine Store-Einreichung
wurde durch diese Prüfung nicht ausgelöst.

## Vorbereitete Korrekturen im Projekt

Nach Freigabe durch den Nutzer wurden folgende Änderungen vorbereitet:

- Explizite Android-Manifest-Merge-Ausschlüsse für `CAMERA`, `RECORD_AUDIO`,
  `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` und `WRITE_EXTERNAL_STORAGE`.
  GPS und Netzwerk bleiben erhalten.
- Ein EAS-Pre-Install-Hook stoppt Builds bei fehlenden oder formal
  ungültigen öffentlichen Supabase-Werten. Er erlaubt öffentliche
  Publishable-Keys und strukturell passende Legacy-Anon-JWTs, aber keine
  Service-Role-/Secret-Keys. Werte werden nicht ausgegeben.
- Elf gezielte automatisierte Tests prüfen diese Regeln, die unveränderte
  Paketkennung und die bisherigen EAS-Profilentscheidungen.
- Die Expo-Introspektion bestätigt die fünf `tools:node="remove"`-Einträge
  sowie den Erhalt von GPS und Netzwerk. Diese Konfigurationsprüfung ist
  kein Ersatz für das zusammengeführte Manifest eines späteren AAB.

Die Paketkennung `de.cup.calendar` wurde bei dieser Vorbereitung nicht
geändert. Die bereits hochgeladene Datei bleibt unverändert und fehlerhaft.
Es wurde kein neuer nativer Build gestartet. Der Hook prüft das Format,
nicht die tatsächliche Gültigkeit, Projektzugehörigkeit oder Erreichbarkeit
von Supabase-Zugangsdaten.
