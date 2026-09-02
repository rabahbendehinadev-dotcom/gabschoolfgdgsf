---
name: Community upload receipts
description: Security boundary for attaching protected Community uploads to posts.
---

Community post creation must accept media only with a short-lived HMAC receipt binding the object path, uploader user ID, verified MIME type, and byte size. Original attached media is VIP-locked; unsafe document types download rather than render inline. Never restore the retired direct presigned-upload endpoint, and never negative-cache “not Community media” authorization decisions.

**Why:** An object can exist before its Community media row. A negative cache can therefore be warmed before association, while an unconstrained presigned PUT or client-declared MIME can bypass proxy validation and create a same-origin active-content path.

**How to apply:** Route new Community media through the authenticated validation proxy, verify magic bytes and per-kind limits, require receipts for both original and preview paths, ignore client-provided derived-object paths, and query current ownership state before generic object serving.