---
name: FortniteAPI.io host availability
description: Last known connectivity issue for CupCal's configured tournament data source.
---

Bei der Prüfung am 9. November 2026 hatte `fortniteapi.io` keinen auflösbaren A-Record; die Anfrage scheiterte mit `ENOTFOUND`. `api.fortniteapi.io` löste auf, antwortete für den getesteten Events-Endpunkt jedoch mit HTTP 521.

**Why:** Das Feinkonzept nennt `https://fortniteapi.io/v1/events/list`, aber die API-Verbindung kann nicht funktionieren, solange der Anbieterhost nicht erreichbar ist.

**How to apply:** Vor Änderungen am Host oder Wechsel der Quelle den DNS- und HTTP-Status erneut prüfen. Nicht stillschweigend auf einen anderen Anbieter wechseln.
