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

## Not yet specified

- Actual threshold values and the defended top-1 precision number — graduates once the labeled eval set exists and the guard's rules are fixed.
- Vision prompt wording and reliability quirks (flag-rate behavior on real batches) — graduates after the first real pipeline runs.
- Exact structure/phrasing of "no confident match" reasons — graduates with the guard rules ticket.
- Seed + run story details (compose service layout) — graduates once batch runner and data model are chosen.
- Eval-set growth policy during tuning ("grow slightly as you go") — graduates with eval-set construction.
- The image-gathering work ticket (AFK) that the corpus strategy decision will spawn.
- Eval-set construction ticket (HITL labeling) — sharpens once posts source and corpus strategy are decided.

## Out of scope

- All five Section 9 stretch goals (alt text generation, near-duplicate detection, fallback image generation, HITL agent QA, extended test suite) — brief allows stretch only after every box is green; a separate future effort.
- Comparing multiple vision or embedding models — brief calls it stretch, not core.
- Any frontend beyond validated endpoints / admin table — brief explicitly requires none.
- Anything paid — the $0 rule is absolute.
- A17 and other assignment work in the old `flyrank-capstone` repo.
