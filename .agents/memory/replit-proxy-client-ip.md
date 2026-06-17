---
name: Replit proxy client IP / X-Forwarded-For
description: How to get a trustworthy client IP behind the Replit edge proxy, and why XFF is not spoofable here.
---

# Trustworthy client IP behind the Replit proxy

The Replit edge proxy **strips any client-supplied `X-Forwarded-For`** and
replaces it with the true client chain before the request reaches the app. The
backend port (e.g. 8080) is only reachable through the mTLS edge proxy — never
directly from the internet (the socket `remoteAddress` seen by the app is
`127.0.0.1`).

**Rule:** with Express `app.set("trust proxy", true)`, `req.ip` is the genuine,
non-spoofable client IP. Use `req.ip` directly. Do NOT manually read the raw
`X-Forwarded-For` header and take its leftmost value — that would be the only
client-controllable vector (and only on a hypothetical direct connection).

**Why:** a code review flagged `X-Forwarded-For` spoofing as a security gap for
an IP-based access control. Empirically probing the live proxy (forged
`X-Forwarded-For: 1.2.3.4` headers were discarded; `req.ip` stayed the real
client IP) proved the edge sanitizes XFF, so `trust proxy: true` is safe.

**How to apply:** for any IP-based logic (rate limits, device/IP restrictions,
audit logging), rely on `req.ip` with `trust proxy` enabled. Do **not** set a
fixed numeric `trust proxy` hop count to "harden" it — the observed internal hop
IPs and chain length vary per request and can differ between dev and deployment,
so a fixed count risks breaking IP detection for all real users with no security
benefit.
