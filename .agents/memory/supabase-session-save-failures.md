---
name: Speicherfehler nach Codeaustausch
description: Verhalten des Supabase-Auth-Clients, wenn die lokale Sitzung nach einem erfolgreichen PKCE-Austausch nicht gespeichert werden kann.
---

Ein PKCE-Code kann serverseitig erfolgreich eingelöst sein, bevor Supabase beim Speichern der zurückgegebenen Sitzung im lokalen Adapter scheitert. Dieser Fehler kann außerhalb der üblichen Supabase-Auth-Fehlerobjekte weitergeworfen werden; der Aufruf darf deshalb nicht als erfolgreicher Login behandelt werden.

**Why:** Bestätigungscodes sind nach dem Serveraustausch verbraucht, obwohl die App ohne gespeicherte Sitzung bleiben kann.

**How to apply:** Bei Bestätigungs- und Login-Flows Persistenzfehler von Linkfehlern unterscheiden, einen möglichen teilweise geschriebenen Sitzungseintrag bereinigen und keinen wiederherstellbaren Login melden.

Supabase JS ergänzt beim Passwort-Grant automatisch ein `gotrue_meta_security`-Objekt im Request-Body. **Why:** Ein HTTP-Teststub, der nur E-Mail und Passwort erwartet, kann dadurch einen gültigen Login fälschlich als fehlgeschlagen behandeln. **How to apply:** Bei Auth-Integrationstests den vollständigen Body erfassen und SDK-eigene Felder berücksichtigen, statt ausschließlich die vom Aufrufer übergebenen Zugangsdaten zu erwarten.
