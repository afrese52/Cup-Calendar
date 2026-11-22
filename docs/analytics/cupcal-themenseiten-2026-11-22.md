# CupCal-Themenseiten: Analytics-Auswertung

**Abfragezeitraum:** letzte 7 Tage bis zum 22. November 2026; ergänzend wurden die letzten 30 Tage geprüft.  
**Ergebnis:** Für keine der drei Themenseiten wurden Seitenaufrufe, `content_section_view`-Ereignisse oder Klicks auf verwandte Themen erfasst. Eine Rangfolge nach Nutzung ist deshalb derzeit nicht möglich.

| Themenseite | Seitenaufrufe, 7 Tage | Inhaltsabschnitte, 7 Tage | Klicks auf verwandte Themen, 7 Tage |
| --- | ---: | ---: | ---: |
| `/turnierkalender-app/` | 0 | 0 | 0 |
| `/turniertermine-organisieren/` | 0 | 0 | 0 |
| `/turnierzeiten-zeitzone/` | 0 | 0 | 0 |

## Was die vorhandenen Daten zeigen

- Im 30-Tage-Fenster gab es insgesamt 75 Seitenaufrufe im Projekt. Die erfassten Pfade waren `/cupcal-website/`, `/` und einmal `/cupcal-website/#funktionen`; keiner davon war eine Themenseite.
- Es gab 60 `content_section_view`-Ereignisse: 32 für `calendar_preview` und 28 für `availability`. Die Ereignisdaten enthielten dabei keine `page`-Eigenschaft, daher lassen sich diese Aufrufe keiner Themenseite zuordnen.
- Die drei erfassten `site_navigation_click`-Ereignisse kamen von der Startseite und hatten die Platzierung `main_nav`. Für `related_topic` gab es keine Klicks.
- Die vorhandene Implementierung sendet für Inhaltsabschnitte `page` und `section` und für Themenkarten `destination` und `placement`. Die gesammelten Daten belegen aber noch nicht, dass die aktuelle Instrumentierung auf den veröffentlichten Themenseiten aktiv ist.

## Empfehlungen

1. **Noch keine Themenseite nach vermeintlicher Popularität priorisieren.** Zuerst die aktualisierte Website veröffentlichen und erneut messen, sobald Aufrufe auf den drei Themenpfaden sowie `content_section_view` mit `page` und `section` eingehen. Die aktuelle Datenbasis erlaubt keinen belastbaren Vergleich.
2. **Die thematischen Übergänge im Fließtext ergänzen:** Auf „Turniertermine finden, filtern und merken“ nach den Handlungsschritten auf die Kalender-App verweisen; auf der Kalender-App-Seite beim Abschnitt zu lokalen Startzeiten auf „Turnierzeiten in deiner Gerätezeitzone“ verlinken. So verbinden die Links jeweils den nächsten passenden Informationsschritt, unabhängig von den noch fehlenden Klickdaten.

**Messgrenze:** Analytics-Daten dieses Projekts beginnen am 17. November 2026; das 30-Tage-Fenster ist daher kein vollständiger Monat gemessener Nutzung. Ein fehlender Eintrag bedeutet „nicht erfasst“, nicht zwingend „niemand hat die Seite besucht“.
