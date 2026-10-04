---
name: R2 release object retention
description: Keep prior SwitchControl installer versions available when publishing a new release.
---

Never empty the `switchcontrol-releases` R2 bucket during release preparation. The release uploader writes versioned installer filenames and does not delete older objects. The bucket lifecycle policy only aborts incomplete multipart uploads; it does not expire completed installers. Cloudflare audit history recorded successful “Delete Objects or Empty a Bucket” actions near release uploads, but those records do not identify the individual object keys.

**Why:** The bucket currently has the 1.3.3 installer but not 1.3.2, and successful bucket-level delete operations occurred shortly before the 1.3.3 upload. This is stronger evidence than the earlier lifecycle-expiration hypothesis, though the logs cannot prove which keys were removed.

**How to apply:** Before each release, verify that the previous versioned installer remains in the bucket. Upload the new versioned installer and metadata without bucket-wide cleanup, and retain a backup before any targeted deletion.