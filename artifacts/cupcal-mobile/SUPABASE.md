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

### Geräte-Prüfung

Die Bestätigung benötigt installierte native Builds und ein echtes
Supabase-Testkonto mit Zugriff auf sein E-Mail-Postfach. Expo-Web oder Expo Go
allein bestätigen das App-Schema nicht. Der Redirect-Eintrag muss im
Supabase-Dashboard vor dem Test geprüft werden; die Repository-Konfiguration
beweist nicht, dass er im Projekt freigegeben ist.
Die Tabelle beschreibt erwartete Prüfschritte, keine bestätigten Ergebnisse
eines Tests auf physischen Geräten.

| Plattform | Zustand vor Link-Klick | Ergebnis |
| --- | --- | --- |
| Android | App vollständig beendet | Bestätigungslink öffnet CupCal; Code wird gegen eine Sitzung getauscht |
| Android | CupCal bereits geöffnet | Link navigiert zur Bestätigungsroute; Sitzung bleibt gespeichert |
| iOS | App vollständig beendet | Bestätigungslink öffnet CupCal; Code wird gegen eine Sitzung getauscht |
| iOS | CupCal bereits geöffnet | Link navigiert zur Bestätigungsroute; Sitzung bleibt gespeichert |
| Android und iOS | Link abgelaufen oder erneut verwendet | Deutsche Meldung fordert einen neuen Bestätigungslink an |

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

