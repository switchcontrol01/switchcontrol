---
name: PowerShell JSON collection shapes
description: PowerShell ConvertTo-Json can collapse one-item collections when objects cross the JSON boundary.
---

When PowerShell probe output is parsed in JavaScript, accept both an array and a scalar for fields that represent collections.

**Why:** ConvertTo-Json can serialize a one-item collection as a scalar property. Assuming arrays causes a single active network profile to be ignored and can produce a false fallback result.

**How to apply:** Normalize scalar-or-array probe fields before filtering or evaluating them; keep missing and malformed values distinct from explicit false values.