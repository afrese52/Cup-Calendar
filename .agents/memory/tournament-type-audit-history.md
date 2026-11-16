---
name: Turnierart-Korrekturprotokoll
description: Dauerhafte Audit-Einträge zu manuellen Turnierartänderungen.
---

Audit-Einträge für manuelle Turnierartkorrekturen behalten Termin-ID, Termintitel, Admin-ID und Admin-E-Mail als unveränderliche Momentaufnahme. Sie haben absichtlich keine Fremdschlüssel zu Terminen oder Auth-Konten, damit das Protokoll spätere Löschungen überlebt.

**Why:** Ein Audit-Protokoll ist nur dann nachvollziehbar, wenn es frühere Änderungen auch nach dem Entfernen eines Termins oder Kontos noch belegt.

**How to apply:** Neue Audit-Felder als Momentaufnahmen speichern und keine Löschkaskaden von den verknüpften Produkt- oder Kontodatensätzen einführen.
