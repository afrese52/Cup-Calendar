---
name: Google-Play-Zugriff
description: Direkter Browserzugriff als Alternative zum blockierten Google-Play-Connector
---

Ein blockierter Replit-OAuth-Connector bedeutet nicht, dass das Google-Konto keinen Zugang zur Play Console hat. Die direkte Anmeldung in der Play Console ist getrennt davon zu prüfen.

**Why:** Google blockierte den Connector wegen einer nicht abgeschlossenen OAuth-App-Prüfung und beschränkter Testnutzerfreigabe. Die direkte Google-Anmeldung mit Nutzerübernahme funktionierte trotzdem.

**How to apply:** Bei dieser konkreten Fehlermeldung nicht wiederholt dieselbe Verbindungskarte öffnen. Stattdessen den direkten Browserweg anbieten, den Nutzer selbst anmelden lassen und danach den tatsächlichen Zugriff erneut prüfen. Eine frühere Anmeldung garantiert keine dauerhafte Sitzung.
