---
name: Zod-Schemas in Node-Tests
description: Node-Tests mit nativer TypeScript-Strip-Unterstützung und generierten Zod-Schemas
---

Wenn ein API-Server-Test unter Node ein generiertes Zod-Schema braucht, importiere den Laufzeit-Export aus `lib/api-zod/src/generated/api.ts` statt über den Paketindex. Der Index verwendet extensionlose TypeScript-Importe, die Node beim nativen Laden nicht auflöst.

**Why:** Node 24 kann TypeScript-Quelltext strippen, löst aber diese extensionlosen ESM-Importe nicht automatisch auf.

**How to apply:** In `.mjs`-Tests, die `node --experimental-strip-types` verwenden, den konkreten generierten API-Schema-Export relativ importieren.
