---
name: AsyncStorage in Node-Tests
description: Node.js-Tests, die den CupCal-AsyncStorage-Webadapter direkt laden.
---

Beim Ausführen von Expo-TypeScript-Services mit Node `--experimental-strip-types` kann der AsyncStorage-Import als verschachteltes `default`-Objekt erscheinen. Die Webimplementierung erwartet außerdem `window.localStorage`.

**Why:** Die Tests liefen nicht im Expo-/Metro-Bundler und scheiterten deshalb an Modul-Interop und der fehlenden Browser-Umgebung, nicht an der Speicherlogik.

**How to apply:** Für Node-Tests, die den echten Service laden, bei Bedarf den verschachtelten Default-Export auflösen und vor dem Aufruf eine minimale `window.localStorage`-Attrappe setzen. Die Plattform-Module des Apps nicht allein für die Testumgebung ändern.
