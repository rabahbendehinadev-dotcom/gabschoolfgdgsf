---
name: Community upload receipts
description: Security boundary for attaching protected Community uploads to posts.
---

Community post creation must accept media only with a short-lived HMAC receipt binding the object path, uploader user ID, verified MIME type, and byte size. Original attached media is VIP-locked; unsafe document types download rather than render inline. Never restore the retired direct presigned-upload endpoint, and never negative-cache “not Community media” authorization decisions. Community uploads need a permanently private namespace, and deleting posts or users must remove every unshared original, preview, and thumbnail before deleting DB protection metadata.

**Why:** An object can exist before its Community media row. A negative cache can therefore be warmed before association, while an unconstrained presigned PUT or client-declared MIME can bypass proxy validation and create a same-origin active-content path. If a cascade removes media rows but leaves objects, a retained generic-storage URL can become public after its authorization metadata disappears.

**How to apply:** Route new Community media through the authenticated validation proxy into a namespace that generic object routes always reject. Verify magic bytes and per-kind limits, require receipts for original and preview paths, ignore client-provided derived-object paths, query all media variants before generic serving, and clean storage before author/admin/cascade deletion.