# Supabase-Konfiguration

CupCal initialisiert den gemeinsamen Supabase-Client nur, wenn beide Expo-Variablen gesetzt sind:

- `EXPO_PUBLIC_SUPABASE_URL` — Basis-Projekt-URL des Supabase-Projekts
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — öffentlicher Publishable Key

Die Projekt-URL muss auf die Supabase-Projektbasis zeigen, zum Beispiel
`https://<projekt-ref>.supabase.co`. Hänge weder `/rest/v1` noch
`/auth/v1` an; Supabase ergänzt die passenden API-Pfade selbst.

Die Variablen müssen beim Starten des Expo-Entwicklungsservers beziehungsweise beim Erstellen des Web-Bundles verfügbar sein. Falls keine `EXPO_PUBLIC_*`-Variablen gesetzt sind, übernimmt CupCal dafür `SUPABASE_URL` und `SUPABASE_ANON_KEY` aus der Replit-Umgebung. Nach einer Änderung muss der Entwicklungsserver neu gestartet oder das Bundle neu erstellt werden.

Beide Werte werden in den nativen und Web-Client eingebettet und sind öffentlich sichtbar. Verwende hier ausschließlich den Publishable Key, niemals einen Service-Role-Key. Ohne vollständige Konfiguration bleibt die App nutzbar; CupCal gibt eine verständliche Warnung in der Entwicklerkonsole aus. Der Status und die Meldung sind außerdem über `isSupabaseConfigured` und `supabaseConfigurationMessage` aus `services/supabase` verfügbar.

Der Web-Client speichert Auth-Sitzungen über AsyncStorage. Auf iOS speichert
`expo-secure-store` die Supabase-Werte in der Keychain; auf Android verschlüsselt
es sie mit einem Schlüssel aus dem Android Keystore. Die iOS-Keychain-Einträge
sind auf das entsperrte Gerät beschränkt und werden nicht auf andere Geräte
migriert. Die automatische Token-Erneuerung bleibt aktiv.

Beim ersten Zugriff auf jeden Supabase-Sitzungsschlüssel wird ein vorhandener
AsyncStorage-Wert zuerst in den geschützten Speicher kopiert und erst danach
aus AsyncStorage entfernt. Scheitert das sichere Schreiben, bleibt der alte
Wert erhalten und der Fehler wird weitergegeben; die Sitzung wird nicht
still verworfen. Schlägt das Entfernen beim Abmelden fehl, meldet Supabase den
Speicherfehler, statt eine erfolgreiche Abmeldung vorzutäuschen. Der Adapter
gilt auch für PKCE-Verifier, damit native Auth-Rücksprünge weiterhin
funktionieren. Die Migration läuft beim Start nur bei Zugriff auf den jeweiligen
Schlüssel.

### Geräteprüfung: Sitzungsspeicher

Die automatisierten Tests verwenden einen persistenten Speicher-Dummy. Sie
prüfen die Adapterlogik für iOS und Android, aber nicht die native iOS-Keychain
oder den Android Keystore. Ein Simulator ist ebenfalls kein Nachweis für die
Speicherung auf echter Gerätehardware.

Auf einem echten iPhone und Android-Gerät jeweils mit einem nativen CupCal-Build
oder der Expo-Go-Vorschau prüfen:

1. Mit einem Testkonto anmelden und warten, bis der angemeldete Zustand sichtbar
   ist.
2. CupCal vollständig beenden (iOS: App im App-Umschalter schließen; Android:
   App-Info → **Beenden erzwingen**).
3. CupCal erneut starten und prüfen, dass das Konto weiter angemeldet ist.
4. In CupCal abmelden, die App erneut vollständig beenden und starten.
5. Prüfen, dass die App abgemeldet bleibt und geschützte Kontofunktionen eine
   neue Anmeldung verlangen.
6. Gerät, Betriebssystemversion, App-Version und verwendeten App-Modus
   (nativer Build oder Expo Go) sowie Abweichungen eintragen.

**Ergebnisstand: 16. November 2026 — laut Nutzerrückmeldung auf beiden
Plattformen bestanden.** Gerätemodelle, Betriebssystemversionen und App-Modus
(nativer Build oder Expo Go) wurden nicht mitgeteilt. Es wurden keine
Plattformabweichungen gemeldet. Die Tabelle hält diese fehlenden Angaben fest;
automatisierte Tests oder Simulatorläufe allein gelten weiterhin nicht als
Geräteergebnis.

