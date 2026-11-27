# Übertragungsverschlüsselung des neuen Android-AAB

Statische Prüfung: 26. November 2026.
Ergänzende Auswertung der Android-Gerätenachweise: 27. November 2026.

## Geprüfte Datei

- Fertiges AAB aus dem zuvor abgeschlossenen EAS-Produktionsbuild, nicht
  nur die lokale Expo-Konfiguration.
- Paketkennung aus dem Manifest: `de.cup.calendar`.
- Version: `1.0.0`, Versionscode `2`, Ziel-SDK `36`, Mindest-SDK `24`.
- SHA-256:
  `6bfa80281bbdce52d4c9e1f6956b7ba4fcad76997b8dc3e0f67362b8c3d2e3ce`.

Die Zuordnung zu sämtlichen tatsächlich in Google Play aktiven Artefakten
ist durch diese Dateiprüfung nicht bestätigt. Die Untersuchung des älteren
Bundles mit Paketkennung `de.cup.calender` bleibt separat dokumentiert.

## Bestätigte Befunde

### Supabase und Konto-/Favoritendaten

Im tatsächlich eingebetteten Hermes-Bytecode wird eine HTTPS-Projektadresse
mit einem nicht leeren öffentlichen Publishable-Key an die
Supabase-Initialisierung übergeben. Es handelt sich nicht mehr um die
leeren Werte des früheren AAB. Der Schlüssel wird hier nicht wiedergegeben.

Die Supabase-Clientinitialisierung leitet Auth- und Datenbankadressen aus
dieser HTTPS-Basis ab. Der eingebettete Code ersetzt für Realtime
`http` durch `ws` im Protokoll; aus `https:` wird daher `wss:`.
Die Echtzeitverbindung ist somit ebenfalls TLS-basiert konfiguriert.

Das belegt die konfigurierte Übertragungsverschlüsselung dieser Datenwege,
nicht erfolgreiche Anmeldung, Datenbankberechtigungen oder Favoritensync.

### CupCal-API und öffentliche Web-Links

Der Bytecode setzt die API-Basis über `setBaseUrl` auf
`https://cupcal.af-software.app`. Die Links zur Datenschutzerklärung
und Kontolöschung verwenden ebenfalls HTTPS.

### Tatsächliche TLS-Erreichbarkeit

Für die im AAB konfigurierte Supabase-Domain und die CupCal-Domain wurden
TLS-Handshakes mit **TLS 1.2 und TLS 1.3** erfolgreich ausgeführt.
Die normale Zertifikats- und Hostnamenprüfung war aktiviert und erfolgreich.
Es wurden keine Anmeldedaten oder Schlüssel übertragen.

- CupCal-API-Healthcheck, Datenschutz- und Kontolöschseite antworteten
  über HTTPS mit HTTP 200.
- Supabase Auth und REST antworteten ohne Zugangsdaten über HTTPS mit
  HTTP 401. Dies bestätigt die TLS-Erreichbarkeit, nicht den Kontozugriff.

### Android-Netzwerkregeln und Berechtigungen

Das zusammengeführte Manifest enthält weder eine explizite Freigabe durch
`usesCleartextTraffic=true` noch eine `networkSecurityConfig`.
Für Ziel-SDK 36 gilt nach Androids dokumentiertem Standard
`cleartextTrafficPermitted=false` für Netzwerkstacks, die diese
Plattformregel beachten. Dies ist keine Garantie für jede denkbare
native Socket-Implementierung.

Kamera, Mikrofon, Overlay sowie die alten externen Speicherrechte
sind im geprüften neuen Manifest nicht enthalten. Standort- und
Netzwerkberechtigungen sind weiterhin enthalten.

### HTTP-Zeichenfolgen und SDK-Marker

Die Zeichenfolgenprüfung fand HTTP-Verweise auf `localhost` und
`http://hostname/`. Im Codeabgleich gehören diese zu
Entwicklungs-/SDK-Standardwerten und einer internen Router-URL-Basis;
die Supabase-Initialisierung verwendet stattdessen die eingebettete
HTTPS-Projektadresse. Es wurde kein produktiver unverschlüsselter
Konto-/Favoriten-Endpunkt festgestellt.

