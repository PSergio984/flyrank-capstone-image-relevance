# Design — AI Image Understanding & Content Matching Engine

One-page design doc (brief Phase 1 gate). Decisions carry full rationale in
`.planning/capstone-map/` — this page is the map at a glance.

## Problem

Given ~45 licensed images and 12 blog posts, match each post the right image —
by meaning, not keywords — and refuse to guess when nothing fits. The wolf never
illustrates the fox post; a post with no fitting image gets an explicit
"no confident match" with reasons.

## Data model

`images` (corpus + vision metadata, status machine) · `posts` (+cached
classification expectations) · `embeddings` (model+dims persisted per row) ·
`suggestions` (every guard answer, auditable) · `review_events` (human-only,
append-only) · `ai_cost_log` (one row per AI call) · `pipeline_stages`
(progress + retry idempotency). Migrations via node-pg-migrate; Postgres 16 in
compose.

## API surface

Public: `GET /health`, `GET /posts/:id/images` (ranked suggestions or refusal),
`GET /images/:id` (why-trail), `POST /suggestions/:id/approve|reject`.
Admin (`ADMIN_TOKEN`): `POST /admin/probes/force-candidate`,
`POST /admin/jobs/vision-batch | embeddings-batch | classify-posts`,
`GET /admin/pipeline`. Zod validates every boundary input.

## Layer sketch

```
HTTP (routes, Zod boundary, status mapping)
  └─ services (guard gates, ranking, job orchestration)
       ├─ repository (all SQL lives here)
       ├─ gemini clients (vision / embeddings / post_classify, versioned prompts)
       └─ pg-boss workers (retries, per-call cost rows, budget guard)
            └─ Postgres (compose `db`)
```

The guard: eligibility pool → taxonomy conflict gate → similarity gate →
confidence gate. Per-candidate verdicts aggregate into ranked suggestions or a
reasoned NO_CONFIDENT_MATCH. Thresholds come only from sweeping the labeled eval
set (`eval/set.json`) under a zero-known-bad-acceptances constraint; the chosen
operating point is published in this README's successor section and pinned in
`config/thresholds.json`.

## Models

Vision: `gemini-2.5-flash` (live-API verified). Embeddings:
`gemini-embedding-001`, taskType SEMANTIC_SIMILARITY, 768 dims, manual L2 norm.
Every model response passes Zod safeParse regardless of API JSON mode;
low-confidence (<0.70) flags instead of accepting; one repair retry then
quarantine.

## Explicit non-goal

No frontend beyond validated endpoints/admin surfaces, no model comparison, no
stretch goals (alt text, dedupe, generation) until every Section 6 box is green.
