# Technische Vorprüfung: Datensicherheit

Stand: 26. November 2026. Diese Notiz ist eine Arbeitsgrundlage, keine
abgeschlossene Play-Console-Erklärung oder Rechtsberatung.

## Ergebnis des bereitgestellten Release-AAB

Die statische Prüfung der bereitgestellten Datei ergab eine leere
Supabase-Konfiguration und zusätzliche Kamera-, Mikrofon- und Overlay-Rechte
im zusammengeführten Android-Manifest. Paketkennung ist `de.cup.calender`,
Versionscode `1`. Die Datei ist daher kein Nachweis eines korrigierten
Releases. Einzelheiten und Grenzen der Prüfung stehen in
[RELEASE-AAB-AUDIT-DE.md](./RELEASE-AAB-AUDIT-DE.md).

Die folgenden Quellcodeangaben sind ausdrücklich nicht mit nachgewiesenem
Verhalten dieses älteren AAB gleichzusetzen.

## Bearbeitungsstand in Google Play

### Neuer Store-Eintrag `de.cup.calendar`

#### Korrigierter und erneut geprüfter Entwurf

Nach Betreiberfreigabe wurden die Fehler korrigiert, über „Als Entwurf
speichern“ gespeichert und nach vollständigem Neuladen die konkreten
Detailantworten sowie die Vorschau erneut geprüft:

| Datentyp | Erhoben | Geteilt | Nur sitzungsspezifisch | Erhebung | Zwecke |
| --- | --- | --- | --- | --- | --- |
| E-Mail-Adresse | Ja | Nein | Nein | Optional | Funktionen der App, Kontoverwaltung |
| Nutzer-IDs | Ja | Nein | Nein | Optional | Funktionen der App, Kontoverwaltung |
| App-Interaktionen (Favoriten) | Ja | Nein | Nein | Optional | Funktionen der App |

Ungefährer und genauer Standort sind nicht als erhobene Daten ausgewählt:
Die geprüfte Regionsbestimmung verarbeitet Koordinaten lokal, der Kalender
lädt Termine ohne Regionsparameter und filtert sie auf dem Gerät.
Im API-Code wurde keine zusätzliche Geo-IP-Ableitung gefunden. Dies ist
eine Aussage zu den geprüften App-Datenflüssen, keine pauschale Garantie
für alle denkbaren Plattform-/SDK-Verarbeitungen.

Die Vorschau zeigt nun E-Mail-Adresse, Nutzer-IDs und App-Interaktionen
als erfasste Daten, keine Standorterhebung und keine Datenweitergabe.
„Nicht geteilt“ berücksichtigt die Dienstanbieter-Ausnahme nach Googles
Definition für die Verarbeitung durch Supabase im Auftrag.
Übertragungsverschlüsselung bleibt „Ja“, Kontoerstellung
„Nutzername und Passwort“, Teil-Datenlöschung ohne Kontolöschung „Nein“.
Beide Links stimmen weiterhin:

- `https://cupcal.af-software.app/datenschutz/`
- `https://cupcal.af-software.app/konto-loeschen/`

Die bekannten Datenflüsse sind mit dem geprüften AAB
`de.cup.calendar`, Version `1.0.0`, Versionscode `2`, abgeglichen.
Die vom Betreiber bestätigten Supabase-Fristen bleiben sieben Tage
für Backups/Logs; Replit-Betriebslogs sind davon getrennt mit 30 Tagen
zu behandeln. Die Console enthält keine eigenen Felder für diese Fristen.
Die Aussagegrenzen des Transportaudits bleiben bestehen.

**Es wurde ausschließlich der Entwurf gespeichert.** Der abschließende
„Speichern“-Button in der Vorschau wurde nicht betätigt; es wurde nichts
eingereicht, veröffentlicht oder an einem Release geändert.
Der alte Store-Eintrag blieb unberührt. Die folgenden Abschnitte halten
die vorausgegangenen Zwischenstände fest.

#### Nachprüfung der manuell gepflegten Angaben

Die anschließende rein lesende Console-Prüfung am 26. November ergab:

- Aktiver interner Test: Version `1.0.0`, Versionscode `2`. Das entspricht
  Version und Paketkennung des geprüften AAB; es ist kein binärer
  Gleichheitsnachweis.
- Beide öffentlichen URLs sind in der Formularvorschau korrekt vorhanden.
- Google zeigt Datensicherheit als „Abgeschlossen“. Dieser UI-Status
  bestätigt nicht die fachliche Richtigkeit.
- E-Mail ist als erhoben, nicht geteilt, optional und **sitzungsspezifisch**
  markiert; Zwecke sind App-Funktionen und Kontoverwaltung.
- Ungefährer Standort ist ebenfalls als erhoben, optional und
  sitzungsspezifisch markiert; Zweck sind App-Funktionen.
- Nutzer-IDs sind nicht gewählt; die kontosynchronisierten Favoriten
  wurden nicht als eigene App-Aktivität deklariert.
