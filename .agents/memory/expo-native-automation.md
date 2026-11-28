---
name: Expo native automation
description: Replit-specific limits when automating physical Expo Go devices or cloud simulators.
---

Expo Go may load the project on an Android phone while both Expo MCP automation connections still report that no device target is available. Reconnecting the MCP integration and reopening the app did not expose a target in this workspace on 2026-11-28. The cloud simulator service returned that simulators are not available in the `freesia` region; the approved 10-minute budget remained unused.

**Why:** Passing CSV formatting tests does not prove that the native share sheet opens on Android or iOS.

**How to apply:** Check for an actual Expo MCP device target before claiming native verification. If none exists and cloud simulators are region-blocked, keep native acceptance criteria pending and report exactly which automated checks passed. After workflow restarts, inspect listeners before retrying if Metro/API fail with `EADDRINUSE`; old dev processes can survive the workflow restart.
