# Prüfung der Community-Turnierzuordnungen

- **Prüfdatum:** 14. November 2026
- **Datenquelle:** Supabase-Daten des laufenden CupCal-API-Servers, gelesen über `/v1/events`
- **Prüfumfang:** Alle vom Endpunkt gelieferten Termine ohne Regions- oder Zeitfilter

## Ergebnis

Der Endpunkt lieferte 22 gespeicherte Termine: 12 Ranked Cups, 5 Cash Cups und 5 FNCS-Termine. Es gab keinen Termin mit `tournament_type = Community` und keinen mit `game_mode = Community`.

Damit gab es in diesem Datenbestand keine gespeicherten Community-Termine, deren Turniernamen fachlich auf eine andere Turnierart hindeuten könnten. Eine manuelle Korrektur war nicht erforderlich.

Die Importregeln und gespeicherten Termine wurden nicht geändert. Der MHT-Importer verlangt weiterhin eindeutige Namenshinweise und verwirft mehrdeutige Turnierarten zur Prüfung, statt sie als Community einzusortieren.
