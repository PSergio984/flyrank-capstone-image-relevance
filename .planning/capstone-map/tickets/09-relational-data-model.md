---
id: 09
title: What is the relational data model?
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: ["06", "07", "05"]
blocks: ["10"]
---

## Question

Shared requirement #4 wants real persistence: schema as migrations, right indexes. Tables needed for images, tags, embeddings, posts, suggestions, approvals/rejections.

This ticket ALSO owns the persistence bootstrap nothing else covers: the `compose.yaml` Postgres service (fresh repo — no infra exists yet) and the migration runner choice.

Decide table shapes and relations, the indexes the query patterns actually need, idempotency representation for retried jobs (unique job keys?), and the per-call cost ledger's shape (shared requirement #7: attributed per call, budget guard).

## Resolution

**Decision: seven tables, migrations via node-pg-migrate, Postgres service declared in compose — persistence bootstrap included.**

- **Infra bootstrap**: `compose.yaml` declares one `db` service (postgres:16-alpine, volume, healthcheck); the API runs on host during dev, in compose for the final run story. Migrations: **node-pg-migrate** (industry-standard, up/down, interview-familiar) with files under `migrations/`; `npm run migrate` is part of the documented setup sequence.
- **Tables**:
  - `images(id pk, file_path unique, source_url, license, photographer, category, subject, caption, confidence numeric(3,2), flagged bool default false, status check in ('pending','processed','flagged','quarantined'), created_at)` — manifest fields live here; status machine makes quarantine/flag states queryable.
  - `posts(id pk, slug unique, title, body, expected_subject, expected_category, classify_confidence, classified_at null)` — classification cache columns nullable until the post_classify job runs.
  - `embeddings(entity_type check in ('image_caption','post_body'), entity_id, model, dims int, vector real[], normalized bool, primary key(entity_type, entity_id, model))` — per *embeddings & vectors*: model+dims persisted per row.
  - `suggestions(id pk, post_id fk, image_id fk, score numeric, verdict text, explanation text, reasons jsonb, guard_version text, thresholds_used jsonb, status check in ('pending','approved','rejected','rejected_by_guard'), created_at, unique(post_id, image_id, guard_version))` — every guard answer is an auditable row; the unique constraint IS the review-workflow idempotency.
  - `review_events(id pk, suggestion_id fk, action check in ('approve','reject'), actor, created_at)` — append-only audit of human decisions.
  - `ai_cost_log(id pk, job_id, kind check in ('vision','embedding','post_classify'), model, input_tokens, output_tokens, cost_usd numeric(10,6), created_at)` + index on `(kind, created_at)`; budget guard = SUM over window vs configured cap, checked before dispatching new batch work.
  - `pipeline_stages(image_id fk, stage check in ('vision','embedding'), attempt int, status check in ('queued','running','done','failed','dead'), error text, updated_at, primary key(image_id, stage))` — progress observation + idempotency: a job claims its stage row first; retried job sees `done` and exits without re-calling AI. Failure alert = dead-letter stage rows surfaced by admin endpoint (shared requirement #3).
- **Indexes**: `images(flagged) where flagged`, `images(status)`, `suggestions(post_id, status)`, `ai_cost_log(created_at)`, plus PKs above covering point lookups. Every index traces to a named query pattern (ranking pool, flag list, cost report, review queue) — nothing speculative.
- **Layering note** (shared requirement #1): repository modules own SQL; services own gates/jobs; HTTP owns validation/status mapping. Data/logic/HTTP separation falls out of this table contract.