| Plattform | Sitzung nach erzwungenem Beenden erhalten | Abmeldung nach Neustart wirksam | Gerät / Version / Abweichungen |
| --- | --- | --- | --- |
| iOS | Bestanden (laut Nutzerrückmeldung) | Bestanden (laut Nutzerrückmeldung) | Modell, Version und App-Modus nicht erfasst; keine Abweichung gemeldet |
| Android | Bestanden (laut Nutzerrückmeldung) | Bestanden (laut Nutzerrückmeldung) | Modell, Version und App-Modus nicht erfasst; keine Abweichung gemeldet |

### Gerätewechsel, Neuinstallation und Backup-Wiederherstellung

Der Sitzungsadapter ist für einen fehlenden nativen Schlüssel fail-closed:
Liefert SecureStore keinen Wert und existiert auch kein alter AsyncStorage-Wert,
lädt Supabase keine Sitzung. Ein neuer Gerätespeicher bleibt damit abgemeldet;
geschützte Kontofunktionen benötigen eine neue Anmeldung. Tests mit
Speicher-Doubles bestätigen diesen Ablauf für Android und iOS. Sie simulieren
keine System-Backups oder echten Geräte.

| Fall | Erwartetes Verhalten laut Plattformkonfiguration | Geräteprüfung |
| --- | --- | --- |
| iOS: App-Update oder Neustart auf demselben iPhone | Keychain-Sitzung bleibt normalerweise verfügbar | Nicht auf echter Hardware geprüft |
| iOS: Neuinstallation mit gleicher Bundle-ID auf demselben iPhone | Keychain-Daten können die Deinstallation überdauern; eine bestehende Sitzung kann deshalb wieder erscheinen. Das ist laut Expo nicht garantiert. | Nicht auf echter Hardware geprüft |
| iOS: Backup eines anderen iPhones auf neuem Gerät | `WHEN_UNLOCKED_THIS_DEVICE_ONLY` verhindert die Migration dieses Keychain-Eintrags; ohne anderen gespeicherten Wert startet CupCal abgemeldet. | Nicht auf echter Hardware geprüft |
| Android: App-Update oder Neustart auf demselben Gerät | SecureStore-Sitzung bleibt mit dem lokalen Keystore-Schlüssel verfügbar. | Nicht auf echter Hardware geprüft |
| Android: Neuinstallation oder Wiederherstellung auf einem anderen Gerät | Android entfernt den Keystore-Schlüssel bei Deinstallation; das SecureStore-Plugin nimmt seine SharedPreferences von Cloud-Backup und Geräteübertragung aus. Ohne Schlüssel startet CupCal abgemeldet. | Nicht auf echter Hardware geprüft |

