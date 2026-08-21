---
name: Cleaner accuracy boundary
description: Durable rules for filesystem cleanup accounting and leaving an active Cleaner operation.
---

Cleaner must report only bytes and files removed after successful deletion. Recycle Bin cleanup must measure the same filesystem-drive scope before and after the operation, and remaining data should make the result partial rather than successful.

**Why:** Pre-delete estimates overstate cleanup when files are locked, permissions fail, or Windows recreates data during the operation.

**How to apply:** Keep scan estimates separate from clean results; verify the same item scope before persisting history. When Cleaner is scanning or cleaning, route changes must be claimed synchronously by the page and resolved through one confirmation dialog so cancel/close preserves state and confirm cancels without false success.