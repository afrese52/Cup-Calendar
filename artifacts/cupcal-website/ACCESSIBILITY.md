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

## Windows-Kontrastmodus

Die Themennavigation, die Brotkrumennavigation und die Fokusrahmen unterstützen
`forced-colors: active`. Im erzwungenen Farbmodus verwenden Links und
Fokusrahmen Systemfarben. Der aktuelle Themenlink und die aktuelle Seite in der
Brotkrumennavigation erhalten zusätzlich eine hervorgehobene Fläche und bleiben
damit nicht allein durch ihre Textfarbe erkennbar.

Die Chromium-Prüfung emuliert den erzwungenen Farbmodus für alle drei
Themenseiten. Sie kontrolliert sichtbare Links, die Markierung der aktuellen
Seite und 3-Pixel-Fokusrahmen an Themen- und Brotkrumenlinks. Vom Projektstamm
ausführen:

```sh
PORT=19101 BASE_PATH=/ pnpm --filter @workspace/cupcal-website run build
pnpm --filter @workspace/cupcal-website run test:mobile-layout
```

Ergebnis der letzten Prüfung: alle drei Themenseiten bestanden die
`forced-colors: active`-Emulation. Navigation, aktuelle Seite in Navigation
und Breadcrumb sowie Fokusrahmen waren sichtbar. Diese Browser-Emulation prüft
die CSS-Regeln, ersetzt aber keinen zusätzlichen Test mit einem echten
Windows-Kontrastdesign.

Für die manuelle Prüfung in Windows unter „Einstellungen → Barrierefreiheit →
Kontrastdesigns“ ein Design aktivieren. Danach die drei Themenseiten in Edge
oder Chrome öffnen, mit `Tab` durch Kopfzeilennavigation und Breadcrumb gehen
und kontrollieren, dass der Tastaturfokus sowie der aktuelle Themenlink klar
erkennbar bleiben.

## Browserzoom mit 200 Prozent

Die wiederholbare Layoutprüfung verwendet Chromium im Headless-Modus. Eine
Ansicht mit 640 CSS-Pixeln Breite entspricht bei einem 1280 Pixel breiten
Browserfenster ungefähr 200 Prozent Zoom. Der Test lädt die Startseite und alle
drei Themenseiten mit dieser Breite sowie bei 320 und 360 CSS-Pixeln. Er meldet
horizontalen Seitenüberlauf, abgeschnittene Texte, überlappende Kopfzeilen und
Aktionen, deren Text nicht vollständig in den Link passt.

Vom Projektstamm aus ausführen:

```sh
PORT=19101 BASE_PATH=/ pnpm --filter @workspace/cupcal-website run build
pnpm --filter @workspace/cupcal-website run test:large-text
```

Ergebnis der letzten Prüfung: alle vier Seiten bestanden die Ansichten mit
640 CSS-Pixeln ohne horizontalen Überlauf oder abgeschnittene Aktionen. Die
kleinen Ansichten mit 320 und 360 CSS-Pixeln bestanden ebenfalls.

Für die manuelle Wiederholung im Browser ein 1280 Pixel breites Fenster auf
200 Prozent Zoom stellen und nacheinander `/`, `/turnierkalender-app/`,
`/turniertermine-organisieren/` und `/turnierzeiten-zeitzone/` öffnen. Den
gesamten Inhalt bis zum Fußbereich durchgehen: Es darf keine horizontale
Bildlaufleiste geben; Überschriften, Themenlinks und Schaltflächen müssen
vollständig lesbar und erreichbar bleiben. Bei der Tastaturprüfung mit `Tab`
müssen die Links sichtbar fokussiert werden können.

## Schriftprüfung in Firefox und WebKit

Der Cross-Browser-Test öffnet die Startseite und alle Themenseiten in Firefox
und der WebKit-Engine (Safari-Engine) bei schmalen Hoch- und Querformaten. Er
prüft, ob „DM Sans“ und „Barlow Condensed“ geladen werden, und meldet
abgeschnittene Überschriften, Navigationstexte, Schaltflächen oder
Seitenüberläufe mit Seite, Ansicht und betroffenem Text.

Nach dem Produktionsbuild ausführen:

```sh
pnpm --filter @workspace/cupcal-website exec playwright install webkit firefox
pnpm --filter @workspace/cupcal-website run test:cross-browser-layout
```
