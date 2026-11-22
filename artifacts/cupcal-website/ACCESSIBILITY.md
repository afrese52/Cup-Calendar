# Tastatur- und Screenreader-Prüfung

Die drei Themenseiten verwenden dieselbe barrierearme Seitenstruktur:

- Sprunglink „Zum Inhalt springen“ als erster Tastaturstopp
- genau ein benannter Hauptbereich und ein benannter Themen-Navigationsbereich
- auf Themenseiten eine benannte Brotkrumennavigation mit markierter aktueller Seite
- sichtbarer, kontrastreicher Fokusrahmen für Links und Bedienelemente
- kurze, eindeutige Namen für Themenkarten

Der Website-Build prüft diese Struktur für die Startseite und alle drei
Themenseiten. Nach dem Produktionsbuild prüft
`pnpm --filter @workspace/cupcal-website run test:mobile-layout` die drei
Themenseiten bei 320 und 360 CSS-Pixeln auf horizontalen Überlauf sowie
sichtbare, fokussierbare Navigation, Breadcrumbs, Karten und Links. Den echten
Tastatur- und Screenreader-Ablauf zusätzlich so wiederholen:

## Tastatur

Für jede Seite öffnen:

- `/turnierkalender-app/`
- `/turniertermine-organisieren/`
- `/turnierzeiten-zeitzone/`

1. Seite neu laden und mit `Tab` zum Sprunglink wechseln. „Zum Inhalt springen“
   muss sichtbar fokussiert sein.
2. `Enter` drücken. Der Fokus muss in den Hauptbereich springen; die nächste
   Tab-Navigation darf nicht wieder bei Logo und Kopfzeile beginnen.
3. Mit `Tab` und `Umschalt+Tab` durch Themen-Navigation, Startseitenlink,
   Brotkrumennavigation, Themenkarten und Fußzeilenlink gehen. Jeder Fokus ist
   sichtbar und die Reihenfolge folgt der visuellen Leserichtung.
4. Themenlink mit `Enter` öffnen. Die Seite muss laden und die aktuelle Seite
   in der Themen-Navigation markieren. Mit `Alt+Links` zum vorherigen Thema
   zurückkehren.
5. Die Prüfung bei breitem Desktop-Fenster sowie bei schmaler Ansicht
   (320 und 360 CSS-Pixel) wiederholen. Auf schmalen Ansichten darf sich die
   Themen-Navigation auf mehrere Zeilen verteilen, ohne Links abzuschneiden.

## Screenreader

Mit NVDA und Firefox oder TalkBack und Chrome jede der drei Seiten öffnen:

1. Überschriftenliste aufrufen. Es gibt genau eine H1; die Inhaltsabschnitte
   folgen als H2.
2. Mit der Landmarken-Navigation Kopfzeile, Themen-Navigation, Hauptbereich,
   Brotkrumennavigation und Fußbereich finden. Jede Navigation hat einen
   unterscheidbaren Namen.
3. Links durchsuchen. Der aktuelle Themenlink wird als aktuelle Seite
   angesagt; Themenkarten haben einen kurzen Namen aus Thema und Überschrift.
4. Den Sprunglink aktivieren und prüfen, dass der Screenreader den Hauptbereich
   erreicht.

Diese Schritte beschreiben die manuelle Prüfung mit echten Browsern und
Screenreadern. Der Build-Smoke-Test prüft die gerenderte Semantik, ersetzt
aber nicht den manuellen Fokus- und Ansagetest.
