---
name: Favoriten über Geräte hinweg
description: Produktanforderung für geteilte Favoriten desselben Kontos auf mehreren Geräten.
---

Favoriten gehören zum angemeldeten Konto, nicht nur zu einem einzelnen Gerät. Eine Änderung auf einem angemeldeten Gerät muss auf weiteren Geräten mit demselben Konto erscheinen; lokale Favoriten sind nur Cache und Offline-Puffer.

**Why:** Der Nutzer hat berichtet, dass Favoriten auf zwei Geräten mit demselben Konto nur lokal erschienen, und ausdrücklich die kontoweite Synchronisierung verlangt.

**How to apply:** Bei Favoritenänderungen Supabase als gemeinsame Quelle verwenden, Realtime-Benachrichtigungen für schnelle Aktualisierung aktivieren und lokale ausstehende Änderungen bis zur Serverbestätigung erhalten.
