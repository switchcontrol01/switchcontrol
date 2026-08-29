---
name: Restore point antivirus interference
description: Real Windows testing showed third-party antivirus can prevent the required restore point from being created.
---

The restore-point prerequisite can fail because third-party antivirus software blocks the PowerShell/System Protection operation. When that happens, the app should stop the tweak batch and report that no changes were made; disabling or allowing the operation in the security product allowed the same flow to continue during testing.

**Why:** A restore-point error can look like a SwitchControl or weak-hardware failure even when the native command is correct. The screenshot from the August 30, 2026 Windows test showed this exact pattern.

**How to apply:** When reproducing restore-point failures on Windows, check security-product blocks and allowlisting/UAC policy before changing tweak logic. Do not recommend leaving antivirus disabled as a general workaround.