---
name: WebKit-Tests in Replit
description: Start und TLS für Playwright WebKit im Replit-Nix-Laufzeitumfeld
---

Playwrights headless WPE-MiniBrowser kann in Replit ohne EGL-Anzeige abbrechen. Der GTK-MiniBrowser läuft unter Xvfb, wenn dessen Bibliothekspfade vor `REPLIT_LD_LIBRARY_PATH` gesetzt werden. Playwrights Debian-Prüfung erkennt Nix-Bibliotheken nicht; die Host-Prüfung nur im Replit-Lauf überspringen.

Externe HTTPS-Ressourcen wie Google Fonts benötigen außerdem `glib-networking`. Dessen GIO-Modulverzeichnis muss über `GIO_EXTRA_MODULES` sichtbar gemacht werden, sonst meldet WebKit „TLS support is not available“.

**Why:** Replit stellt Browser-Abhängigkeiten über Nix bereit; WebKit und GLib entdecken Bibliotheken und TLS-Module nicht automatisch über dieselben Pfade.

**How to apply:** In Replit-Linux-Tests Xvfb starten, den GTK-MiniBrowser direkt mit dessen Bibliothekspfaden und `REPLIT_LD_LIBRARY_PATH` ausführen und das `glib-networking`-Modulverzeichnis ergänzen. Auf anderen Umgebungen den normalen Playwright-Start beibehalten.