Eine begrenzte Suche in DEX-Klassenmarkern fand keine Treffer für
Firebase Analytics, Crashlytics, Sentry, Amplitude, Mixpanel oder
Google-Mobile-Ads. Google-Standortdienste und Expo Location sind enthalten.
Eine Markersuche ist keine vollständige Prüfung aller nativen SDKs.

Der ergänzende [Werbe-ID-Abgleich vom 27. November 2026](./ADVERTISING-ID-AUDIT-DE.md)
bestätigt für genau dieses AAB das Fehlen der AD_ID-Berechtigung und
dokumentiert einen erweiterten SDK-Markerabgleich sowie die vorbereitete
Console-Antwort. Die aktuelle Zuordnung zu aktiven Play-Artefakten und
der gespeicherte Erklärungsstatus bleiben dort ausdrücklich offen.

## Einordnung für Google Play

**Für die nachvollzogenen App-Datenwege stützen die Befunde die Antwort
„Ja“ zur Verschlüsselung bei der Übertragung.** Es wurde kein konkreter
unverschlüsselter produktiver Nutzerdatenweg festgestellt.

Eine uneingeschränkte Garantie für *sämtliche* Nutzerdatenübertragungen
oder eine unabhängige Sicherheitszertifizierung ergibt sich daraus nicht:

- Kein vollständiger Mitschnitt der installierten Android-App zur Laufzeit;
  erste PCAPdroid-Screenshots sind unten separat ausgewertet.
- Keine vollständige Untersuchung aller nativen/transitiven SDK-Datenflüsse.
- Kein Nachweis, dass alle in Google Play aktiven Versionen dieser Datei
  entsprechen.

Die Betreiberbestätigung der globalen Play-Antwort muss diese Grenzen
berücksichtigen. Durch diese Prüfung wurde das Console-Formular nicht
geändert, nichts eingereicht und nichts veröffentlicht.

## Dokumentierter Android-Gerätelauf (27. November 2026)

**Die bereitgestellten Laufzeitnachweise sind ausgewertet. Ein lückenloser
Gesamtnachweis sämtlicher App-/SDK-Verbindungen ergibt sich daraus nicht.**
Der Betreiber führte den angeleiteten lokalen PCAPdroid-Durchgang aus und
stellte insgesamt drei Screenshots bereit. Kein Fernzugriff und kein
Rohmitschnitt lagen zur Auswertung vor. Die verfügbaren Expo-Build-/
Diagnoseberichte wurden nicht als Laufzeitmitschnitt gewertet.

**Betreiberangaben:** Samsung Galaxy S24 Ultra, Android **17**; Installation
der angefragten Release-App und freigegebenes Testkonto ohne echte Nutzerdaten
bestätigt. Die Frage zum Ablauf von Kalenderabruf, Anmeldung und
Favoritensynchronisierung wurde mit „Passt alles soweit“ beantwortet.
Separate Zeiten und Ergebnisse je Prüfschritt wurden nicht genannt.
Zur nachfolgenden automatischen Regionswahl meldete der Betreiber
„Ohne Probleme wie geplant“ und zur Verschlüsselung „Ist https verschlüsselt“.
Eine neue Verbindungsliste für diesen zweiten Durchgang, die
Gerätezeitzone und getrennte Bedienzeiten wurden nicht bereitgestellt.
Android-Version, Paket-/Versionscode und Herkunft der Installation sind
nicht unabhängig am Gerät verifiziert.

Die Vorbereitung ohne TLS-Entschlüsselung, Zertifikatsinstallation oder
Dateiexport und mit CupCal-Aufnahmefilter wurde vom Betreiber bestätigt.
Die Aufnahmeeinstellungen selbst sind nicht abgebildet. In der Liste ist
zusätzlich eine Verbindung mit unbekannter App-Zuordnung sichtbar; daraus
folgt weder ein weiterer CupCal-Endpunkt noch eine vollständig belegte
Aufnahmefilterkonfiguration. Der Filter soll auch native Bibliotheken im
CupCal-Prozess erfassen, nicht automatisch separat laufende
Google-/Systemdienste.

### Tatsächlich sichtbare Verbindungsziele

