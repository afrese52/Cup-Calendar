# Übertragungsverschlüsselung des neuen Android-AAB

Prüfdatum: 26. November 2026.

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

## Einordnung für Google Play

**Für die nachvollzogenen App-Datenwege stützen die Befunde die Antwort
„Ja“ zur Verschlüsselung bei der Übertragung.** Es wurde kein konkreter
unverschlüsselter produktiver Nutzerdatenweg festgestellt.

Eine uneingeschränkte Garantie für *sämtliche* Nutzerdatenübertragungen
oder eine unabhängige Sicherheitszertifizierung ergibt sich daraus nicht:

- Kein Mitschnitt der installierten Android-App zur Laufzeit.
- Keine vollständige Untersuchung aller nativen/transitiven SDK-Datenflüsse.
- Kein Nachweis, dass alle in Google Play aktiven Versionen dieser Datei
  entsprechen.

Die Betreiberbestätigung der globalen Play-Antwort muss diese Grenzen
berücksichtigen. Durch diese Prüfung wurde das Console-Formular nicht
geändert, nichts eingereicht und nichts veröffentlicht.

## Quellen

- [Android: Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)
- [Google Play: Abschnitt zur Datensicherheit](https://support.google.com/googleplay/android-developer/answer/10787469?hl=de)
- Android-AAPT2-Protobuf-Schema `tools/aapt2/Resources.proto` aus dem
  offiziellen AOSP-Repository zur Dekodierung des AAB-Manifests.
