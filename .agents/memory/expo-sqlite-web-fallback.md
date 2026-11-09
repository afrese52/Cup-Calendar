---
name: Expo SQLite web fallback
description: Keep native SQLite out of the browser bundle when an Expo app also supports web preview.
---

Expo SQLite must not be imported from a module that Metro resolves for web. A runtime `Platform.OS` guard or dynamic import can still make Metro resolve SQLite's missing WASM asset during browser bundling. Keep the SQLite implementation in a `.native.ts` module and use an AsyncStorage implementation in the shared or `.web.ts` module with the same exports.

**Why:** The browser preview failed to bundle `expo-sqlite/wa-sqlite.wasm` even though the code selected AsyncStorage on web at runtime.

**How to apply:** When the Expo app keeps browser preview support, use platform-specific storage modules and verify the browser bundle after adding native persistence.
