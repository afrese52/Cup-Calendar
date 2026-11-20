---
name: Supabase-RLS bei Löschversuchen
description: PostgREST-Antworten bei DELETE-Anfragen, die durch Row Level Security gefiltert werden.
---

Eine durch RLS nicht freigegebene DELETE-Anfrage kann über PostgREST ohne Fehler beantwortet werden, obwohl keine Zeile gelöscht wurde. Bei Integrationstests `.delete().select(...)` verwenden und entweder einen Fehler oder null zurückgegebene Zeilen akzeptieren; zusätzlich den tatsächlichen Bestand mit einem privilegierten Prüfclient vergleichen.

**Why:** Eine erfolgreiche HTTP/API-Antwort bedeutet bei gefilterten DELETEs nicht, dass eine Zeile gelöscht wurde.

**How to apply:** Bei RLS-Löschtests nicht nur `error` prüfen. Die zurückgegebenen Zeilen und den nachherigen Zustand der Datenbank prüfen.
