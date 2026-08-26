---
id: 08
title: What exactly makes a suggestion good enough? (mismatch guard rules)
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: ["06", "07"]
blocks: ["10"]
---

## Question

The guard is the capstone's decision core. Note the trap: fox and wolf share category `animal` — category equality alone cannot reject the wolf-on-fox-post case. Probe 3 demands exactly that rejection with an explanation.

**Scope of this ticket's outputs**: the guard's rule structure (gates, their order, their inputs), the threshold SELECTION METHOD (procedure, not numbers), rejection explanation formats, and the "no confident match" response shape. Numeric threshold VALUES are explicitly out of scope here — they are produced by running the selection method against the eval set during build, and remain fog on the map until then.

Fix: decision order and inputs (subject-level semantics vs category vs similarity score vs confidence) — including how a post's expected subject is established at runtime; where each threshold comes from (selection method: sweep on the labeled eval set, pick the operating point, defend with precision — never guessed); rejection explanation string formats; the "no confident match" response shape with its reasons.

## Resolution

**Decision: three ordered gates over an eligibility filter, with post-side expectations from a classification stage — never from eval labels.**

**Post expectations at runtime**: each post passes through a text-classification batch job (`post-classify-v1` versioned prompt, same Zod validation stack, result cached on the post row) producing `{subject, category, confidence}`. Runtime knows the fox post expects *red fox* because a model read the post — eval labels stay out of production code paths. This also legitimizes the `post-classify` cost kind in the ledger (~12 extra calls, trivial).

**Gate order** (first failure ends evaluation of a candidate):

- **Gate 0 — Eligibility** (pool construction): only schema-validated, unquarantined images with confidence ≥ flag floor enter the candidate pool. Forced-candidate probes skip pool construction by design — forcing IS the point.
- **Gate 1 — Taxonomy conflict** (`config/taxonomy.json`): each subject maps to `{coarse_category, subject_group}` (e.g. red fox → `animal/fox`, gray wolf → `animal/wolf-canid`, husky → `animal/dog`). Conflict rules: different coarse category → REJECT `"Category mismatch: expected ${post.category}, detected ${image.category}"`; same category, different subject_group → REJECT `"Subject mismatch: expected ${post.subject}, detected ${image.subject}"`. Strictness is deliberate — the guard's brand is *never the wolf*; near-miss posts classify to their dominant subject and incompatible species are refused, while ranking discriminates among compatible ones.
- **Gate 2 — Similarity threshold**: cosine(post_embedding, image_embedding) ≥ SIM_THRESHOLD, else candidate cannot win.
- **Gate 3 — Confidence gate**: image.confidence ≥ CONF_GATE (≥ flag floor; sweep may raise it), else contributes a LOW_CONFIDENCE reason.
- **Verdict assembly**: best surviving candidate → `SUGGESTED`; otherwise → `NO_CONFIDENT_MATCH`.

**Threshold selection method** (the procedure — values are build outputs): run the pipeline over the seeded corpus once; sweep SIM_THRESHOLD × CONF_GATE over a grid; at each point compute top-1 precision on the labeled eval set AND the false-accept count against known-bad pairs (wolf-forced-on-fox, matchless-post tops); select the operating point with maximum precision subject to ZERO known-bad acceptances, tie-breaking toward catching more matchless posts; emit chosen values + the sweep CSV into `config/thresholds.json` with provenance; README publishes both numbers. Re-run whenever corpus or eval set grows.

**Response shape** (every guard answer carries its own provenance):

```jsonc
{
  "verdict": "SUGGESTED | NO_CONFIDENT_MATCH | REJECTED",
  "suggestion": { "image_id", "score", "explanation" },   // when SUGGESTED
  "reasons": [ { "code": "BELOW_SIMILARITY | SUBJECT_CONFLICT | CATEGORY_CONFLICT | LOW_CONFIDENCE | EMPTY_POOL", "detail": "…" } ],
  "guard_version": "guard-r1",
  "thresholds_used": { "similarity": 0.00, "confidence": 0.00 }
}
```

Accept explanation template: `"matched ${image.subject} for expected ${post.subject} (similarity ${sim} ≥ ${SIM_THRESHOLD}, caption confidence ${conf})"`.

Rejected alternatives: embedding-nearest-centroid for post expectations (fragile, undebuggable); LLM-as-judge second pass per query (extra cost + latency on the hot path, harder to defend than deterministic gates); soft penalties instead of hard species rejection (weaker interview story, violates the brief's "never guessing" stance).

This resolution clears the *"exact structure/phrasing of no confident match reasons"* fog patch — structure above, prose lives in the templates.
