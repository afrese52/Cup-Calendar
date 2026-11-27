# Werbe-ID-Erklärung für Google Play

Prüfdatum: 27. November 2026.

## Ergebnis und verbleibender Freigabeblocker

**Für das unten eindeutig identifizierte AAB stützt die statische Prüfung
die Console-Antwort „Nein“ auf „Verwendet deine App eine Werbe-ID?“,
einschließlich der eingebundenen SDKs.** Es wurde weder die
`com.google.android.gms.permission.AD_ID`-Berechtigung noch ein Hinweis
auf die unten untersuchten Werbe-ID-Zugriffe oder Werbe-SDKs gefunden.
Das ist keine vollständige Laufzeitprüfung aller nativen Bibliotheken.

**Der offene Console-Hinweis ist damit noch nicht nachweislich erledigt.**
Es fehlt der aktuelle lesende Abgleich der aktiven Play-Artefakte und
der gespeicherten Werbe-ID-Antwort. In dieser Sitzung ist kein
Google-Play-Connector verbunden; ein authentifizierter direkter
Console-Browserzugriff steht dieser Prüfung nicht zur Verfügung.
Es wurde keine neue Verbindung angefordert und keine Console-Angabe geändert.
Ein früher funktionierender Browserzugriff beweist keine aktuelle Sitzung.

Die vorhandene
[Datensicherheits-Checkliste](./DATA-SAFETY-CHECKLIST-DE.md)
dokumentiert für den **26. November 2026** einen aktiven internen Test
mit Version `1.0.0`, Versionscode `2`, im neuen Eintrag
`de.cup.calendar`. Das passt zum geprüften AAB, ist aber weder ein
aktueller Track-Nachweis noch ein binärer Gleichheitsnachweis.
Der Status des Hinweises „überprüfungsbedürftig“ wurde heute nicht erneut
aus der Console gelesen.

## Tatsächlich untersuchter Build

| Merkmal | Beleg |
| --- | --- |
| EAS-Build | `2e6eb5a8-e339-42b2-8ed0-85b9cd359333` |
| Buildstatus | `FINISHED`, Android, Profil `production`, Distribution `STORE` |
| Abschluss | 26. November 2026, 11:13:22 UTC |
| Paketkennung im fertigen Manifest | `de.cup.calendar` |
| Version / Versionscode im fertigen Manifest | `1.0.0` / `2` |
| Ziel-SDK / Mindest-SDK | `36` / `24` |
| SHA-256 des AAB | `6bfa80281bbdce52d4c9e1f6956b7ba4fcad76997b8dc3e0f67362b8c3d2e3ce` |
| Lokale Prüfdatei | `generated-artifacts/cupcal-release-v2.aab` |
| EAS-Artefakt | `https://expo.dev/artifacts/eas/7XBcI9tirWDFvw4s01cv70s_Jg788biuD_MS-NhZ-9k.aab` |

Die am Prüfdatum lesend abgerufene EAS-Buildliste führte diesen Build
als neuesten abgeschlossenen Build. Die lokale Datei wurde erneut
gehasht. Zusätzlich wurde das EAS-Artefakt erneut über HTTPS gelesen
und sein Datenstrom gehasht: **beide SHA-256-Werte sind identisch**.
Damit ist die Dateizuordnung zu diesem EAS-Build bestätigt, nicht dessen
aktuelle Aktivierung in Google Play. `STORE` bedeutet eine
Build-Distribution, nicht Veröffentlichung oder einen aktiven Play-Track.

Die lokale `app.json` nennt weiterhin Versionscode `1`.
`eas.json` verwendet jedoch `appVersionSource: "remote"` und für
Produktionsbuilds `autoIncrement: "versionCode"`. Maßgeblich für diese
Prüfung ist deshalb der aus der fertigen Datei gelesene Versionscode `2`,
nicht der lokale Konfigurationswert. Es wurde keine Version geändert.
Das ältere AAB für `de.cup.calender` gehört zu einer anderen App und ist
kein Beleg für diesen Store-Eintrag.

## Manifest und SDK-Abgleich

### Zusammengeführtes Manifest

