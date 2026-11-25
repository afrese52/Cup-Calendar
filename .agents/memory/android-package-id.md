---
name: Android-Paketkennung für Play
description: CupCal-Entscheidung zur Paketkennung und zu getrennten Google-Play-Einträgen.
---

Die ursprüngliche Play-Test-App verwendet `de.cup.calender`. Für eine korrekt geschriebene Kennung hat der Nutzer `de.cup.calendar` gewählt. Das Projekt soll mit `de.cup.calendar` weitergebaut werden; dieses Paket ist eine eigenständige App und kann die alte Play-App nicht aktualisieren.

**Why:** Der Nutzer möchte den englischen Tippfehler „calender“ zu „calendar“ korrigieren und hat ausdrücklich die neue App-Kennung gewählt.

**How to apply:** Bei Builds und Store-Unterlagen die aktive Kennung aus `app.json` verwenden. Vor Store-Uploads prüfen, dass in Play Console ein passender separater Eintrag angelegt ist.
