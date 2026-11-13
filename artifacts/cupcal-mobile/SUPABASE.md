# Supabase-Konfiguration

CupCal initialisiert den gemeinsamen Supabase-Client nur, wenn beide Expo-Variablen gesetzt sind:

- `EXPO_PUBLIC_SUPABASE_URL` — Basis-Projekt-URL des Supabase-Projekts
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — öffentlicher Publishable Key

Die Projekt-URL muss auf die Supabase-Projektbasis zeigen, zum Beispiel
`https://<projekt-ref>.supabase.co`. Hänge weder `/rest/v1` noch
`/auth/v1` an; Supabase ergänzt die passenden API-Pfade selbst.

Die Variablen müssen beim Starten des Expo-Entwicklungsservers beziehungsweise beim Erstellen des Web-Bundles verfügbar sein. Falls keine `EXPO_PUBLIC_*`-Variablen gesetzt sind, übernimmt CupCal dafür `SUPABASE_URL` und `SUPABASE_ANON_KEY` aus der Replit-Umgebung. Nach einer Änderung muss der Entwicklungsserver neu gestartet oder das Bundle neu erstellt werden.

Beide Werte werden in den nativen und Web-Client eingebettet und sind öffentlich sichtbar. Verwende hier ausschließlich den Publishable Key, niemals einen Service-Role-Key. Ohne vollständige Konfiguration bleibt die App nutzbar; CupCal gibt eine verständliche Warnung in der Entwicklerkonsole aus. Der Status und die Meldung sind außerdem über `isSupabaseConfigured` und `supabaseConfigurationMessage` aus `services/supabase` verfügbar.

Der Client speichert Auth-Sitzungen über AsyncStorage, erneuert sie im Web automatisch und startet beziehungsweise pausiert die Erneuerung auf nativen Geräten passend zum App-Status.

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
Die Sitzung wird über AsyncStorage gespeichert und beim nächsten Start geladen.

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
Redirect URLs** folgende Muster frei:

```text
https://<aktuelle-vorschau-domain>/auth/confirm**
cupcal-android://auth/confirm**
```

Ersetze `<aktuelle-vorschau-domain>` durch die Domain der gerade verwendeten
Replit-Vorschau. Setze außerdem die **Site URL** auf eine HTTPS-Adresse der
Web-App, nicht auf `cupcal-android://...`. Wenn Supabase eine
Browser-Weiterleitung nicht zulässt, kann es stattdessen auf die Site URL
zurückfallen; die Löschkennzeichnung und das Bestätigungstoken fehlen dann.
Für reine Vorschautests kann die Site URL vorübergehend die aktuelle
Vorschau-Adresse sein. Die bestehende Bestätigungsroute wird auch für
Registrierungslinks verwendet.

Der Versand nutzt Supabases **Magic Link**-E-Mailvorlage unter
**Authentication → Email Templates → Magic Link or OTP**. Betreff und Text
müssen dort ausdrücklich die endgültige Kontolöschung nennen; die Vorlage muss
`{{ .ConfirmationURL }}` enthalten. CupCal verwendet diesen Anmeldeweg nicht
für normale Anmeldungen. Nach erfolgreicher Löschung entfernt Supabase auch
die an das Konto geknüpften Favoriten und Importhistorie; die öffentlichen
Turniertermine bleiben erhalten.

