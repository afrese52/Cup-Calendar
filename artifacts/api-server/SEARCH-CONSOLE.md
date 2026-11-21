# Google Search Console für CupCal einrichten

Die CupCal-API greift serverseitig mit OAuth 2.0 auf Google zu. Der angeforderte OAuth-Bereich ist ausschließlich lesend (`webmasters.readonly`). Google-Zugangsdaten und Zugriffstoken werden nicht an die App zurückgegeben.

## Einmalige Google-Einrichtung

1. Öffne ein Google-Cloud-Projekt oder erstelle eines.
2. Aktiviere darin die **Google Search Console API**.
3. Erstelle ein **Dienstkonto** und einen JSON-Schlüssel dafür. Eine zusätzliche Google-Cloud-Rolle ist für diese Search-Console-Abfragen nicht erforderlich.
4. Füge die E-Mail-Adresse des Dienstkontos in der Google Search Console als Nutzer der URL-Präfix-Property `https://cupcal.af-software.app/` hinzu. Für den URL-Inspection-Bericht muss das Dienstkonto die Property sehen können.
5. Hinterlege den vollständigen JSON-Inhalt des Dienstkonto-Schlüssels in Replit Secrets mit dem Namen `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON`. Der Schlüssel darf nicht in den Quellcode oder in den Chat kopiert werden.
6. Starte den API-Server nach dem Speichern des Secrets neu. In CupCal erscheint der Zugang unter **Info → Google-Suchdaten** nur für freigegebene Admin-Konten.

## Abruf

Der Bericht ruft für jede eingegebene CupCal-URL den Google-Indexierungsstatus und Klicks, Impressionen, CTR sowie durchschnittliche Position im ausgewählten Zeitraum ab. Zulässig sind nur `https://cupcal.af-software.app/`-URLs. Die Performance-Daten in Search Console können zeitversetzt sein und für neue Seiten noch fehlen.

## Sicherheit

- Alle Routen erfordern ein angemeldetes, in `CUPCAL_IMPORT_ADMIN_EMAILS` freigegebenes CupCal-Konto.
- Das Google-Dienstkonto verwendet nur `https://www.googleapis.com/auth/webmasters.readonly`.
- URLs und Zeiträume werden serverseitig begrenzt und geprüft.
- Google-Fehlerantworten und Zugangsdaten werden nicht protokolliert.