- Die Vorschau zeigt „Keine Datenerfassung angegeben“. Nach Googles
  Definition können sitzungsspezifische Daten in der öffentlichen
  Erhebungsdarstellung entfallen. Die Anzeige ist daher nicht für sich
  ein Nachweis eines Console-Fehlers.

**Der fachliche Gesamtabgleich ist nicht bestanden:** Kontobezogene
E-Mail-Adressen und Favoriten werden dauerhaft serverseitig verarbeitet,
nicht ausschließlich im Arbeitsspeicher für eine Echtzeitanfrage.
Die Markierung als sitzungsspezifisch ist für die E-Mail daher nicht
zutreffend. Nutzer-IDs und Favoriten müssen in den passenden Kategorien
berücksichtigt werden. Die Standortdeklaration ist mit der ausschließlich
lokalen GPS-Verarbeitung abzugleichen; eine etwaige zusätzliche
Standortableitung durch andere Dienste ist dabei separat zu betrachten.

Bei dieser Nachprüfung wurden keine Angaben geändert, gespeichert,
eingereicht oder veröffentlicht. Die nachfolgende Dokumentation beschreibt
die frühere Teilbearbeitung, bevor der Betreiber die restlichen Angaben
manuell gepflegt hat.

Am 26. November 2026 wurden im direkten Play-Console-Browserzugriff folgende
Werte gespeichert und nach erneutem Laden bestätigt:

- Datenschutzerklärung: `https://cupcal.af-software.app/datenschutz/`
- Kontolöschseite: `https://cupcal.af-software.app/konto-loeschen/`
- Datenerhebung bzw. Weitergabe (gemeinsame Eingangsfrage): „Ja“, da
  Konto- und Favoritendaten übertragen werden.
- Kontoerstellung: ausschließlich „Nutzername und Passwort“ für
  die E-Mail-/Passwortanmeldung.
- Verschlüsselung aller erhobenen Nutzerdaten bei der Übertragung: „Ja“.
  Bei der nachfolgenden, vom Betreiber freigegebenen Browserprüfung war
  dieser Wert bereits ausgewählt. Er wurde nach frischem Neuladen bei
  deaktiviertem „Entwurf speichern“ bestätigt; es war kein erneutes
  Speichern nötig. Die Prüfgrenzen des Transportaudits gelten weiterhin.

Die Datensicherheit ist ein **unvollständiger gespeicherter Entwurf**.
Es wurde nichts eingereicht oder veröffentlicht. Die Pflichtfrage zur
Verschlüsselung ist inzwischen im gespeicherten Entwurf mit „Ja“ beantwortet.
Der durchgeführte statische Abgleich des neuen
AAB und TLS-Handshakes bestätigen HTTPS/WSS für die nachvollzogenen
App-Datenwege; ein vollständiger Laufzeit-/SDK-Nachweis liegt nicht vor.
Dateizuordnung, Ergebnis und Grenzen stehen in
[RELEASE-V2-TRANSPORT-AUDIT-DE.md](./RELEASE-V2-TRANSPORT-AUDIT-DE.md).
Datentypen, Datennutzung und Vorschau (Schritte 3–5) wurden durch diese
Bearbeitung noch nicht ausgefüllt. Die optionale Frage nach Datenlöschung
ohne Kontolöschung war bei der erneuten Prüfung bereits mit „Nein“
beantwortet und wurde nicht geändert.

### Früherer Store-Eintrag `de.cup.calender`

Im früher geprüften Store-Eintrag `de.cup.calender` wurden folgende Angaben
gespeichert, aber nicht eingereicht oder veröffentlicht:

- Datenschutzerklärung: `https://cupcal.af-software.app/datenschutz/`
- Kontolöschseite: `https://cupcal.af-software.app/konto-loeschen/`
- Datenerhebung: „Ja“, da Konto- und Favoritendaten übertragen werden.
- Kontoerstellung: „Nutzername und Passwort“ für die E-Mail-/Passwortanmeldung.

Auch dort war die Erklärung zur Datensicherheit ein unvollständiger Entwurf.
Diese älteren Angaben sind kein Nachweis für den neuen Store-Eintrag.
Beim oben dokumentierten Speichern im neuen Eintrag wurde der alte
Eintrag nicht verändert.

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
  Netzwerkstatus-Berechtigungen sowie eine optionale Standortberechtigung an.
  Erteilte Standortkoordinaten werden auf dem Gerät nur zur Auswahl der
  nächstgelegenen Turnierregion verwendet und weder gespeichert noch gesendet.
  Die frühere Quellcode-Vorprüfung erfasste keine Kamera-/Mikrofonnutzung.
  Im tatsächlich bereitgestellten AAB sind jedoch Kamera- und
  Mikrofonberechtigungen deklariert; eine tatsächliche Nutzung oder
  Übertragung ist dadurch allein nicht belegt.
- **Werbung und Analyse:** In den geprüften mobilen App-Dateien und direkten
  App-Abhängigkeiten wurde kein Werbe- oder Analytics-SDK-Aufruf gefunden.
  Für die Website sind Google Fonts eingebunden; Replit Analytics wurde
  zeitweise in einer Live-HTML-Antwort beobachtet.