Die Android-Backup-Ausschlüsse stammen aus der Standardkonfiguration des
`expo-secure-store`-Plugins (`configureAndroidBackup: true`); `app.json`
verwendet das Plugin ohne abweichende Optionen. iOS verwendet in
`services/supabase.ts` ausdrücklich `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
Die Supabase-Tests bestätigen zusätzlich: Wenn nach einer simulierten
Wiederherstellung der geschützte Gerätespeicher leer ist, gibt `getSession()`
keine Sitzung zurück und keinen Fehler aus.

**Noch offen:** In dieser Umgebung stehen keine iPhones oder Android-Geräte für
Backup-/Wiederherstellungsversuche zur Verfügung. Die Tabelle enthält daher
Plattformverhalten aus der Expo-/Apple-Dokumentation und automatisierte
Adaptertests, keine bestätigten Hardware-Ergebnisse. Vor einer Aussage, dass
die Fälle praktisch auf Geräten bestanden wurden, sind die Zeilen auf echten
Geräten zu testen. Besonders die iOS-Neuinstallation auf demselben Gerät ist
wegen der nicht garantierten Keychain-Aufbewahrung zu prüfen.

Dokumentation:

- [Expo SecureStore – Plattformverhalten und Android-Backups](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)
- [Apple – `WhenUnlockedThisDeviceOnly`](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)

## Benutzerprofile

Supabase Auth ist die Quelle für Konten, E-Mail-Adressen und Anmeldedaten. Diese
Konten stehen unter **Authentication → Users** beziehungsweise intern in
`auth.users`. CupCal verwendet zusätzlich `public.user_profiles` für optionale
Profilfelder und Rollenflags; Passwörter oder E-Mail-Adressen werden dort nicht
dupliziert.

Migration `0006_user_profiles.sql` legt ein Profil für neue Auth-Benutzer
automatisch an und trägt bereits vorhandene Auth-Benutzer nach. Führe die
Migration einmal im SQL Editor des richtigen Supabase-Projekts oder über den
autorisierten Migrationsweg aus. Sie zielt auf die SQL-Tabelle
`public.user_profiles`. Neue Profile enthalten die Auth-User-ID, einen
optionalen Anzeigenamen aus den Auth-Metadaten, sichere Standardwerte für
`is_admin` und `is_pro` sowie Zeitstempel.

Row-Level-Security erlaubt angemeldeten Benutzern nur das Lesen des eigenen
Profils. Die App kann daher keine fremden Profile auflisten und keine
Admin- oder Pro-Rechte selbst setzen. Das Supabase-Dashboard beziehungsweise
ein vertrauenswürdiger Server kann die Tabellenzeilen weiterhin verwalten.

## E-Mail-Bestätigung, Passwort-Wiederherstellung und Redirects

Im Browser verwendet CupCal die HTTPS-Adresse der gerade geöffneten App-Vorschau
mit dem Pfad `/auth/reset`. Diese vollständige Adresse muss in Supabase unter
**Authentication → URL Configuration → Redirect URLs** freigegeben sein. Für
native Builds bleibt zusätzlich `cupcal-android://auth/reset` als Redirect-URL
eingetragen. Die native URI funktioniert nicht als Ziel in einem normalen
Browser.

Für Registrierungs- und erneut angeforderte Bestätigungs-E-Mails muss außerdem
`cupcal-android://auth/confirm` als Redirect-URL freigegeben sein. CupCal
verwendet für die Bestätigung den PKCE-Ablauf: Supabase muss nach dem Klick
einen Code an diese Adresse zurückgeben, den CupCal gegen eine Sitzung tauscht.
Die Sitzung wird auf nativen Geräten geschützt gespeichert und beim nächsten
Start geladen. Vorhandene AsyncStorage-Sitzungen werden beim ersten Zugriff
übernommen; im Web bleibt AsyncStorage unverändert.

### Öffentliche Web-Kontolöschung

Der öffentliche Browserablauf fordert die Löschung auf der CupCal-Website an
und kehrt für die E-Mail-Bestätigung zu dieser Website-Route zurück:

```text
https://cupcal.af-software.app/konto-loeschen/bestaetigen/
```

Vor dem echten Versand muss ein Projektverantwortlicher genau diese HTTPS-URL
unter **Authentication → URL Configuration → Redirect URLs** freigeben. Die
Bestätigungsseite tauscht den Supabase-PKCE-Code im Browser gegen eine Sitzung
und ruft danach den bestehenden, sitzungs- und kontogebundenen Löschendpunkt
auf. Eine nicht freigegebene URL kann auf die Supabase-Site-URL zurückfallen;
das ist kein erfolgreicher Löschablauf. Die Redirect-Freigabe wurde im
Dashboard nicht überprüft oder geändert.

### Native App-Link

Die native App verwendet in `app.json` das URL-Schema `cupcal-android`. Der von
CupCal angeforderte Bestätigungsrücksprung lautet in einem installierten
Android- oder iOS-Build:

```text
cupcal-android://auth/confirm?flow=cupcal-email-confirmation
```

Der Passwort-Rücksprung lautet:

```text
cupcal-android://auth/reset?flow=cupcal-password-reset
```

Die Query-Parameter `code` und `flow_id` (oder bei älteren Token-Links
`access_token` und `refresh_token`) werden von Supabase an diesen Rücksprung
angehängt. Der
Wiederherstellungsbildschirm tauscht den Code gegen eine Sitzung und verarbeitet
sowohl den Kaltstart-Link als auch URL-Ereignisse bei bereits geöffneter App.

