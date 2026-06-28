---
name: Community feed pagination contract
description: How the GAB Community feed paginates — server cursor=offset with a hard limit cap; client must use infinite-query cursor accumulation, not limit-growth.
---

# Community feed pagination

`GET /api/community/posts` treats `cursor` as an **offset** and **caps `limit` at 30**
server-side. It returns `{ posts, nextCursor }` where `nextCursor = hasMore ? offset + limit : null`.

**Rule:** the client feed must paginate with cursor accumulation (TanStack
`useInfiniteQuery`, `getNextPageParam: last => last.nextCursor ?? undefined`), NOT by
growing a single `limit` param.

**Why:** a limit-growth "load more" silently breaks past 30 — the server clamps the
limit, so it keeps returning the same first 30 rows while `hasMore` can stay true. This
cost a review cycle.

**How to apply:** when extending the feed (new filters, "load more", auto-scroll), keep
the `useInfiniteQuery` cursor pattern. Feed cache shape is `{ pages: [{posts}] }` — any
optimistic cache write must account for that; PostCard avoids this by tracking
likes/views in local React state and only invalidating the feed key by prefix
(`["/api/community/posts"]`).