- **Dienstanbieter:** Supabase Auth und Datenbank laufen in Frankfurt/EU.
  Website und API werden über Replit bereitgestellt. Der vorhandene IONOS-
  E-Mail-Hook ist laut Projektprüfung nicht aktiviert und wird nicht als
  aktiver Versanddienst angegeben.
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

## Technischer Abgleich für den noch offenen Entwurf

| Bereich | Im aktuellen Quellcode nachvollziehbar | Vor endgültiger Bestätigung offen |
| --- | --- | --- |
| API-Verbindung | Die mobile App setzt die API-Adresse mit `https://` aus der Build-Domain zusammen. | Tatsächliche Domain und Netzwerkkonfiguration des Release-AAB prüfen. |
| Supabase-Verbindung | Die Projektadresse stammt aus der Expo-Buildvariable. Die Normalisierung entfernt API-Pfade, erzwingt aber kein HTTPS. | Im konkreten Release eingebettete Adresse auf HTTPS prüfen, ohne Schlüssel zu veröffentlichen. |
| Konto | E-Mail, Passwort und Konto-ID werden für die Anmeldung verarbeitet. | Zuordnung zu Googles Datenkategorien anhand der aktuellen Definitionen prüfen. |
| Favoriten | Termin-IDs werden für angemeldete Konten kontobezogen synchronisiert. | Datenkategorie, Zweck und optionale Erhebung im Formular mit dem Release abgleichen. |
| Standort | Laut technischer Vorprüfung nur lokale Regionsauswahl. | Im Release sicherstellen, dass keine Koordinaten an Dienste oder SDKs gesendet werden. |
| Drittanbieter | In den direkten mobilen Abhängigkeiten ist kein Werbe-/Analytics-SDK erkennbar. | Eingebundene native und transitive SDKs des AAB sowie mögliche Diagnoseverarbeitung prüfen. |

Die Frage „Werden alle Nutzerdaten bei der Übertragung verschlüsselt?“
ist nach Betreiberfreigabe im gespeicherten Entwurf mit „Ja“ bestätigt.
Die neue AAB-Prüfung
stützt „Ja“ für die nachvollzogenen App-Datenwege, ist aber kein
uneingeschränkter Nachweis sämtlicher SDK-Übertragungen oder aller aktiven
Store-Artefakte. HTTPS im API-Quellcode allein wäre kein solcher Nachweis.

## Vor Freigabe noch zu klären

1. Beide öffentlichen URLs antworteten bei der Prüfung am 26. November mit
   HTTP 200 und wurden in der Play Console gespeichert. Vor Einreichung
   erneut mit dem vorgesehenen Store-Eintrag abgleichen.
2. Der Web-Löschpfad verwendet eine E-Mail-Bestätigung. Die vollständige
   Löschung ohne installierte App bleibt als eigener Ablauf zu bestätigen;
   Erreichbarkeit mit HTTP 200 allein belegt dies nicht.
3. Das finale APK/AAB und seine tatsächlich eingebundenen SDKs prüfen; die
   Liste in `package.json` allein ist für die Play-Erklärung nicht ausreichend.
4. Konto- und Favoritendaten bleiben während der aktiven Kontonutzung
   gespeichert. Die bestätigte Kontolöschung löscht das Konto unmittelbar;
   Favoriten sind laut lokalem Datenbankschema über kaskadierende Löschung
   daran gebunden. Das ist von der Aufbewahrung in Sicherungen zu unterscheiden.
5. Der Betreiber hat am 26. November 2026 bestätigt, dass für Supabase
   tägliche Sicherungen mit sieben Tagen Aufbewahrung und Protokolle mit
   sieben Tagen Aufbewahrung jetzt eingerichtet sind. Dies ist eine
   Nutzerrückmeldung, keine unabhängige Dashboard-Prüfung.
6. Replit-Veröffentlichungsprotokolle werden laut Replit-Dokumentation
   30 Tage aufbewahrt. Dies ist nicht dieselbe Protokollkategorie wie
   Supabase-Protokolle und bestätigt keine Frist für andere Datenbestände.
7. Vor Einreichung müssen Datenschutzerklärung, tatsächliche Einrichtung,
   vorgesehenes Release-AAB und die vollständige Play-Erklärung übereinstimmen.
   Weder Upgrade noch neuer Build noch Einreichung sind durch diese Notiz
   freigegeben.

## Quellen

- [Google Play: Datensicherheit](https://support.google.com/googleplay/android-developer/answer/10787469?hl=de)
- [Google Play: Kontolöschung](https://support.google.com/googleplay/android-developer/answer/13327111?hl=de)
- [Google Play: Nutzerdaten-Richtlinie](https://support.google.com/googleplay/android-developer/answer/10144311?hl=de)
- [Replit: Veröffentlichte App überwachen](https://docs.replit.com/features/publishing/monitoring-a-deployment)