Vor dem Versand echter Auth-E-Mails müssen beide Basis-URIs in Supabase unter
**Authentication → URL Configuration → Redirect URLs** exakt zugelassen sein:

```text
cupcal-android://auth/confirm
cupcal-android://auth/reset
```

Die URI muss ohne Query-Parameter eingetragen werden. Prüfe vor einem
Gerätetest, dass der Eintrag in der Redirect-Allowlist des verwendeten
Supabase-Projekts gespeichert ist. Die Konfiguration im Repository bestätigt
nur das App-Schema und die Route; sie bestätigt nicht den Inhalt des
Supabase-Dashboards.

### Prüfung von `sb_flow_id`

**Ergebnis vom 16. November 2026:** Laut Rückmeldung steht im verwendeten
Supabase-Projekt bereits die Redirect-Regel
`cupcal-android://auth/confirm**`. Sie wurde deshalb nicht geändert.
Supabases Redirect-Dokumentation beschreibt `**` als Platzhalter für eine
beliebige Zeichenfolge. Die Regel lässt damit auch Query-Parameter wie
`flow=cupcal-email-confirmation` und `sb_flow_id=<Flow-ID>` am
Bestätigungsziel zu.

CupCal liest `sb_flow_id` (mit Rückwärtskompatibilität für `flow_id`) aus der
Bestätigungsroute und übergibt den Wert beim PKCE-Codeaustausch an Supabase.
Automatisierte Tests prüfen diese Übergabe. Der gemeldete Linktest wurde in
Expo Go angefordert und führte zur Site URL. Dieser Test bestätigt nicht, ob
Supabase das native CupCal-Schema akzeptiert: Expo dokumentiert, dass
`Linking.createURL` in Expo Go eine `exp://.../--/...`-Adresse erzeugt. Diese
Adresse wird von `cupcal-android://auth/confirm**` nicht abgedeckt; der
Site-URL-Fallback ist in diesem Modus daher zu erwarten.

Für den vollständigen Nachweis muss die Bestätigung aus einem installierten
nativen Entwicklungs- oder Release-Build angefordert werden. Dort verwendet
`Linking.createURL` das konfigurierte Schema `cupcal-android`. Falls auch dann
die Site URL erscheint, müssen der tatsächlich angeforderte Redirect und die
Bestätigungs-E-Mailvorlage geprüft werden. Laut Supabase enthält
`{{ .ConfirmationURL }}` den angeforderten `redirect_to`; ein festes
Site-URL-Ziel in der Vorlage kann den App-Rücksprung umgehen.

