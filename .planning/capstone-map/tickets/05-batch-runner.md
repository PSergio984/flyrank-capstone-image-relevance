---
id: 05
title: Which runner carries the background batch jobs?
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: []
blocks: ["09"]
---

## Question

Vision and embedding calls must run as background jobs with retries, progress tracking, per-call cost tracking, and idempotency (shared requirement #5: the retried action happens once). Candidates:

- **BullMQ + Redis** — A17 already ran Redis via compose; familiar ground, extra service.
- **pg-boss** — Postgres-only queue; one less container; fits the "real persistence" story.
- **Plain DB-backed worker loop** — simplest, but hand-rolls retry/visibility semantics.

Decide the runner, and with it: how a cost row is attributed per AI call, what the retry/backoff policy is, and how job progress is observed.

## Resolution

**Decision: pg-boss on the existing Postgres — one persistence story, zero extra containers.**

- Queue, retries (5 attempts, exponential backoff), visibility timeouts, and dead-letter handling all live in Postgres via pg-boss; `compose.yaml` gains no new service. Migrations already cover the database — the queue schema rides the same migration story as every table (shared requirement #4).
- SQL-visible job state is the interview-defense win: "show me retries are happening" is a SELECT, not a Redis CLI session.
- **Idempotency**: job names carry natural keys (`vision-process:<image_id>`, `embed-image:<image_id>`); pg-boss singleton/dedup options plus a unique pipeline-stage row make a retried job write exactly once (shared requirement #5). AI calls only fire after an idempotency check of stage status.
- **Cost attribution** (shared requirement #7): every AI call writes one `ai_cost_log` row inside the handler — `{job_id, kind: vision | embedding | post_classify, model, input_tokens, output_tokens, cost_usd}` — before the job acknowledges; a budget guard sums the ledger and refuses new batches past a configurable cap.
- **Progress**: per-image pipeline-stage status column + boss queue counts, exposed read-only via admin endpoint.

Rejected: BullMQ + Redis (second persistence system to defend, extra container, no defense advantage at this scale); bare DB worker loop (hand-rolled retry/visibility semantics — weakest thing to whiteboard under pressure).