Bereinigte Nachweise: [Verbindungsliste](./transport-evidence/2026-11-27-cupcal-verbindungen.png)
und [DNS-Detail](./transport-evidence/2026-11-27-cupcal-dns.png) aus dem ersten
Durchgang sowie [Supabase-HTTPS-Detail](./transport-evidence/2026-11-27-supabase-https-detail.png)
aus der ergänzenden Rückmeldung.
Die Ausschnitte wurden aus den drei bereitgestellten Screenshots erzeugt.
Beim HTTPS-Detail wurden Protokoll/SNI und Hinweisdialog als zwei
unveränderte Ausschnitte untereinander angeordnet; dies ist kein
durchgehender Bildschirmbereich des Originals.
Statusleiste, lokale IP-Adressen und numerische App-Kennung wurden nicht
übernommen. Keine Kontodaten, Schlüssel oder Tokens sind in diesen
Nachweisen enthalten.

Das DNS-Detail datiert den Start auf den 27. November 2026, 12:39:48.
Die folgenden Uhrzeiten sind die in der Liste sichtbaren Aktivitätszeiten,
keine zugeordneten Beginn-/Endzeiten der Bedienhandlungen. Die
Gerätezeitzone wurde nicht angegeben.

| Ziel / DNS-Abfrage | Sichtbares Protokoll und Port | Sichtbare Aktivität | Aussage und Grenze |
| --- | --- | --- | --- |
| `cupcal.af-software.app` | HTTPS, 443; zwei Einträge | 12:40:37 und 12:41:55 | PCAPdroid erkennt HTTPS, nicht nur einen beliebigen Port-443-Verkehr. Konkrete TLS-Version und Handshake sind nicht abgebildet. |
| `ycjfzqriwxsqrqkfojvw.supabase.co` | HTTPS, 443; vier Einträge; ergänzendes Detail: HTTPS (TCP) mit passender SNI | zweimal 12:41:55, zweimal 12:43:42 | HTTPS zum Supabase-Ziel beobachtet. Auth, REST und WSS lassen sich daraus nicht getrennt nachweisen. |
| `cupcal.af-software.app` | DNS, UDP, Zielport 53 im Originaldetail | 12:39:48 | Unverschlüsselte DNS-Abfrage am lokalen VPN-Erfassungspunkt; keine Konto-/Favoritennutzlast abgebildet. |
| `ycjfzqriwxsqrqkfojvw.supabase.co` | DNS, 53 | 12:40:59 | DNS-Abfrage der Supabase-Domain. UDP ist in der Liste allein nicht ausgewiesen. |
| `_dns.resolver.arpa` | DNS, 53; App „Unbekannt“ | 12:39:37 | Resolverbezogene Abfrage ohne gesicherte CupCal-Zuordnung; kein Nutzdaten-API-Ziel. |

**DNS ist nicht HTTPS:** Die UDP-DNS-Abfrage ist am Erfassungspunkt nicht
TLS-verschlüsselt. Das widerspricht einer pauschalen Aussage „jede
Verbindung ist verschlüsselt“. Es ist aber kein Nachweis für unverschlüsselte
Passwörter oder Favoriten. Ob Android oder das Netz den nachgelagerten
Resolvertransport verschlüsselt, geht aus dem lokalen VPN-Nachweis nicht
hervor. Deshalb wird daraus keine Aussage über den gesamten DNS-Weg abgeleitet.

Alle sechs sichtbaren HTTPS-Einträge sind als „Geschlossen“ markiert;
dies allein belegt weder einen Fehler noch einen erfolgreichen
fachlichen Ablauf. Ein HTTP-Klartext-Nutzdatenziel ist im sichtbaren
Ausschnitt nicht enthalten. Fehlende Listeneinträge, native Hintergrundziele,
TLS-Version, Zertifikatsprüfung und ein separater WSS-Upgrade sind damit
nicht ausgeschlossen bzw. nicht nachgewiesen.

Der dritte Screenshot zeigt im Hintergrund ausdrücklich **HTTPS (TCP)**
mit der Supabase-Domain als SNI. Der eingeblendete PCAPdroid-Hinweis
„TLS/HTTPS-Verkehr ist verschlüsselt“ passt zu dieser Protokollerkennung.
Der Hinweis ist jedoch keine Anzeige einer konkreten TLS-Version oder
eines geprüften Serverzertifikats. Es wurde keine Entschlüsselung
angefordert oder durchgeführt; der Hinweis wurde nicht als Anlass für
eine Zertifikatsinstallation oder Änderung der Produktions-App gewertet.
Der Screenshot weist weder ein neues Ziel noch einen zusätzlichen,
zeitlich separat zuordenbaren Regionswahl-Datenfluss nach.

