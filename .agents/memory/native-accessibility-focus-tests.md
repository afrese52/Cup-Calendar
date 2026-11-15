---
name: Native Fokus in Expo-Bildschirmtests
description: Testet Accessibility-Fokuswechsel auf nativen React-Native-Bildschirmen.
---

Der React-Native-Test-Renderer stellt keine verlässlichen nativen View-Tags für `findNodeHandle` bereit. Fokuswechsel deshalb testen, indem `findNodeHandle` einen Test-Handle liefert und `AccessibilityInfo.setAccessibilityFocus` auf genau diesen Handle geprüft wird.

**Why:** Screenreader-Fokus ist eine native Plattformaktion und lässt sich aus dem Test-Renderer nicht real ausführen; ohne expliziten Handle-Mock wird ein korrekter Fokuspfad fälschlich als nicht aufgerufen bewertet.

**How to apply:** Bei iOS-/Android-Bildschirmtests, die nativen Accessibility-Fokus verschieben, beide APIs mocken und zusätzlich prüfen, dass der Fokus-Ref auf das gerenderte Ziel zeigt.
