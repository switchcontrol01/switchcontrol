---
name: NVIDIA safety boundary
description: Safety rules for preventing SwitchControl actions from breaking NVIDIA App or NVIDIA driver functionality.
---

NVIDIA-related actions must fail closed. New Tweaks actions must not disable NVIDIA services or scheduled tasks, the generic Installed Apps remover must protect NVIDIA/GeForce/PhysX identities by name and publisher, Cleaner must not delete NVIDIA shader or installer-cache paths, and MSI-mode changes must not write NVIDIA display-adapter settings.

**Why:** NVIDIA App, Control Panel, driver configuration, update flows, and display behavior can depend on services and scheduled tasks that look like vendor helpers. The application cannot safely infer that an NVIDIA service or wildcard task is disposable without a real Windows dependency check.

**How to apply:** Preserve one-way recovery for legacy states by re-enabling previously disabled NVIDIA tasks/services when explicitly reverting an older action, but never include NVIDIA targets in new disable lists. Validate the packaged Windows build on a real NVIDIA system before making safety claims.