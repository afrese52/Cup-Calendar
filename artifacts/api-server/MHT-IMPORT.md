# MHT-Terminimport

In der CupCal-App gibt es unter **Info → Turniertermine importieren** eine
geschützte Upload-Maske für gespeicherte Fortnite-Spielpläne (`.mht` oder
`.mhtml`). Die Datei wird zuerst geprüft; erst nach einer ausdrücklichen
Bestätigung werden eindeutig zugeordnete zukünftige Termine in
`public.fortnite_events` geschrieben.

Der Import ist auf Konten beschränkt, deren E-Mail-Adresse in der
serverseitigen Umgebungsvariable `CUPCAL_IMPORT_ADMIN_EMAILS` steht. Mehrere
Adressen werden durch Kommas getrennt. Ohne diese Freigabeliste bleibt der
Import gesperrt. Der Supabase-Service-Schlüssel wird ausschließlich auf dem
API-Server verwendet und nie an die App übertragen.

Vergangene Termine und Datensätze mit einer unklaren Spielformat-Zuordnung
werden in der Vorschau markiert und nicht gespeichert. Bestehende Termine mit
derselben Epic-Kennung werden aktualisiert; persönliche Admin-Notizen und
manuelle Hervorhebungen bleiben dabei unverändert. Neue Dateien sind weiterhin
Momentaufnahmen, keine Live-Verbindung zu Epic.

Der lokale Trockenlauf bleibt verfügbar. Er prüft die Erkennung, ohne Supabase
zu verbinden oder Daten zu schreiben:

```sh
pnpm --filter @workspace/api-server run dry-run:mht -- \
  --file "../../attached_assets/Zeitplan_bevorstehender_Events_–_Fortnite-Wettkampf_(2)_1794302592377.mht" \
  --timezone Europe/Berlin
```

`--region EU` kann die Region aus der Quell-URL überschreiben. `--json` gibt alle
validierten Datensätze als JSON aus. Die Zeitzone ist standardmäßig
`Europe/Berlin`, weil die Datei nur die lokal dargestellten Uhrzeiten enthält.

Tests:

```sh
pnpm --filter @workspace/api-server run test:mht-import
pnpm --filter @workspace/api-server run test:admin-import
```
