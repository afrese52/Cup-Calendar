---
name: Supabase-Profile für Auth-Konten
description: CupCal erwartet eine Profilzeile je Supabase-Auth-Benutzer.
---

Die Supabase-Tabelle heißt `public.user_profiles`. CupCal-Konten bleiben in `auth.users`; zusätzlich wird ein passender Eintrag je Konto in der Profiltabelle erwartet. Die Profilzeile soll durch einen Datenbanktrigger beim Auth-Insert erzeugt werden, statt nur von einem einzelnen Client-Registrierungsablauf abzuhängen. Bestehende Auth-Konten brauchen einen einmaligen Backfill.

**Why:** Der Nutzer hat bestätigt, dass die vorhandene Supabase-Tabelle `user_profiles` heißt und neue wie bestehende CupCal-Benutzer darin erscheinen sollen.

**How to apply:** Bei Auth- oder Profile-Änderungen die Profilmigration, den Auth-Trigger, den Backfill und restriktive RLS-/Grants gemeinsam prüfen. `is_admin` und `is_pro` nie vom normalen Client änderbar machen.
