# FlyRank Capstone — AI Image Understanding & Content Matching Engine

> wayfinder:map · status: open · tracker: local-markdown (this directory)

## Destination

The capstone is submitted: `PSergio984/flyrank-capstone-image-relevance` passes all six acceptance probes from Section 13 of the brief, every Section 6 requirements box carries pasted proof in EVIDENCE.md, and the repo link is pasted into the portal submission form. This map ends when no decision remains open before building and submitting.

## Notes

- **Domain**: vision-AI backend — Gemini Flash classifies ~45 images into validated tag JSON; captions and post text are embedded into one semantic space; a mismatch guard (tags + similarity threshold + confidence) rejects wrong pairings with explanations before a human sees them.
- **Locked decisions** (charting session): destination = submitted capstone · fresh dedicated repo (this one) · Node.js + Express · Gemini Flash free tier for vision + embeddings · core Section 6 boxes only, stretch goals out of scope · tracker = this local-markdown directory.
- **Standing preferences**: user communicates tersely — keep narration compact. Interview defense is the standing goal: every build choice must stay explainable by the user in 2–3 lines. Windows / PowerShell 5.1 (no `&&`). Node ≥18 (local: v22). $0 iron rule — anything asking for a credit card is the wrong path. Never trust invalid model output. Evidence pasted as you go; at least one meaningful commit per working session.
- **Skills**: when working any grilling ticket, call the Skill tool twice — "grilling" and "domain-modeling". Prototype tickets call "prototype". Research tickets call "research".
- **Brief**: local PDF at `C:\Users\admin\Downloads\AI Image Understanding Live Capstone.pdf` (11 pages: §6 contract, §7 scope, §8 phases, §10 $0 stack, §11 required files, §13 probes). Extracted text indexed in the knowledge base under source `capstone-pdf`.
- **Ticket conventions** (local tracker): each file in `tickets/` carries front-matter with `label`, `status`, `assignee`, `blocked-by`. Claiming = setting `assignee` first. Blocked-by uses ticket ids; a ticket is on the frontier when open, unassigned, and all `blocked-by` are closed.

## Decisions so far

<!-- one line per closed ticket; zoom the linked ticket for detail -->

- [Research Gemini Flash — image understanding, structured output, embeddings](tickets/02-research-gemini-apis.md): findings on branch `research/gemini-apis` — Flash vision free via `@google/genai`; JSON mode requires mandatory Zod validation; embed with `gemini-embedding-001` at 768 dims + manual L2 norm; persist model+dims per vector; batch fits free tier with pacing + backoff.
- [Corpus strategy — where the images come from and how they live in the repo](tickets/03-corpus-strategy.md): commit ≤800px corpus (~3–6 MB) AND deterministic fetch script, anchored by a provenance/licensing manifest; animal set engineered with fox/wolf/husky lookalikes.
- [Where do the blog posts come from?](tickets/04-posts-source.md): 12 hand-written seed posts in `seed/posts/`, including ≥2 deliberately matchless and ≥2 boundary-strainer posts.
- [Which runner carries the background batch jobs?](tickets/05-batch-runner.md): pg-boss on the existing Postgres — idempotent natural-key jobs, per-call cost ledger rows written in-handler, budget guard, SQL-visible progress.
- [What is the image metadata schema the vision model must return?](tickets/06-metadata-schema.md): shallow strict schema, coarse `category` enum + fine `subject` for guard discrimination; Zod safeParse is the only trust boundary; confidence <0.70 flags instead of accepting; repair-once then quarantine.
- [How are image and post vectors embedded and stored?](tickets/07-embeddings-and-vectors.md): `gemini-embedding-001` @ 768 dims, SEMANTIC_SIMILARITY, manual L2 norm; plain `real[]` columns persisting model+dims; cosine computed in Node over ~50 rows.
- [What exactly makes a suggestion good enough? (mismatch guard rules)](tickets/08-mismatch-guard-rules.md): eligibility filter → taxonomy conflict gate (post expectations from a cached post-classification stage, never eval labels) → similarity gate → confidence gate; sweep-based threshold selection with zero-known-bad-acceptances constraint; versioned verdict/reasons response shape.

## Not yet specified

- Actual similarity-threshold values and the defended top-1 precision number — graduate once the labeled eval set exists and the sweep has run.
- Vision prompt wording and reliability quirks (flag-rate behavior on real batches) — graduates after the first real pipeline runs.
- Seed + run story details (compose service layout beyond Postgres, seed command shape) — graduates once batch runner and data model are chosen.
- Eval-set growth policy during tuning ("grow slightly as you go") — graduates when the first real precision numbers exist.
- Live free-tier RPM/RPD verification and structured-output refusal payload shape — one cheap verification pass during pipeline implementation.

## Out of scope

- All five Section 9 stretch goals (alt text generation, near-duplicate detection, fallback image generation, HITL agent QA, extended test suite) — brief allows stretch only after every box is green; a separate future effort.
- Comparing multiple vision or embedding models — brief calls it stretch, not core.
- Any frontend beyond validated endpoints / admin table — brief explicitly requires none.
- Anything paid — the $0 rule is absolute.
- A17 and other assignment work in the old `flyrank-capstone` repo.
