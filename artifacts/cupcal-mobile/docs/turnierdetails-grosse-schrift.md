# Große Schrift auf den Turnierdetails

## Automatisiert geprüft

Der Screen-Test `tests/bookmark-sign-in-prompt.screen.test.tsx` prüft die Turnierdetails getrennt für Android und iOS mit einem kleinen Ansichtsfenster (320 × 480) und `fontScale: 2`.

Für beide Plattformvarianten wird geprüft, dass:

- Titel, Beschreibung und Turnierinformationen dynamische Schriftvergrößerung unterstützen und nicht auf eine feste Zeilenzahl gekürzt werden;
- der Inhalt in einer scrollbar erreichbaren Ansicht bleibt;
- die Speicheraktion einen zugänglichen Namen hat, aktiviert ist und ausgelöst werden kann;
- die Beschriftung der Speicheraktion bei großer Schrift umbrechen kann.

Ausgeführt mit:

```sh
pnpm --filter @workspace/cupcal-mobile exec jest --config jest.config.cjs --runInBand --runTestsByPath tests/bookmark-sign-in-prompt.screen.test.tsx
```

## Grenzen der Prüfung

Die Plattformvarianten werden in Jest geprüft. Eine Bedienung auf echten Android- und iOS-Geräten mit aktivem TalkBack beziehungsweise VoiceOver wurde nicht durchgeführt. Die tatsächliche Sprachausgabe und die Fokusbewegung auf Geräten müssen deshalb bei einer manuellen Geräteprüfung bestätigt werden.
