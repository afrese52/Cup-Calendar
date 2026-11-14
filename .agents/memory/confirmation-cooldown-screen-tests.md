---
name: Countdown-Screen-Tests
description: Verhindert Timer-Leaks und überlappende React-act-Aufrufe bei Einstellungsbildschirmtests.
---

Bildschirmtests, die den Bestätigungs-Countdown starten oder nach einem Neustart wiederherstellen, müssen ihre gerenderten Ansichten ausdrücklich und abgewartet unmounten. Den Wiederherstellungsfall ans Ende der Einstellungsbildschirmtests stellen.

**Why:** React Native Testing Library 14 zeigte nach solchen Tests überlappende `act`-Aufrufe; ein übrig gebliebener Countdown-Timer störte nachfolgende Bildschirmtests.

**How to apply:** Bei neuen Testfällen, die die Ablaufzeit laden oder setzen, den Unmount mit `await act(async () => view.unmount())` abschließen und bei fehlgeschlagenen Folgetests zuerst nach einem laufenden Countdown-Timer suchen.
