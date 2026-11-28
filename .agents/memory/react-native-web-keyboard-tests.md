---
name: Tastaturtests für React Native Web
description: Browser-Tastaturaktivierung in Expo-Screen-Tests prüfen.
---

Der React-Native-Screen-Renderer ist kein DOM und bildet die Web-Tastaturbehandlung nicht durch einen bloßen Aufruf von `onClick` ab. Den React-Native-Web-Pressable separat mit dem Aktionscallback des Screens rendern, `tabIndex` und Button-Rolle prüfen und die echten `onKeyDown`-/Dokument-`keyup`-Handler für Enter oder Leertaste auslösen. Da die Test-Renderer-Refs keine DOM-Elemente sind, kann der Hover-Hook für diesen isolierten Test deaktiviert werden.

**Why:** Ein synthetischer Klick bestätigt nur den App-Callback, aber nicht, dass die Web-Komponente per Tastatur erreichbar ist und den Callback bei einer Tastaturaktivierung auslöst.

**How to apply:** Bei Expo-Web-Tastaturtests prüfen, ob der Test den Pressable-Tastaturpfad tatsächlich ausführt; falls nicht, den Web-Pressable separat testen oder einen echten Browser verwenden.