### Zuordnung zu den Prüffällen

Die erwarteten Endpunkte stammen aus Quellcode und bisherigem AAB-Bericht;
der aktuelle Quellcode ist nicht automatisch identisch mit dem gebauten AAB.

| Prüffall | Erwarteter Datenweg / gesondert zu prüfen | Laufzeitbefund |
| --- | --- | --- |
| Kaltstart und Kalenderabruf ohne Cache | CupCal-Domain aus dem AAB, `HTTPS /api/v1/events`; `useGetEvents` in `state/AppContext.tsx` | Betreiber meldet keinen Fehler; HTTPS zur CupCal-Domain sichtbar, konkreter Pfad und frischer Abruf ohne Cache nicht belegt. |
| Anmeldung mit freigegebenem Testkonto; Sitzung erneuern | Supabase-Projektdomain aus dem AAB, Auth über HTTPS; `services/createSupabaseClient.ts` verwendet den normalen Fetch-Stack | Betreiber meldet keinen Fehler; HTTPS zu Supabase sichtbar. Getrennte Auth-Zuordnung und Sitzungserneuerung nicht belegt. |
| Favorit setzen/entfernen und erneut laden | Supabase REST über HTTPS; zusätzlich Realtime über WSS, Kanal für `user_event_bookmarks` in `state/AppContext.tsx`; lokalen Erfolg nicht als Sync-Nachweis werten | Betreiber meldet keinen Fehler; HTTPS zu Supabase sichtbar. Serverpersistenz und WSS nicht separat nachgewiesen. |
| Optionale automatische Regionswahl | `services/deviceRegion.ts` ruft Expo Location auf und berechnet die Region lokal; mögliche Verbindungen nativer Standortdienste separat zuordnen | Laut Betreiber ohne Probleme. Keine gesonderte Verbindungsliste oder zeitliche Zuordnung; weder neue Ziele noch Abwesenheit zusätzlicher Standortdienst-Verbindungen nachgewiesen. |
| Native SDKs, Start-/Hintergrundaktivität und Rückkehr zur App | Alle zusätzlichen Ziele erfassen, insbesondere Expo-/Android-/Google-Standortdienste; keine Vollständigkeit aus einer JS-Fetch-Liste ableiten | Im sichtbaren Ausschnitt keine zusätzlichen zugeordneten Ziele; separate Systemdienste und Vollständigkeit nicht belegt. |

### Wiederholbarkeit und verbleibende Nachweisgrenzen

Die folgenden Schritte beschreiben die datensparsame Methode für eine
Wiederholung oder Vertiefung. Nicht vollständig belegte Punkte des
vorliegenden Betreiberlaufs werden dadurch nicht nachträglich als geprüft
gewertet. Für eine unabhängige Vollständigkeitsprüfung sind insbesondere
die installierte Buildidentität, getrennte Ablaufzeiten, ein vollständiges
Verbindungsinventar sowie die separat laufenden Systemdienste noch offen.

1. Freigabe für Gerät, isoliertes Testkonto und Erfassung einholen. Keine
   Zugangsdaten im Bericht oder Chat hinterlegen. Android-Version und
   Gerätemodell ohne Seriennummer dokumentieren. Die installierte
   Release-Version `de.cup.calendar`, `1.0.0`, Code `2` und ihre Herkunft
   aus dem oben gehashten AAB belegen; Expo Go oder ein Entwicklungsbuild
   sind dafür kein Ersatz.
2. Vor dem ersten App-Start einen appbezogenen VPN-Mitschnitt oder einen
   freigegebenen Mitschnitt im Testnetz beginnen. Auch direkte Verbindungen
   außerhalb eines HTTP-Proxys, UDP/QUIC und native SDKs berücksichtigen.
   System-/Play-Services-Verkehr nach Möglichkeit separat korrelieren;
   nicht allein aufgrund zeitlicher Nähe CupCal zuordnen. Nicht
   zuordenbare oder nicht erfassbare Verbindungen als Lücke kennzeichnen.
