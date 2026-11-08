---
name: Expo preview timing
description: A first browser preview can be captured before Expo has finished its initial web bundle.
---

When validating a freshly restarted Expo workflow, confirm Metro has completed the first web bundle before relying on a browser screenshot. A capture started at the same time as the restart/log check can show a blank page even though Metro finishes bundling shortly afterward.

**Why:** The initial screenshot raced the Expo web bundler; later workflow logs showed the app bundles completed with no runtime error.

**How to apply:** Wait for the first `Web Bundled` log before capturing a preview. Do not diagnose a blank early capture as an app crash without checking the workflow logs.
