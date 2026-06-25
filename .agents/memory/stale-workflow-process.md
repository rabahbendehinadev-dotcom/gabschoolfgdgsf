---
name: Stale/orphan workflow process serves old code
description: When a workflow restart doesn't reflect your code edits, suspect a duplicate/orphan process still bound to the port.
---

# Workflow restart didn't pick up my edits

Symptom: after editing server source and restarting its workflow, the running
server still serves **old** behavior (missing new fields, 404 on new routes),
even though the edits are confirmed on disk and typecheck clean.

Root cause seen: a **second, older process tree** (from an earlier session/start,
predating your edits) was still alive and holding the port. `restart_workflow`
started a fresh process, but the orphan kept answering on the port, so requests
hit stale code.

**Why:** the workflow manager only tracks the process it spawned; an orphan
started outside that lifecycle is invisible to it and is not killed on restart.

**How to apply:** if a restart doesn't reflect on-disk edits, run
`ps aux | grep <entrypoint>` (e.g. `src/index.ts`). If you see two process trees
with different start times, the older one (started before your edit mtime) is the
culprit. `kill -9` the orphan tree, then `restart_workflow` so a single clean
process binds the port. Verify with one process tree + a quick curl. Compare the
process start time against the file mtime (`stat -c '%y'`) to identify the stale one.
