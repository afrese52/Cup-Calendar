# Screenreader-Prüfung: Kontolöschdialog

## Erwartete Reihenfolge

Beim Öffnen wird der Screenreader-Fokus auf „Konto wirklich löschen?“ gesetzt.
Beim normalen Weiterwischen folgen die Erklärung der endgültigen Entfernung und
des Bestätigungslinks, danach „Löschbestätigungslink anfordern“ und „Abbrechen“.
Die Bestätigung fordert zunächst nur den Link an; gelöscht wird erst, wenn der
Link geöffnet wird.

## Unterschiede zwischen iOS und Android

- **VoiceOver (iOS):** Der Dialog markiert sich mit
  `accessibilityViewIsModal`, um seine unmittelbaren Geschwister während der
  Bestätigung auszublenden. Beim Öffnen wird die Überschrift fokussiert. Während
  die Anfrage läuft, erfolgt eine einmalige direkte Ansage.
- **TalkBack (Android):** Der Fokus wird ebenfalls auf die Überschrift gesetzt.
  Der Dialog verwendet die native Accessibility-Wichtigkeit; der geänderte
  Schaltflächenname und eine höfliche Live-Region melden den Ladezustand, ohne
  zusätzlich eine manuelle Ansage auszulösen.
- **Beide Plattformen:** Überschrift, Erklärung, Bestätigen und Abbrechen stehen
  in dieser Reihenfolge. Fehler werden als dringende Meldung ausgegeben; Erfolg
  wird als höfliche Meldung angezeigt.

## Prüfgrenze

Die Bildschirmtests prüfen die Reihenfolge der nativen Accessibility-Props,
den Fokusaufruf und die getrennten Ansagewege. Sie können die tatsächliche
Sprachausgabe oder das Wischverhalten auf Geräten nicht simulieren. Eine
abschließende manuelle Prüfung mit VoiceOver und TalkBack auf iOS- und
Android-Geräten bleibt erforderlich.
