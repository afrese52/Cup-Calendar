# CupCal: INP aus echten Nutzungsdaten

## Prüfergebnis vom 22. November 2026

Für die Startseite `https://cupcal.af-software.app/` ist derzeit kein INP-Wert aus
echten Nutzungsdaten verfügbar. PageSpeed Insights meldete für die CrUX-Felddaten
„does not have sufficient real-world speed data“ / „No Data“. Das Ergebnis war
bei einer Abfrage mit `PHONE` und einer Abfrage mit `DESKTOP` gleich.

| Merkmal | Ergebnis |
| --- | --- |
| Geprüfte Seite | `https://cupcal.af-software.app/` |
| Datenquelle | PageSpeed Insights, Chrome User Experience Report (CrUX) |
| PSI-Bericht erstellt | 21. November 2026, ca. 19:02 Uhr |
| Erfasster Zeitraum | Vorangegangener, rollierender 28-Tage-Zeitraum; PSI zeigt in der Meldung ohne Felddaten keine genauen Grenzen |
| Geräteklassen | PHONE und DESKTOP |
| Datenumfang | Für die Seite nicht ausreichend; PSI zeigt keine Zahl der erfassten Besuche oder Stichproben |
| INP-Feldwert | **Nicht verfügbar** |

Die fehlende CrUX-Abdeckung ist kein INP-Wert von null und erlaubt keine
Aussage über die tatsächliche Interaktionslatenz. Ein Lighthouse-Laborwert darf
daher nicht als INP ausgegeben werden. Google erklärt, dass CrUX eine
ausreichende Zahl unterschiedlicher, repräsentativer und anonymisierter
Nutzungsbeispiele benötigt.

## Abfragehinweise

- Die PageSpeed-Insights-Weboberfläche konnte den Bericht am 21. November
  erfolgreich anzeigen und lieferte die obige CrUX-Meldung.
- Die frühere PageSpeed-API-Abfrage wurde laut Aufgabenverlauf am
  19. November 2026 mit HTTP 429 wegen des erschöpften Tageskontingents
  abgewiesen. Dieser Fehler ist keine Messung.
- Ein zusätzlicher direkter CrUX-API-Aufruf ohne API-Schlüssel wurde mit
  HTTP 403 abgewiesen. Auch dieser Fehler ist keine Messung und wird nicht als
  Beleg für fehlende CrUX-Daten gewertet.

Quellen:

- [PageSpeed Insights-Bericht für CupCal](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fcupcal.af-software.app%2F)
- [Google: Warum CrUX-Felddaten nicht verfügbar sein können](https://developers.google.com/speed/docs/insights/v5/about#why-is-the-real-user-crux-data-not-available-for-a-url-or-origin)
- [Google: CrUX-Datenquellen und Zeiträume](https://developer.chrome.com/docs/crux/methodology/tools)
