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

## Passwort-Wiederherstellung und Redirects

Im Browser verwendet CupCal die HTTPS-Adresse der gerade geöffneten App-Vorschau
mit dem Pfad `/auth/reset`. Diese vollständige Adresse muss in Supabase unter
**Authentication → URL Configuration → Redirect URLs** freigegeben sein. Für
native Builds bleibt zusätzlich `cupcal-android://auth/reset` als Redirect-URL
eingetragen. Die native URI funktioniert nicht als Ziel in einem normalen
Browser.

### Native App-Link

Die native App verwendet in `app.json` das URL-Schema `cupcal-android`. Der von
CupCal angeforderte Rücksprung lautet in einem installierten Android- oder
iOS-Build:

```text
cupcal-android://auth/reset?flow=cupcal-password-reset
```

Die Query-Parameter `code` (oder bei älteren Token-Links `access_token` und
`refresh_token`) werden von Supabase an diesen Rücksprung angehängt. Der
Wiederherstellungsbildschirm tauscht den Code gegen eine Sitzung und verarbeitet
sowohl den Kaltstart-Link als auch URL-Ereignisse bei bereits geöffneter App.

Vor dem Versand echter Wiederherstellungs-E-Mails muss die Basis-URI in
Supabase unter **Authentication → URL Configuration → Redirect URLs** exakt
zugelassen sein:

```text
cupcal-android://auth/reset
```

Die URI muss ohne Query-Parameter eingetragen werden. Prüfe vor einem
Gerätetest, dass der Eintrag in der Redirect-Allowlist des verwendeten
Supabase-Projekts gespeichert ist. Die Konfiguration im Repository bestätigt
nur das App-Schema und die Route; sie bestätigt nicht den Inhalt des
Supabase-Dashboards.

## Konto löschen

In den Kontoeinstellungen kann ein angemeldeter Benutzer zunächst den Versand
eines Bestätigungslinks anfordern. Erst nach dem Öffnen des Links und der
Bestätigung der E-Mail-Sitzung löscht der API-Server das Konto über Supabase
Auth. Der Link ist 30 Minuten gültig. Der Server signiert ihn mit dem
serverseitigen `SUPABASE_SERVICE_ROLE_KEY`; dieser Schlüssel darf niemals in
die Expo-App eingebettet werden.

Für Browser-Vorschauen muss die aktuell verwendete HTTPS-Adresse der App mit
`/auth/confirm` in **Authentication → URL Configuration → Redirect URLs**
freigegeben sein. Für installierte Apps muss zusätzlich
`cupcal-android://auth/confirm` erlaubt sein. Die bestehende Bestätigungsroute
wird auch für Registrierungslinks verwendet.

Der Versand nutzt Supabases **Magic Link**-E-Mailvorlage. Da CupCal diesen
Anmeldeweg nicht anderweitig verwendet, sollte deren Betreff und Text klar
sagen, dass der Link die endgültige Kontolöschung bestätigt. Die Vorlage muss
den Supabase-Bestätigungslink enthalten. Nach erfolgreicher Löschung entfernt
Supabase auch die an das Konto geknüpften Favoriten und Importhistorie; die
öffentlichen Turniertermine bleiben erhalten.

### Geräte-Prüfung

Die Bestätigung benötigt installierte native Builds und ein echtes
Supabase-Wiederherstellungs-E-Mail-Konto. Expo-Web oder Expo Go allein
bestätigen das App-Schema nicht.

| Plattform | Zustand vor Link-Klick | Ergebnis |
| --- | --- | --- |
| Android | App vollständig beendet | E-Mail-Link öffnet CupCal; Token wird angenommen |
| Android | CupCal bereits geöffnet | Link wechselt zur Wiederherstellung; Token wird angenommen |
| iOS | App vollständig beendet | E-Mail-Link öffnet CupCal; Token wird angenommen |
| iOS | CupCal bereits geöffnet | Link wechselt zur Wiederherstellung; Token wird angenommen |

Für die kontobasierte Merkliste müssen die Migrationen `0002`, `0003` und
`0004` in dieser Reihenfolge aus `artifacts/api-server/supabase/migrations/`
auf dem Supabase-Projekt ausgeführt werden. Sie richten die Favoritentabelle
und Zugriffsregeln ein,
stellen konfliktgeprüfte Schreibvorgänge sicher und aktivieren Realtime für
Änderungen auf weiteren Geräten. Ohne diese Migrationen bleiben Favoriten lokal
gespeichert; CupCal zeigt den ausstehenden Abgleich an.