3. Die obigen Abläufe mit getrennten Zeitfenstern ausführen. Für Favoriten
   den serverseitigen Erfolg zusätzlich durch erneutes Laden bzw. eine
   zweite freigegebene Sitzung prüfen. Regionswahl auch ohne Freigabe und
   nach bewusster Standortfreigabe vergleichen; keine Koordinaten speichern.
4. Je Ziel nur Hostname, Port, Transport, beobachtete TLS-Version (falls
   erkennbar), Zeitfenster und Zuordnung zum Prüffall protokollieren.
   TLS nicht allein aus Port 443 ableiten; unklare Handshakes, fehlende
   SNI-/DNS-Zuordnung und nicht sichtbare WSS-Upgrades ausdrücklich als
   unbestätigt kennzeichnen. Ein passiver TLS-Mitschnitt allein beweist
   keine korrekte Zertifikatsprüfung des Clients.
5. Keine Zertifikatsprüfung, kein Pinning und keine Netzwerkregeln im
   Produktionsbuild abschalten oder umgehen. Eine vom Release abgelehnte
   Proxy-CA ist eine Prüfgrenze, kein Anlass zur Buildänderung.
6. Keine Request-/Response-Inhalte, Header, Cookies, E-Mail-Adressen,
   Nutzer-IDs, Passwörter, Tokens oder URL-Querys in Bericht, Git oder
   Anhängen speichern. Auch PCAP-/HAR-Rohdaten können sensible Inhalte
   enthalten: nicht ins Repository übernehmen, nur im freigegebenen
   geschützten Prüfbereich verarbeiten und nach vereinbarter Frist löschen.
   In den Bericht gehören ausschließlich bereinigte Verbindungsmetadaten
   und eine nicht vertrauliche Nachweisreferenz.

### Vergleich mit dem gespeicherten Play-Entwurf

Laut [Datensicherheits-Checkliste](./DATA-SAFETY-CHECKLIST-DE.md) wurde am
26. November 2026 für `de.cup.calendar` die Antwort auf „Verschlüsselung
aller erhobenen Nutzerdaten bei der Übertragung“ mit **„Ja“** nach erneutem
Laden bestätigt. Die Play Console wurde bei dieser Ergänzung nicht erneut
geöffnet; dies ist der zuletzt dokumentierte, nicht der neu ausgelesene Stand.

**HTTPS zu CupCal und Supabase ist nun auch im Gerätelauf sichtbar.**
Es ist keine konkrete Klartextübertragung von Konto-/Favoritendaten
belegt. DNS über Port 53 ist separat sichtbar und darf nicht als
verschlüsselter Nutzdatenkanal bezeichnet werden. Die globale Aussage
des Entwurfs bleibt weitergehend als diese begrenzten Laufzeitnachweise.
Insbesondere die Ziele nativer SDKs und Standortdienste sind zur Laufzeit
außerhalb des sichtbaren App-Ausschnitts noch unbestätigt. Eine
Übertragung von Standortkoordinaten ist weder beobachtet noch durch den
erfolgreichen Regionswahl-Ablauf allein ausgeschlossen.

**Ergebnis für den Entwurf:** Keine nachgewiesene Abweichung der sichtbaren
CupCal-/Supabase-Nutzdatenverbindungen von der gespeicherten
Verschlüsselungsantwort „Ja“. Die DNS-Beobachtung und fehlende
Vollständigkeit sind die ausdrücklich dokumentierten Einschränkungen;
die globale Antwort wurde durch diesen Teilnachweis nicht unabhängig
für sämtliche Verbindungen bestätigt. Bei einer Vertiefung sind
zusätzliche Empfänger und eventuelle Klartext-Nutzdatenverbindungen
einzeln mit der Datensicherheitserklärung abzugleichen.
Weder die Play-Antwort noch die App-Konfiguration wurden
hier geändert; es wurde nichts gebaut, eingereicht oder veröffentlicht.

## Quellen

- [PCAPdroid: offizielle Kurzanleitung, Aufnahmefilter und Prüfgrenzen](https://emanuele-f.github.io/PCAPdroid/quick_start)
- [Android: Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)
- [Google Play: Abschnitt zur Datensicherheit](https://support.google.com/googleplay/android-developer/answer/10787469?hl=de)
- Android-AAPT2-Protobuf-Schema `tools/aapt2/Resources.proto` aus dem
  offiziellen AOSP-Repository zur Dekodierung des AAB-Manifests.
