---
name: Google-Play-Zugriff
description: Direkter Browserzugriff als Alternative zum blockierten Google-Play-Connector
---

Ein blockierter Replit-OAuth-Connector bedeutet nicht, dass das Google-Konto keinen Zugang zur Play Console hat. Die direkte Anmeldung in der Play Console ist getrennt davon zu prüfen.

**Why:** Google blockierte den Connector wegen einer nicht abgeschlossenen OAuth-App-Prüfung und beschränkter Testnutzerfreigabe. Die direkte Google-Anmeldung mit Nutzerübernahme funktionierte trotzdem.

**How to apply:** Bei dieser konkreten Fehlermeldung nicht wiederholt dieselbe Verbindungskarte öffnen. Stattdessen den direkten Browserweg anbieten, den Nutzer selbst anmelden lassen und danach den tatsächlichen Zugriff erneut prüfen. Eine frühere Anmeldung garantiert keine dauerhafte Sitzung.

## Datensicherheitsentwürfe tatsächlich prüfen

Ein geschlossener Datentyp-Dialog und der Status „Abgeschlossen“ belegen
nicht, dass seine konkreten Antworten dauerhaft gespeichert wurden.
Nach dem übergeordneten Speichern als Entwurf die Seite neu laden und
die tatsächlichen Radio-Auswahlen sowie die Vorschau kontrollieren.

**Why:** Bei der Korrektur sahen die Dialoge zunächst vollständig aus,
nach Neuladen war E-Mail aber weiterhin als nur sitzungsspezifisch
markiert und fehlte dadurch in der Vorschau. Erst das übergeordnete
Entwurfspeichern und der erneute Detailabgleich belegten die Korrektur.

**How to apply:** Bei Play-Console-Änderungen nie allein aus dem
Dialogabschluss auf Persistenz schließen. Entwurfspeicherung und
abschließende Bestätigung/Einreichung getrennt behandeln.
