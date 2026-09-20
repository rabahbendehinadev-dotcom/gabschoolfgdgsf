---
name: Managed banner media lifecycle
description: Reliability rules for replacing/deleting managed banner images and reordering banners.
---

Banner metadata changes and object-storage deletion cannot be one atomic transaction. Removed or replaced image paths must be queued transactionally with the database mutation, then deleted from storage by a retryable cleanup process.

**Why:** Immediate best-effort deletion can permanently orphan objects after storage failures. Concurrent replacement can also leave the losing upload unreferenced unless row locking and queued cleanup are used.

**How to apply:** For managed banner media, enqueue retired paths in the same DB transaction that removes their references. Serialize create/reorder operations with one advisory lock, enforce unique order values, and move rows into a temporary range above the current maximum before assigning final positions.