Das ZIP-Verzeichnis des vollständigen AAB enthält genau ein
Modulmanifest: `base/manifest/AndroidManifest.xml`. Dieses wurde erneut
aus der Datei als Android-Protobuf-XML dekodiert, nicht aus `app.json`
abgeleitet. Es enthält diese Berechtigungen:

- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.INTERNET`
- `android.permission.VIBRATE`
- `android.permission.USE_BIOMETRIC`
- `android.permission.USE_FINGERPRINT`
- `de.cup.calendar.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

Weder `com.google.android.gms.permission.AD_ID` noch
`android.permission.ACCESS_ADSERVICES_AD_ID` sind vorhanden.
Die zweite Berechtigung betrifft Android AdServices und ist nicht mit
der Google-Play-Dienste-Werbe-ID gleichzusetzen; sie wurde ergänzend geprüft.

### Tatsächlich enthaltene DEX-Datei und JavaScript

Das AAB enthält eine DEX-Datei, `base/dex/classes.dex`.
Ihre vollständige DEX-Zeichenfolgentabelle mit **38.950 Einträgen**
wurde anhand des DEX-Headers und der String-Offsets gelesen.
Für folgende, groß-/kleinschreibungsabhängig gesuchte Marker gab es
jeweils **null Treffer** in dieser Tabelle und im eingebetteten
Hermes-Bundle `base/assets/index.android.bundle`:

- `com/google/android/gms/ads`, `com.google.android.gms.ads`
- `AdvertisingIdClient`, `getAdvertisingIdInfo`
- `advertisingId`, `advertising_id`
- `com.google.android.gms.permission.AD_ID`
- `android.permission.ACCESS_ADSERVICES_AD_ID`
- `com/facebook/ads`, `com/applovin`, `com/unity3d/ads`
- `com/ironsource`, `com/vungle`, `com/inmobi`
- `com/appsflyer`, `com/adjust/sdk`
- `com/google/firebase/analytics`, `com/google/android/gms/measurement`

Als Gegenprobe hat `com/google/android/gms/location` acht Treffer in
der DEX-Zeichenfolgentabelle. Google-Standortdienste sind also vorhanden;
ihre bloße Anwesenheit belegt keine Werbe-ID-Nutzung.

Die druckbaren Zeichenfolgen der im AAB enthaltenen
`BUNDLE-METADATA/com.android.tools.build.libraries/dependencies.pb`
wurden ergänzend ohne Beachtung der Groß-/Kleinschreibung abgeglichen.
Keine Treffer für `play-services-ads`, `ads-identifier`, `ads-lite`,
`firebase-analytics`, `measurement`, `applovin`, `unity-ads`,
`ironsource`, `vungle`, `inmobi`, `appsflyer` oder `adjust`.
`play-services-location`, `play-services-base`,
`play-services-basement` und `play-services-tasks` sind vorhanden.
Enthaltene `com.facebook.react`-/Fresco-/Hermes-Bibliotheken sind nicht
mit dem Facebook-Werbe-SDK gleichzusetzen.

In der aktuellen `package.json`, `app.json` und den untersuchten
App-, Komponenten-, Service- und Hook-Quellen wurde ebenfalls kein
Werbe-ID-Aufruf oder Werbe-SDK gefunden. Dies ist nur ein zusätzlicher
Quellcodeabgleich; der aktuelle Quellcode ersetzt nicht die
Untersuchung des bereits gebauten AAB.

**Grenzen:** Markerabgleiche können umbenannten, verschleierten,
reflektierten oder rein nativen Zugriff übersehen. Es gab keinen
Laufzeitmitschnitt, keine vollständige Disassemblierung aller nativen
Bibliotheken und keinen Nachweis für andere aktive Play-Versionen.
Die fehlende AD_ID-Berechtigung allein wäre außerdem keine vollständige
Nutzungsaussage für ältere Android-Versionen. Die Empfehlung beruht auf
der Kombination aus fertigem Manifest, SDK-Markern, Metadaten und
Quellcodeabgleich, nicht allein auf dieser fehlenden Berechtigung.

## Vorbereitete Console-Antwort

Nach Bestätigung, dass die relevanten aktiven Play-Versionen diesem
geprüften Stand entsprechen:

> **Verwendet deine App eine Werbe-ID? – Nein.**
>
> Für CupCal `de.cup.calendar`, Version `1.0.0`, Versionscode `2`,
> wurde im geprüften Release-AAB keine Werbe-ID-Nutzung festgestellt.
> Das zusammengeführte Manifest enthält keine AD_ID-Berechtigung.
> Die geprüften App-Quellen, DEX-Marker und Abhängigkeitsmetadaten
> ergaben keinen Hinweis auf die untersuchten Werbe-SDKs oder
> Werbe-ID-Zugriffe.

Der Begründungstext ist für die Betreiberunterlagen vorbereitet; damit
wird kein entsprechendes Freitextfeld in der Console vorausgesetzt.
Keine Werbezwecke auswählen oder eine Nutzung erfinden, nur um eine
Warnung zu beseitigen. Die Erklärung „Enthält Werbung“ und die
Datensicherheitserklärung sind separate Angaben und werden hierdurch
nicht geändert.

Falls ein anderes aktives Artefakt AD_ID enthält oder tatsächlich auf
die Werbe-ID zugreift, die Antwort **nicht ungeprüft übernehmen**:
die konkrete Version und Abhängigkeit untersuchen und erst dann
über die zutreffende Erklärung oder eine separat freizugebende
Buildkorrektur entscheiden.

## Minimaler Nachweis zum Schließen des offenen Hinweises

1. Im richtigen Play-Eintrag `de.cup.calendar` die aktuell aktiven
   Produktions-, offenen, geschlossenen und internen Test-Tracks lesen.
   Track, Status, Version und Versionscode mit Prüfdatum festhalten;
   Entwurf, hochgeladenes Bundle und aktives Release nicht verwechseln.
2. Das tatsächlich verwendete Bundle im App-Bundle-Explorer zuordnen.
   Soweit die Original-AAB-Datei verfügbar ist, SHA-256 mit obigem Wert
   vergleichen. Alternativ nachvollziehbar anhand von Explorer-Angaben,
   Upload-/Buildzuordnung und Manifest belegen, welches AAB verwendet wird.
   Ein von Play erzeugtes/signiertes APK hat nicht den Hash des
   Original-AAB. Alle abweichenden aktiven Versionen gesondert prüfen.
3. Unter App-Inhalte die Werbe-ID-Erklärung und den genauen Warntext lesen.
   Bei bestätigter Übereinstimmung die vorbereitete Antwort „Nein“
   verwenden. Eine etwaige Speicherung nur im ausdrücklich freigegebenen
   Umfang durchführen; nichts veröffentlichen oder zur Prüfung senden.
4. Nach einer freigegebenen Speicherung die Seite neu laden und
   gespeicherte Antwort sowie Hinweisstatus erneut prüfen. Erst dieser
   Nachweis erlaubt die Aussage, dass der Console-Hinweis erledigt ist.

Bis dahin bleibt die **aktuelle Play-Zuordnung und der gespeicherte
Erklärungsstatus ein benannter Freigabeblocker**, nicht ein belegter
Werbe-ID-Verstoß. Für die Fortsetzung genügt ein lesender Console-Zugang
oder eine aktuelle Dokumentation der obigen Console-Ansichten und der
Bundle-Zuordnung; es wird kein Schlüssel im Chat benötigt.

## Quellen und Prüfgrenzen

- [Google Play: Werbe-ID](https://support.google.com/googleplay/android-developer/answer/6048248?hl=de),
  am Prüfdatum gelesen: AD_ID-Anforderung bei Ziel-Android 13 oder höher,
  auch durch zusammengeführte SDK-Manifeste.
- [Android: Manifest-Zusammenführung](https://developer.android.com/studio/build/manifest-merge)
- [Transportaudit desselben AAB](./RELEASE-V2-TRANSPORT-AUDIT-DE.md)
- `artifacts/cupcal-mobile/app.json`, `package.json`, `eas.json`

Es wurde ausschließlich lesend geprüft und diese Dokumentation ergänzt.
Kein neuer Build, keine Installation, keine Console-Speicherung, kein
Upload, keine Einreichung und keine Veröffentlichung wurden ausgelöst.
