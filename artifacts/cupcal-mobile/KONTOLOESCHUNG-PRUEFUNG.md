# Kontolöschung bei gesperrter Supabase-Mailvorlage

## Ergebnis und Grenze dieser Prüfung

App und öffentliche Website fordern den Löschlink mit `emailRedirectTo` an. Er
enthält die jeweilige Bestätigungsroute, `flow=cupcal-account-deletion` und
einen serverseitig signierten, 30 Minuten gültigen Löschcode. Die App oder
Website ruft die Lösch-API erst nach einem erfolgreichen Supabase-Codeaustausch
beziehungsweise einer vollständigen bestätigten E-Mail-Sitzung auf. Die API
prüft die Sitzung serverseitig mit Supabase, Signatur, Ablaufzeit und
Kontozuordnung.

**Ein echter E-Mail-Rücksprung in Browser und installierter Android-App ist
nicht bestanden.** Es wurden keine echten E-Mails versendet und keine Konten
gelöscht. Es stehen weder eine authentifizierte Supabase-Verwaltungssitzung
noch ein freigegebenes entbehrliches Postfach/Testkonto oder ein bedienbares
Android-Gerät mit installiertem CupCal-Build zur Verfügung.

Die vom Nutzer gemeldete schreibgeschützte Magic-Link-Vorlage ist als
Projektvoraussetzung bekannt. Ihre konkrete Sperrursache und der tatsächlich
gespeicherte HTML-Inhalt lassen sich mit den App-/Datenzugängen im Repository
nicht feststellen. Insbesondere wird nicht behauptet, dass ein bestimmtes
Supabase-Rollenprofil als Ursache nachgewiesen wurde.

## Berechtigung für die Vorlage

Supabase unterscheidet das Lesen und Ändern von E-Mailvorlagen und
Auth-Einstellungen. Laut offizieller Rollenbeschreibung können **Developer**
keine Projekteinstellungen ändern; **Read-Only** ist ebenfalls nicht
schreibberechtigt. Ein **Owner** oder **Administrator** muss im verwendeten
Projekt prüfen:

1. Welche Projektrolle die betroffene Dashboard-Sitzung besitzt.
2. Ob **Email Templates → Update** erlaubt ist.
3. Ob der Magic-Link-Link `{{ .ConfirmationURL }}` verwendet oder ein festes
   Ziel wie `{{ .SiteURL }}` enthält.

`{{ .ConfirmationURL }}` enthält bereits Supabases Verifizierungsadresse mit
dem angeforderten Rücksprung. Für selbst gebaute Vorlagen dokumentiert
Supabase außerdem `{{ .RedirectTo }}` statt eines festen `{{ .SiteURL }}`.
Ein im App-Code gesetztes `emailRedirectTo` ersetzt jedoch keinen fest
codierten Link in einer nicht änderbaren Vorlage.

Es wurde keine Auth-Konfiguration geändert. Ein Service-Role-Key im
Anwendungsserver ersetzt keine Freigabe zur Änderung der Dashboard- oder
Management-Konfiguration.

## Unterstützter Ersatz: Send Email Auth Hook

Wenn die Vorlage absichtlich unveränderbar bleiben muss, ist Supabases
**Send Email Hook** der unterstützte alternative Versandweg. Er ersetzt den
eingebauten E-Mailversand und benutzt die Dashboard-Vorlage nicht.

Die Einrichtung benötigt:

- einen berechtigten Projektverantwortlichen zum Aktivieren und Konfigurieren
  des Hooks;
- einen freigegebenen E-Mail-Anbieter und gegebenenfalls eine verifizierte
  Absenderdomain;
- einen vertrauenswürdigen Hook-Endpunkt oder eine Edge Function, die die
  Supabase-Webhook-Signatur prüft.

Der Hook erhält unter anderem `user`, `email_data.token_hash`,
`email_data.email_action_type` und `email_data.redirect_to`. Für die
CupCal-Löschanfrage mit Typ `magiclink` muss er einen HTTPS-Link zu Supabase
versenden, dessen Struktur so aussieht:

```text
https://<projekt-ref>.supabase.co/auth/v1/verify?token=<token_hash>&type=magiclink&redirect_to=<URL-kodierter-CupCal-Ruecksprung>
```

Dabei wird der vollständige angeforderte Rücksprung unverändert übernommen:

```text
Browser: https://<CupCal-Expo-Host>/auth/confirm?flow=cupcal-account-deletion&deletion_token=<signierter-Code>
Android: cupcal-android://auth/confirm?flow=cupcal-account-deletion&deletion_token=<signierter-Code>
```

Für den externen Website-Löschweg lautet der bestätigte Rücksprung:

```text
https://cupcal.af-software.app/konto-loeschen/bestaetigen/?flow=cupcal-account-deletion&deletion_token=<signierter-Code>
```

Diese HTTPS-URL muss vor dem Versand in der Supabase-Redirect-Allowlist
freigegeben sein. Der Eintrag wurde im Dashboard nicht überprüft oder
geändert. Die Website-Route ist vorab gerendert und nicht indexierbar.

Der Supabase-HTTPS-Link bleibt der Link in der E-Mail; erst Supabase führt
nach der einmaligen Auth-Prüfung zum Browserziel oder registrierten
Android-Schema. Der Hook darf weder selbst ein Konto löschen noch einen
Löschcode aus einer beliebigen eingehenden Anfrage erzeugen. Er darf Tokens
und vollständige Links nicht protokollieren. Ein erfolgreicher Hook-Aufruf
darf erst nach Annahme der Nachricht durch den Anbieter bestätigt werden.
Andere Auth-E-Mailtypen müssen weiterhin korrekt versendet werden, weil der
Hook den gesamten eingebauten Auth-Mailversand ersetzt.

