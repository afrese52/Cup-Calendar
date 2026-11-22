---
name: Live-Komprimierung hinter Proxys
description: Beobachtete Änderungen an Identity-HTML durch die vorgeschaltete CupCal-Live-Schicht.
---

Bei Live-Komprimierungstests für CupCal darf Identity-HTML nicht zwingend bytegleich mit dem dekomprimierten Brotli-/Gzip-HTML sein: Die vorgeschaltete Google-Frontend-Schicht kann das Replit-Analytics-Skript in unkomprimierte Antworten einfügen.

**Why:** Beim Live-Check wurde das Skript auf der Hauptdomain bei fehlendem `Accept-Encoding` und bei ausdrücklich erlaubtem `identity` beobachtet; auf der Replit-Domain trat es bei der expliziten `identity`-Anfrage auf, nicht aber bei fehlendem Header. Lokal ist dieser Proxy-Zusatz nicht vorhanden.

**How to apply:** Bei künftigen Live-Komprimierungsprüfungen Status, `Content-Encoding`, `Vary` und erfolgreich decodierten Inhalt prüfen. Ein pauschaler Bytevergleich zwischen Identity und komprimierten Antworten kann durch die vorgeschaltete Plattform fehlschlagen.
