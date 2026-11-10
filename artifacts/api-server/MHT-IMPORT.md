# MHT-Terminimport im Trockenlauf

Der Importer liest einen gespeicherten Fortnite-Wettkampf-Zeitplan (`.mht`) und
prüft die erkannten Turnierkarten. Er nimmt **keine Verbindung zu Supabase auf**
und schreibt keine Daten.

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
```

Die Datei ist eine Momentaufnahme der Webseite. Der Trockenlauf ist daher für
Importprüfung und Datenmapping gedacht, nicht für automatische Aktualisierungen.
