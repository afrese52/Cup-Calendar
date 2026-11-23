# Passwortwiederherstellung mit Screenreadern prüfen

## Automatisiert geprüft

Der Screen-Test `tests/settings.screen.test.tsx` prüft iOS- und Android-Verhalten getrennt:

- Beim Wechsel zum Zurücksetzen und beim Zurückgehen erhält die jeweilige Überschrift den Fokus.
- E-Mail-Feld, „Link anfordern“ und „Zurück zur Anmeldung“ haben verständliche Namen; Feld und Aktionen sind über ihre Accessibility-Elemente erreichbar.
- Eine erfolgreiche Linkanfrage stellt eine höfliche Statusmeldung bereit und löst keinen programmatischen Fokuswechsel aus.
- Fehler werden als dringende Meldung gekennzeichnet und gezielt fokussiert, damit die Rückmeldung nach der Anfrage nicht übersehen wird.

Ausführen:

```sh
pnpm --filter @workspace/cupcal-mobile exec jest --config jest.config.cjs --runInBand --runTestsByPath tests/settings.screen.test.tsx
```

## Manuelle Prüfung auf Geräten

Die Jest-Plattformvarianten prüfen die von React Native gerenderten Accessibility-Eigenschaften, nicht die tatsächliche Sprachausgabe. Auf einem iPhone mit VoiceOver und einem Android-Gerät mit TalkBack jeweils:

1. CupCal öffnen und zu **Einstellungen → Konto → Passwort vergessen?** gehen.
2. Mit Wischgesten vorwärts prüfen, dass die Überschrift „Passwort zurücksetzen“, das Feld „E-Mail-Adresse“, die Aktion „Link anfordern“ und „Zurück zur Anmeldung“ einzeln erreichbar und verständlich benannt sind.
3. Im E-Mail-Feld eine Testadresse eingeben und den Link anfordern. Prüfen, ob die allgemeine Erfolgsmeldung vorgelesen wird und der Screenreader-Fokus nicht unerwartet auf ein anderes Steuerelement springt.
4. In einer Testumgebung einen Versandfehler auslösen. Prüfen, ob die Fehlermeldung angesagt wird und der Fokus gezielt auf dieser Meldung landet.
5. „Zurück zur Anmeldung“ aktivieren. Prüfen, ob die Anmeldeüberschrift fokussiert wird und die Anmeldeelemente wieder erreichbar sind.

Für echte Versandversuche nur eine kontrollierte Testadresse und eine Umgebung verwenden, in der der Versand beabsichtigt ist.

## Plattformverhalten und Prüfgrenzen

- Beim Moduswechsel wird die Überschrift auf iOS und Android explizit fokussiert.
- Beide Plattformvarianten erhalten für die Erfolgsmeldung die Alert-Rolle und die Live-Region „polite“. Android kann die Live-Region für die Ansage nutzen; iOS erhält hier keinen zusätzlichen expliziten Ansageaufruf. Ob VoiceOver die Meldung zuverlässig ansagt und den Fokus unverändert lässt, muss auf einem Gerät bestätigt werden.
- Bei Fehlern wird die Alert-Meldung als „assertive“ gekennzeichnet und auf beiden Plattformen ausdrücklich fokussiert. Das ist eine beabsichtigte Fokusbewegung, keine Fokusverschiebung der Erfolgsmeldung.
- Eine Prüfung mit aktivem VoiceOver oder TalkBack auf echten Geräten wurde in dieser Arbeitsumgebung nicht durchgeführt. Daher sind keine tatsächlichen Geräteabweichungen bestätigt; Unterschiede in Ansage, Reihenfolge oder Fokus müssen während der manuellen Schritte notiert werden.