**Ein eigener SMTP-Server allein ist kein Vorlagen-Workaround.** Er ändert
den Transport, nicht automatisch den in einer Vorlage festgelegten Link.
Auch ein Send Email Hook ist keine App-seitig aktivierbare Umgehung einer
fehlenden Supabase-Berechtigung.

## Implementierter IONOS-Hook-Endpunkt

Nach ausdrücklicher Freigabe und Auswahl von IONOS Maildiensten wurde im
API-Server ein Supabase Send Email Hook-Endpunkt ergänzt. Er prüft die
Standard-Webhooks-Signatur über den unveränderten Request-Body und sendet
E-Mails über `smtp.ionos.de` mit SSL/TLS auf Port 465. Der vollständige Wert
aus `email_data.redirect_to` wird als einzelner URL-Parameter an den
Supabase-HTTPS-Verifizierungslink übergeben; Browser- und
`cupcal-android://`-Rücksprünge bleiben dabei erhalten. Tokens und
SMTP-Fehlerdetails werden nicht protokolliert.

Der Hook verarbeitet die dokumentierten Verifizierungsarten, Einladungen,
Passwort-Wiederherstellungen, E-Mailänderungen (einschließlich beider
Bestätigungen bei sicherem E-Mailwechsel) sowie die dokumentierten
Sicherheitsbenachrichtigungen ohne Verifizierungstoken.

**Noch nicht aktiviert:** Die Supabase-Auth-Einstellung wurde nicht geändert.
Im Workspace ist keine Supabase-Verwaltungsintegration verfügbar; die
vorhandenen App-Zugangsdaten bieten keinen bestätigten Zugriff auf die
Dashboard-Hook-Konfiguration. Für diesen Workspace liegt außerdem keine
veröffentlichte HTTPS-URL vor, die Supabase als externen Hook erreichen
könnte. Vor echtem Versand müssen IONOS-Mailboxdaten und das von Supabase
erzeugte Hook-Geheimnis sicher in den Replit-Secrets hinterlegt sowie die
öffentliche HTTPS-URL des bereitgestellten API-Servers im Supabase-Dashboard
eingetragen werden. Eine App-Veröffentlichung oder
Auth-Konfigurationsänderung wurde nicht vorgenommen.

## Sicherheitsprüfungen ohne echte Kontolöschung

Die lokalen Tests prüfen:

- Browser- und native Rücksprünge behalten Löschkennung und signierten Code.
- `sb_flow_id` und das ältere `flow_id` werden dem PKCE-Codeaustausch
  zugeordnet, sofern Supabase sie liefert.
- Abgelaufene oder bereits verwendete Auth-Codes führen zu keiner
  Löschanfrage; eine bestehende Sitzung wird nicht als Ersatz verwendet.
- Eine Löschkennung ohne E-Mail-Auth-Nachweis und ein Link ohne signierten
  Löschcode führen zu keiner Löschanfrage.
- Der serverseitige Tokencheck weist falsche Signaturen, abgelaufene Codes
  und die Zuordnung zu einem anderen angemeldeten Konto zurück.

Die Einmaligkeit des E-Mail-Auth-Codes wird von Supabase erzwungen. Der
separate signierte CupCal-Löschcode besitzt keine eigene persistente
Verbrauchsliste; die lokalen Tests behaupten daher keinen zusätzlichen
serverübergreifenden Einmalverbrauch dieses isolierten Codes.

Es gibt bewusst keinen Fallback, der einen normalen Login allein aufgrund
eines lokal gespeicherten Löschwunschs in eine Kontolöschung umdeutet.

## Noch auszuführende echte Plattformprüfung

Nach freigegebener Konfiguration sind getrennte, entbehrliche Testkonten mit
zugänglichen Postfächern und ein installierter Android-Build nötig. Die
folgenden Ergebnisse sind **offen, nicht bestanden**:

| Prüfung | Status |
| --- | --- |
| Frische E-Mail öffnet die CupCal-Bestätigung in der Browser-Vorschau | Nicht ausgeführt |
| Frische E-Mail öffnet die Bestätigung in installierter Android-App, kalt und bereits geöffnet | Nicht ausgeführt |
| Gültiger Link löscht ausschließlich das zugehörige entbehrliche Testkonto | Nicht ausgeführt |
| Derselbe echte E-Mail-Link wird nach erster Verwendung abgewiesen | Nicht ausgeführt |
| Abgelaufener echter Link löscht kein Konto | Nicht ausgeführt |
| Link und angemeldetes Konto passen nicht zusammen; kein Konto wird gelöscht | Nicht ausgeführt |

Bei der Diagnose dürfen nur Zielhost, Pfad, Parameternamen, HTTP-Status und
bereinigte Fehlercodes festgehalten werden. Keine vollständigen Links,
Auth-Codes, Token oder Kontodaten in Testberichten speichern. Ein äußerer
Gmail-/Google-Linkwrapper beweist für sich allein nicht, welches Ziel
Supabase anschließend verwendet.

## Offizielle Quellen

- [Supabase: Rollen und Zugriffssteuerung](https://supabase.com/docs/guides/platform/access-control)
- [Supabase: E-Mailvorlagen und Variablen](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase: Redirects und E-Mailvorlagen](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Supabase: Eigener SMTP-Server](https://supabase.com/docs/guides/auth/auth-smtp)
