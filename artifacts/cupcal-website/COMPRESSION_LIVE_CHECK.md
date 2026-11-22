# Live-Prüfung der HTTP-Komprimierung

Stand: 22. November 2026

## Ergebnis

Die sechs Anfragen an die veröffentlichte CupCal-Hauptdomain
`https://cupcal.af-software.app/` lieferten die erwarteten Statuscodes und
`Content-Encoding`-Werte. Jede Antwort enthielt `Vary: Accept-Encoding`.
Brotli- und Gzip-Antworten ließen sich mit den jeweiligen Standard-Decodern
entpacken und enthielten die vollständige HTML-Seite.

| Anfrage | Status | Content-Encoding | Vary | Übertragene → decodierte Bytes |
| --- | ---: | --- | --- | ---: |
| `Accept-Encoding` fehlt | 200 | nicht gesetzt | `Accept-Encoding` | 22 030 → 22 030 |
| `br` | 200 | `br` | `Accept-Encoding` | 4 776 → 21 912 |
| `gzip` | 200 | `gzip` | `Accept-Encoding` | 5 081 → 21 912 |
| `gzip;q=0, br;q=1` | 200 | `br` | `Accept-Encoding` | 4 776 → 21 912 |
| `br;q=0, gzip;q=0, identity;q=1` | 200 | nicht gesetzt | `Accept-Encoding` | 22 030 → 22 030 |
| `identity;q=0, br;q=0, gzip;q=0` | 406 | nicht gesetzt | `Accept-Encoding` | 14 → 14 |

Die Replit-Domain `https://cup-cal-calendar-for-fn.replit.app/` lieferte dieselben
Status-, Kodierungs- und `Vary`-Ergebnisse für alle sechs Fälle. Ihre Antwort
ohne `Accept-Encoding` hatte 21 912 Bytes.

## Unterschied zum lokalen Produktionsserver

Der lokale Produktionsserver wurde mit dem vorhandenen `dist/public`-Build
geprüft. Er stimmte bei Status, Kodierung und `Vary` in allen sechs Fällen mit
der Live-Domain überein. Die sechs dekomprimierten lokalen HTML-Antworten hatten
jeweils 22 339 Bytes; die Live-Domain lieferte für Brotli und Gzip jeweils
21 912 Bytes.

Bei unkomprimierten Antworten fügte die vorgeschaltete Google-Frontend-Schicht
teilweise zusätzlich das Replit-Analytics-Skript
`https://i.replit.com/script.js` ein. Auf der Hauptdomain erschien es sowohl
ohne `Accept-Encoding` als auch bei ausdrücklich erlaubter `identity`-Kodierung.
Auf der Replit-Domain fehlte es bei fehlendem Header, war aber bei ausdrücklich
erlaubter `identity`-Kodierung vorhanden. Diese Antworten hatten dadurch 22 030
statt 21 912 Bytes und waren nicht bytegleich mit den dekomprimierten
Brotli-/Gzip-Antworten. Das beeinflusste weder `Content-Encoding` noch das
erfolgreiche Decodieren. Die unterschiedlichen lokalen und veröffentlichten
HTML-Größen zeigen außerdem, dass die getesteten Live-Dateien nicht bytegleich
mit dem lokalen Build waren.

Die bestehenden lokalen Servertests liefen ebenfalls erfolgreich:
`pnpm --filter @workspace/cupcal-website run test:serve` (4 Tests bestanden).

## Wiederholen

Der Rohdaten-Check entfernt Komprimierung nicht automatisch und bricht bei
falschem Status, falschem `Content-Encoding`, fehlendem `Vary` oder nicht
decodierbarem HTML ab:

```sh
pnpm --filter @workspace/cupcal-website run test:compression:live
```

Eine andere Domain kann als erstes Argument angegeben werden:

```sh
pnpm --filter @workspace/cupcal-website run test:compression:live -- https://cup-cal-calendar-for-fn.replit.app
```
