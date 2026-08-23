---
name: Windows display connection enum
description: WmiMonitorConnectionParams uses D3DKMDT_VIDEO_OUTPUT_TECHNOLOGY values for physical connector detection.
---

For `WmiMonitorConnectionParams.VideoOutputTechnology`, HDMI is `6`, DVI is `5`, external DisplayPort is `11`, embedded DisplayPort is `12`, and Miracast is `16`.

**Why:** Treating these values as positional or using an incomplete mapping can report an HDMI monitor as DisplayPort, especially in mixed-connector multi-monitor setups.

**How to apply:** Keep connector labels sourced from the corrected enum mapping and preserve unknown raw values in diagnostics rather than guessing.