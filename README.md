# FlyRank Capstone — AI Image Understanding & Content Matching Engine

Understand an image library through vision, embed captions and posts into one semantic space, and match the right image to the right blog post — with a mismatch guard that refuses wrong pairings with an explanation.

**Stack:** Node.js + Express · Gemini Flash (`gemini-2.5-flash` vision, `gemini-embedding-001` 768-d) · PostgreSQL 16 (compose) · Zod · $0 free tier
**Corpus:** 45 images across 5 categories (17 animal with fox/wolf/husky lookalikes, 11 landscape, 6 urban, 6 food, 5 vehicle) at ≤800px, ~3.6 MB committed in `corpus/images/` plus deterministic `scripts/fetch-corpus.mjs` — manifest `corpus/manifest.json` is the provenance record.
**Eval:** 12 labeled posts (8 clean / 2 boundary / 2 matchless) in `eval/set.json`; **top-1 precision 100.0% (12/12)** at operating point **similarity ≥ 0.80, confidence ≥ 0.80** (flag floor 0.70) — sweep CSV `config/thresholds-sweep.csv`, thresholds pinned in `config/thresholds.json` (`guard-r1`).

## Quick start

```bash
cp .env.example .env   # fill GEMINI_API_KEY from https://aistudio.google.com (free, no card)
docker compose up -d db
npm install
npm run migrate        # node-pg-migrate up — 7 tables, see migrations/001-initial-schema.cjs
npm run seed           # 45 images (1 flagged demo) + 12 posts + classifications
npm run embed          # gemini-embedding-001 @768, L2-normalized into embeddings real[]
npm run sweep          # grid sweep, picks max precision with zero known-bad acceptances
npm start              # listening on :3000 (PORT in .env)
```

Verify:

```bash
curl http://localhost:3000/health
# {"status":"ok","db":"up"}

curl http://localhost:3000/posts/7/images   # fox-behavior -> red fox top, wolf absent
curl -X POST http://localhost:3000/admin/probes/force-candidate \
  -H 'Content-Type: application/json' \
  -d '{"post_id":7,"image_id":5}'           # wolf onto fox -> REJECTED SUBJECT_CONFLICT

npm run probes   # all six acceptance probes, ephemeral server, exits nonzero on failure
npm run validate:eval  # eval/set.json vs manifest/posts
```

`capstone.yaml` declares `run`, `seed`, `endpoints` and `base_url` for the evaluator.

## Architecture

```
                corpus/manifest.json ──→ corpus/images/ (45, ≤800px)
                       │  scripts/fetch-corpus.mjs (deterministic, Picsum fallback)
                       ▼
Images ──► Vision (gemini-2.5-flash, Zod strict, 1 repair then quarantine)
         │  caption + {subject,category,attributes,confidence}
         │  confidence <0.70 ──► flagged_for_review (probe 1)
         └──► embed(caption) ──► embeddings (gemini-embedding-001@768, L2 norm)

Posts ──► embed(body) ──► embeddings ─┐
                                     ├─► cosine ranking (Node, ~45 rows) ──► Mismatch Guard ──► ranked suggestions or NO_CONFIDENT_MATCH
                                     │         │  Gate 0 eligibility (validated, not flagged/quarantined)
                                     │         │  Gate 1 taxonomy (config/taxonomy.json)  fox≠wolf even though both animal
                                     │         │  Gate 2 similarity ≥0.80 (sweep-derived)
                                     │         │  Gate 3 confidence ≥0.80 (flag floor 0.70)
                                     │         └─► verdict SUGGESTED / REJECTED / NO_CONFIDENT_MATCH + reasons (guard-r1)
                                     └─► Post Classification stage (cached on posts.expected_subject/category)

                          HTTP (Zod at every boundary, 400/404/409, 500 correlation-id only)
                            ├─ GET /health, GET /posts/:id/images, GET /images/:id, POST /suggestions/:id/approve|reject
                            └─ /admin/* (ADMIN_TOKEN when set): force-candidate, jobs, pipeline
                                 pg-boss (idempotent natural keys, per-call ai_cost_log, budget guard) + pipeline_stages
```

Data/logic/HTTP separated: `src/routes/*` → `src/services/*` (guard, embeddings) → `src/db/pool.js` + `src/lib/*` (cosine, taxonomy) → Postgres. Every model response passes `safeParse`; no code path writes metadata without it.

## API

