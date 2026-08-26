---
id: 05
title: Which runner carries the background batch jobs?
label: wayfinder:grilling
hitl: true
status: open
assignee:
blocked-by: []
blocks: []
---

## Question

Vision and embedding calls must run as background jobs with retries, progress tracking, per-call cost tracking, and idempotency (shared requirement #5: the retried action happens once). Candidates:

- **BullMQ + Redis** — A17 already ran Redis via compose; familiar ground, extra service.
- **pg-boss** — Postgres-only queue; one less container; fits the "real persistence" story.
- **Plain DB-backed worker loop** — simplest, but hand-rolls retry/visibility semantics.

Decide the runner, and with it: how a cost row is attributed per AI call, what the retry/backoff policy is, and how job progress is observed.
