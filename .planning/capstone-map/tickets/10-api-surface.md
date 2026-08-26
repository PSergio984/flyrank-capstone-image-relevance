---
id: 10
title: What is the API surface?
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: ["08", "09"]
blocks: ["12"]
---

## Question

The full endpoint list and contracts: ranked suggestions for a post, the review workflow (approve / reject / inspect why an image was selected or refused), a forced-candidate path so Probe 3 can push the wolf at the fox post, health. Validation-at-boundary rules (bad input → clean 4xx, never a 500). Must align with what capstone.yaml will list as probeable endpoints.

## Resolution

**Decision: eight routes in two planes — public read/review, admin operations behind optional ADMIN_TOKEN.**

Public plane:

- `GET /health` — liveness + one DB ping; the compose healthcheck target.
- `GET /posts/:id/images` — builds the eligible pool, runs the guard, returns `{verdicts: [...], no_confident_match?: {reasons}}`: ranked SUGGESTED entries (best first, each with explanation) plus the explicit refusal with reasons when nothing clears. Probes 2 and 4 live here.
- `GET /images/:id` — full metadata, pipeline status, and the why-trail: every suggestion row referencing this image with verdict/explanation/reasons. The inspect-why requirement.
- `POST /suggestions/:id/approve` · `POST /suggestions/:id/reject` — human review workflow; appends `review_events`; re-posting the same action returns current state (200) rather than erroring — workflow idempotency.

Admin plane (`Authorization: Bearer $ADMIN_TOKEN` when set; open without it in dev so probes stay simple):

- `POST /admin/probes/force-candidate` `{post_id, image_id}` — feeds ANY pair through all three gates directly and persists the outcome: refusal → suggestion row with status `rejected_by_guard`; pass → suggestion row with status `pending`, entering the normal human review flow (the machine never self-approves; `review_events` is written only by human actions). Probe 3's mechanism.
- `POST /admin/jobs/vision-batch` · `/embeddings-batch` · `/classify-posts` — enqueue batch work through pg-boss; 409 if a batch for that stage is already queued/running (no double-dispatch).
- `GET /admin/pipeline` — stage counts, dead-letter rows (the failure alert surface), and cost-ledger totals by kind. Probe 6 evidence reads from here or the ledger directly.

**Boundary rules** (shared requirement #2): every route validates params/body via Zod before touching services — bad input → `400 {error: {code, details}}`; unknown route → clean 404; conflicts → 409; unexpected faults → 500 with correlation id only, detail logged server-side. No stack traces cross the boundary; services never see raw req objects.

**capstone.yaml alignment**: `endpoints:` lists the five probeable surfaces (health, posts/:id/images, images/:id, force-candidate, admin/pipeline); `run:` = compose boot + migrate + seed, decided concretely in the build phase per the seed/run fog note.
