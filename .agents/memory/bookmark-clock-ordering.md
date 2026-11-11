---
name: Bookmark-Zeitordnung
description: Konfliktregel für Favoritenänderungen auf Geräten mit abweichenden Uhren.
---

Gerätezeitstempel dürfen nicht entscheiden, ob eine ausstehende Favoritenänderung gewinnt. Lokal bleibt die zuletzt gespeicherte Absicht erhalten, bis der Remote-Zustand diesen Wert erreicht; Supabase vergibt bei jedem Schreibvorgang atomar eine steigende Revision. `updated_at` ist nur Diagnose-Metadatum.

**Why:** Eine vor- oder nachgehende Geräteuhr kann eine neuere Offline-Änderung sonst als älter einstufen und verwerfen.

**How to apply:** Bei zukünftigen Bookmark-Konfliktregeln keine clientseitigen Zeitvergleiche ergänzen. Neue RPC-Schreibpfade müssen dieselbe serverseitige Revision fortschreiben und ausstehende lokale Absichten bis zur Bestätigung behalten.