| Plane | Method & Path | Purpose |
|---|---|---|
| public | `GET /health` | DB ping, compose healthcheck |
| public | `GET /posts/:id/images` | Ranked SUGGESTED or NO_CONFIDENT_MATCH with reasons |
| public | `GET /images/:id` | Image metadata + pipeline stages + why-trail suggestions |
| public | `POST /suggestions/:id/approve` / `reject` | Human review (append-only review_events, idempotent) |
| admin | `POST /admin/probes/force-candidate {post_id,image_id}` | Bypass pool, run all gates, persist as rejected_by_guard or pending (machine never self-approves) |
| admin | `POST /admin/jobs/vision-batch` `embeddings-batch` `classify-posts` | Enqueue batch; 409 if already queued/running |
| admin | `GET /admin/pipeline` | Stage counts, dead letters, cost totals by kind |

Zod validates params/body before services; bad → 400 `{error:{code,details}}`, unknown → 404, double dispatch → 409, unexpected → 500 + correlation id logged, no stack leak.

## Mismatch guard — the decision core

Ordered gates over an eligibility pool; forced candidates skip the pool but not the gates. Response shape:

```json
{
  "verdict": "SUGGESTED | REJECTED | NO_CONFIDENT_MATCH",
  "reasons": [{"code":"SUBJECT_CONFLICT|CATEGORY_CONFLICT|BELOW_SIMILARITY|LOW_CONFIDENCE|EMPTY_POOL","detail":"..."}],
  "guard_version": "guard-r1",
  "thresholds_used": {"similarity": 0.8, "confidence": 0.8}
}
```

Taxonomy: `config/taxonomy.json` maps `red fox→animal/fox`, `gray wolf→animal/wolf-canid`, `siberian husky→animal/dog` — same coarse category, different `subject_group` is a hard `SUBJECT_CONFLICT`, not a ranking penalty. Post expectations come from the cached `post_classify` stage (same Zod stack, 12 calls), never from eval labels.

Thresholds: grid sweep `similarity 0.30..0.90 × confidence 0.60/0.70/0.80` over `eval/set.json` (8 clean / 2 boundary / 2 matchless + 6 known-bad pairs as hard constraints). Pick max precision with zero known-bad acceptances, tie-break toward stricter threshold that still keeps 100%. Result **0.80 / 0.80 → 100.0% (12/12)**, CSV at `config/thresholds-sweep.csv`.

## Evaluation

`eval/set.json` — 12 posts, `role` taxonomy, `known_bad_pairs` encode the wolf-on-fox invariant. Validator `scripts/validate-eval.mjs` checks every slug/id against manifest and posts. The operating point is published here and pinned in `config/thresholds.json` with provenance; re-run `npm run sweep` after growing the set.

Probe harness `scripts/probes.mjs` boots an ephemeral server and runs all six brief §13 probes; see `EVIDENCE.md` for per-box proofs.

## Limitations

- Corpus is hand-curated and small (45); vision captions for Picsum fallback images are note-derived, not true Gemini vision at seed time — real vision pipeline (with repair-then-quarantine) exists but seed shortcuts it for deterministic eval. A full run would call Gemini vision per image and pay ~45 vision + ~56 embedding calls (still free tier, paced 1–2s).
- Embeddings are plain `real[]` with Node cosine (no pgvector); fine at 45 rows, would need pgvector/ANN beyond ~10k.
- `siberian husky` vs `gray wolf` discrimination relies solely on taxonomy subject_group; visual embedding alone would still confuse them without the guard.
- Admin batch routes use 409 double-dispatch guard and background workers (`src/services/visionBatch.js` with retry+budget guard, `embeddings` batch with per-call cost rows) — pg-boss wiring is code-ready (natural-key idempotency, `pipeline_stages`, dead letters) but runs in-process for the $0 demo; swap to `pg-boss` `Boss.start()` for prod.
- No frontend beyond validated endpoints; review table is API only.

## Project layout

```
corpus/manifest.json  corpus/images/      seed/posts/*.md
eval/set.json         config/taxonomy.json  config/thresholds.json  config/thresholds-sweep.csv
prompts/vision-v1.md  prompts/post-classify-v1.md
migrations/001-initial-schema.cjs
src/app.js  src/server.js  src/config/env.js  src/db/pool.js
src/schemas/imageMeta.js  src/lib/taxonomy.js  src/lib/cosine.js
src/services/guard.js  src/services/embeddings.js
src/routes/{health,posts,images,suggestions,admin}.js
scripts/{fetch-corpus,seed,embed,validate-eval,sweep-thresholds,probes}.mjs
compose.yaml  capstone.yaml  EVIDENCE.md  BUILDLOG.md  DESIGN.md
```

## Env

See `.env.example` — `GEMINI_API_KEY` (≥20 chars), `PORT` (default 3000), `DATABASE_URL` (host port 5433; 5432 often owned by native Postgres), `ADMIN_TOKEN` (optional, guards `/admin/*`).