Quelle für das Redirect-Muster:
[Supabase Auth – Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

Quelle für App-Schemas und Expo Go:
[Expo Linking – `createURL`](https://docs.expo.dev/versions/v58.0.0/sdk/linking/)

### Geräte-Prüfung

Die Bestätigung benötigt installierte native Builds und ein echtes
Supabase-Testkonto mit Zugriff auf sein E-Mail-Postfach. Expo-Web oder Expo Go
allein bestätigen das App-Schema nicht. Der Redirect-Eintrag muss im
Supabase-Dashboard vor dem Test geprüft werden; die Repository-Konfiguration
beweist nicht, dass er im Projekt freigegeben ist.
Die Tabelle beschreibt erwartete Prüfschritte, keine bestätigten Ergebnisse
eines Tests auf physischen Geräten.

**Prüfversuch am 22. November 2026:** In der Arbeitsumgebung war kein
Android-Gerät über ADB oder den Expo-Gerätetunnel verbunden. Daher konnten
weder eine frische Bestätigungs-Mail aus dem installierten CupCal angefordert
noch Kaltstart, geöffnete App, natives Redirect-Ziel und PKCE-Sitzung auf einem
echten Gerät geprüft werden. Die automatisierten Tests bestätigen weiterhin
nur die Code-Verarbeitung; sie sind kein Nachweis für den Geräte-Rücksprung.

| Plattform | Zustand vor Link-Klick | Ergebnis |
| --- | --- | --- |
| Android | App vollständig beendet | Bestätigungslink öffnet CupCal; Code wird gegen eine Sitzung getauscht |
| Android | CupCal bereits geöffnet | Link navigiert zur Bestätigungsroute; Sitzung bleibt gespeichert |
| iOS | App vollständig beendet | Bestätigungslink öffnet CupCal; Code wird gegen eine Sitzung getauscht |
| iOS | CupCal bereits geöffnet | Link navigiert zur Bestätigungsroute; Sitzung bleibt gespeichert |
| Android und iOS | Link abgelaufen oder erneut verwendet | Deutsche Meldung fordert einen neuen Bestätigungslink an |

### Opt-in-Grenztest für Supabase-Passwörter

Der normale Testlauf überspringt den Live-Grenztest. Für einen isolierten Lauf
lege ein separates, bestätigtes Supabase-Konto an und setze in dessen
`user_metadata` den booleschen Wert `cupcal_disposable_password_test` auf `true`.
Das Konto darf nicht regulär verwendet werden. Hinterlege seine E-Mail und sein
aktuelles Passwort ausschließlich als geschützte Umgebungsvariablen:

- `CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL`
- `CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD`
- `SUPABASE_URL` (oder `EXPO_PUBLIC_SUPABASE_URL`)
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (oder `SUPABASE_ANON_KEY`)

Starte dann im Workspace:

```sh
pnpm --filter @workspace/cupcal-mobile run test:supabase-password-live
```

Der Test meldet sich mit dem öffentlichen Publishable-/Anon-Key am markierten
Wegwerf-Konto an, prüft die Passwortgrenzen und stellt anschließend das zuvor
gesetzte Passwort wieder her. Er akzeptiert keine Service-Role- oder Secret-
Keys, erstellt und löscht keine Konten und läuft nicht mit dem normalen
Testsammelbefehl.

### Passwortgrenze in einer echten Wiederherstellungssitzung

Für den separaten Recovery-Live-Test wird dasselbe ausschließlich dafür
vorgesehene und markierte Wegwerf-Konto verwendet. Fordere über CupCal einen
Passwortlink für dieses Konto an. Kopiere den noch nicht geöffneten Link aus
der E-Mail (oder die von Supabase zurückgeleitete CupCal-Adresse mit dem
Sitzungscode) und setze ihn ausschließlich als geschützte
Umgebungsvariable `CUPCAL_SUPABASE_PASSWORD_RECOVERY_TEST_LINK`. Setze außerdem
die oben genannten E-Mail-, Passwort- und öffentlichen Supabase-Variablen.

Starte den isolierten Test mit:

```sh
pnpm --filter @workspace/cupcal-mobile run test:supabase-password-recovery-live
```

Der Test tauscht den echten Recovery-Link gegen eine Supabase-Sitzung,
verifiziert, dass sie zum markierten Wegwerf-Konto gehört, weist fünf Zeichen
zurück und setzt anschließend genau sechs Zeichen. Im `finally`-Aufräumpfad
stellt er das Ausgangspasswort wieder her. Ein verbrauchter, abgelaufener oder
zu einem anderen Konto gehörender Link schlägt fehl; reguläre Konten werden
nicht verändert.

Für die kontobasierte Merkliste müssen die Migrationen `0002`, `0003` und
`0004` in dieser Reihenfolge aus `artifacts/api-server/supabase/migrations/`
auf dem Supabase-Projekt ausgeführt werden. Sie richten die Favoritentabelle
und Zugriffsregeln ein,
stellen konfliktgeprüfte Schreibvorgänge sicher und aktivieren Realtime für
Änderungen auf weiteren Geräten. Ohne diese Migrationen bleiben Favoriten lokal
gespeichert; CupCal zeigt den ausstehenden Abgleich an.
## Konto löschen

In den Kontoeinstellungen kann ein angemeldeter Benutzer zunächst den Versand
eines Bestätigungslinks anfordern. Erst nach dem Öffnen des Links und der
Bestätigung der E-Mail-Sitzung löscht der API-Server das Konto über Supabase
Auth. Der Link ist 30 Minuten gültig. Der Server signiert ihn mit dem
serverseitigen `SUPABASE_SERVICE_ROLE_KEY`; dieser Schlüssel darf niemals in
die Expo-App eingebettet werden.

Die Kontolöschungs-Weiterleitung enthält zusätzlich `flow` und ein
Bestätigungstoken als Query-Parameter. Deshalb reicht es nicht, nur die
Basisadresse einzutragen. Gib in **Authentication → URL Configuration →
Redirect URLs** beide Ziele frei. Die Browser-Adresse muss zur gerade
verwendeten CupCal-Expo-Vorschau gehören; trage deren HTTPS-Host und den
Bestätigungspfad ein. Das Suffix `**` lässt die von CupCal angehängten
Löschparameter zu:

```text
https://<aktuelle-vorschau-domain>/auth/confirm**
cupcal-android://auth/confirm**
```

Ersetze `<aktuelle-vorschau-domain>` durch den Host der gerade geöffneten
Replit-Vorschau. Der native Eintrag muss mit `cupcal-android://auth/confirm`
beginnen; das Schema `cupcal-android` ist in `app.json` registriert. Setze
außerdem die **Site URL** auf eine HTTPS-Adresse der Web-App, nicht auf
`cupcal-android://...`. Falls Supabase das jeweilige Redirect-Ziel nicht
zulässt, kann es auf die Site URL zurückfallen; dann fehlen die
Löschkennzeichnung und das Bestätigungstoken und der Link kann das Konto nicht
löschen. Für reine Vorschautests kann die Site URL vorübergehend die aktuelle
Vorschau-Adresse sein. Die Bestätigungsroute wird auch für Registrierungslinks
verwendet.

Der Versand nutzt Supabases **Magic Link**-E-Mailvorlage unter
**Authentication → Email Templates → Magic Link or OTP**. Wenn diese Vorlage
editierbar ist, passe dort Betreff
und Nachricht an, damit die Mail nicht wie eine normale Anmeldung klingt. Zum
Beispiel:

**Betreff**

```text
Bestätige die endgültige Löschung deines CupCal-Kontos
```

**Nachricht (HTML)**

```html
<p>Du hast beantragt, dein CupCal-Konto endgültig zu löschen.</p>
<p>Wenn du fortfährst, werden dein Konto und die damit verbundenen Daten
unwiderruflich gelöscht. Klicke auf den folgenden Link, um die Löschung
endgültig auszuführen:</p>
<p><a href="{{ .ConfirmationURL }}">CupCal-Konto endgültig löschen</a></p>
<p>Wenn du diese Löschung nicht angefordert hast, ignoriere diese E-Mail.
Dein Konto wird dann nicht gelöscht.</p>
```

Der Link muss `{{ .ConfirmationURL }}` verwenden, damit Supabase den von CupCal
angeforderten Redirect nutzt. Die Löschung wird erst durch Öffnen des Links und
die serverseitige Bestätigung ausgeführt. CupCal verwendet diesen Anmeldeweg
nicht für normale Anmeldungen. Nach erfolgreicher Löschung entfernt Supabase
auch die an das Konto geknüpften Favoriten und Importhistorie; die öffentlichen
Turniertermine bleiben erhalten.

### Wenn die Magic-Link-Vorlage gesperrt ist

Ein App-Parameter kann eine Vorlage mit einem fest eingebauten Ziel nicht
überschreiben. Die tatsächliche Projektrolle und der Inhalt der laufenden
Vorlage sind aus diesem Repository nicht überprüfbar. Supabase dokumentiert,
dass Developer- und Read-Only-Rollen keine Projekteinstellungen ändern dürfen;
ein Owner oder Administrator muss die Berechtigung und Vorlage prüfen.

Als unterstützter Ersatz kann ein berechtigter Projektverantwortlicher einen
**Send Email Auth Hook** aktivieren. Dieser ersetzt den eingebauten Versand und
erhält `email_data.token_hash`, `email_action_type` und `redirect_to`. Ein
signaturgeprüfter Hook kann damit denselben Supabase-Verifizierungslink samt
vollständigem CupCal-Rücksprung versenden, ohne die gesperrte Vorlage zu
verwenden. Ein eigener SMTP-Server allein ersetzt dagegen nicht die Vorlage.
Der Hook und ein freigegebener Mailanbieter müssen tatsächlich eingerichtet
sein; CupCal aktiviert sie nicht automatisch.

Die Voraussetzungen, der sichere Linkaufbau und die ausdrücklich **nicht
bestandenen echten Browser-/Android-Tests** stehen in
[`KONTOLOESCHUNG-PRUEFUNG.md`](./KONTOLOESCHUNG-PRUEFUNG.md).

