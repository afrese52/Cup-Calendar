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

## Mobiler Labortest aller Website-Seiten

Prüfung vom 22. November 2026 mit dem lokalen Produktionsbuild: Chromium im
390 × 844 Pixel großen Mobil-Viewport, 4-fache CPU-Drosselung, simuliertes 4G
mit 150 ms Latenz und ausgeschaltetem Cache. Je Seite wurden drei kalte
Seitenaufrufe ausgeführt; die Tabelle zeigt die Medianwerte.

| Seite | LCP vorher | LCP nachher | Laden vorher | Laden nachher | Höchster CLS nachher |
| --- | ---: | ---: | ---: | ---: | ---: |
| Startseite `/` | 800 ms | 844 ms | 1.688 ms | 1.494 ms | 0,036 |
| Kalender-App | 648 ms | 652 ms | 1.499 ms | 1.319 ms | 0,055 |
| Termine organisieren | 644 ms | 656 ms | 1.490 ms | 1.316 ms | 0,043 |
| Zeitangaben | 640 ms | 660 ms | 1.499 ms | 1.316 ms | 0,009 |

Die Messwerte zeigen keinen langsamen LCP: Auf allen vier Seiten blieb das
größte sichtbare Element eine Überschrift; der Median lag unter 0,9 Sekunden.
Der CLS blieb bei allen Seiten unter dem Grenzwert 0,1. Das sind lokale
Labormesswerte, keine Messwerte echter Nutzungsdaten und kein INP-Ersatz.

### Ursachen und Prioritäten

1. **Schriftdateien – größter überflüssiger Transfer:** Vorher luden fünf
   WOFF2-Dateien der drei Schriftfamilien insgesamt rund 113 KiB; einzelne
   Dateien benötigten im simulierten 4G etwa 650–930 ms. Space Mono wurde nur
   für kleine monospace Beschriftungen genutzt. Diese Familie wird jetzt durch
   die lokale System-Monospace-Schrift ersetzt: drei Dateien und rund 32 KiB
   weniger, ohne zusätzlichen Blocker für den LCP.
2. **JavaScript – beobachten, nicht weiter reduzieren:** Das Skript übertrug
   rund 62 KiB. Eine einzelne Messrunde sah auf der Startseite eine 58-ms-
   Hauptthread-Aufgabe; im abschließenden Wiederholungslauf war der Median
   aller Seiten 0 ms. Auf den Themenseiten wurden keine langen Aufgaben
   beobachtet. Der LCP blieb unter 0,9 Sekunden, daher wurde das
   Seitenverhalten nicht für einen kleineren Skript-Download umgebaut.
3. **Bilder – kein erkennbarer LCP-Verursacher:** Die größten Dateien waren
   das 31-KiB-App-Symbol und das 27-KiB-Website-Logo. Das LCP war jeweils die
   Überschrift; auf Themenseiten wird nur das Logo geladen.
4. **CSS – kein auffälliger Engpass:** Das übertragene Stylesheet war rund
   17 KiB groß. Es gab keinen Hinweis, dass es den sichtbaren Seitenaufbau
   verzögert.

Die erneute Messung bestätigte die gezielte Schriftkorrektur: von fünf auf drei
Font-Dateien und rund 32 KiB weniger Schrifttransfer pro Seite. Die
Ladezeit-Mediane der Themenseiten sanken gegenüber der Vorher-Messung um
174–183 ms; LCP und CLS blieben auf vergleichbarem Niveau.

Der separate mobile Layout-Test bei 320 Pixeln schlug fehl: Er meldete, dass
Themenseiten-Überschrift und fokussierte Links beim Prüfen nicht im sichtbaren
Ausschnitt lagen. Gleichzeitig meldete er weder horizontalen Überlauf noch
abgeschnittene Inhaltselemente. Dieser separate Fokus-/Viewport-Test ist nicht
Teil der LCP- und CLS-Ergebnisse und sollte unabhängig untersucht werden.

### Einschränkung externer Messdienste

Am 22. November 2026 antwortete die PageSpeed-Insights-API für alle vier
URLs mit HTTP 429 wegen des ausgeschöpften Tageskontingents. Deshalb stehen
für diese Prüfung keine aktuellen Lighthouse-/PSI-Berichte bereit. Für die
Startseite meldet CrUX weiterhin keine ausreichenden Felddaten. Die oben
aufgeführten Labormessungen wurden lokal ausgeführt und sind davon unabhängig.

Der Messlauf ist mit `pnpm --filter @workspace/cupcal-website run
test:mobile-performance` wiederholbar; die CLS-Prüfung läuft mit
`pnpm --filter @workspace/cupcal-website run test:cls`.
