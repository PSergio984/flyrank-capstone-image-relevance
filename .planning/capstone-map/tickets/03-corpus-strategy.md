---
id: 03
title: Corpus strategy — where the images come from and how they live in the repo
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: []
blocks: []
---

## Question

The brief requires ≥40 licensed-free images across ≥4 categories (animals: red fox, wolf, dog, bear, deer suggested) — but leaves sourcing and storage open.

Decide: committed corpus vs deterministic download script (brief allows either; its DON'T list forbids datasets "over a few MB" in git). Cover: Unsplash/Pexels license compliance, per-category counts sized so lookalike pairs exist (fox/wolf/dog confusion is the whole demo), image sizing/normalization before commit, reproducibility for the evaluator.

## Resolution

**Decision: commit a reduced-size corpus AND ship a deterministic fetch script — both, anchored by one provenance manifest.**

- `corpus/images/` — ~45 images committed at ≤800px longest edge, JPEG q≈75 (~50–120 KB each, ≈3–6 MB total): evaluator sees real data with zero network dependency at probe time. The brief's "don't commit datasets over a few MB" is respected by aggressive downscaling; original-resolution pixels are never committed.
- `corpus/manifest.json` — one entry per image: `{id, filename, category, subject, source_page_url, cdn_url, license, photographer}`. **`id` format pinned: `category-subject-NN`** (e.g. `animal-redfox-01`, `landscape-alpine-02`) — stable, human-scannable, and the anchor every later label and eval entry references. This is simultaneously the licensing evidence (Unsplash License / Pexels License both permit use; credit recorded anyway), the eval-set label anchor, and the input for the fetch script.
- `scripts/fetch-corpus.mjs` — reads the manifest, re-downloads originals from CDN URLs, regenerates the resized corpus deterministically. Satisfies the brief's "commit it (or a download script)" with the strengths of both paths.
- Spread: ≥4 coarse categories (animals, landscape/nature, urban/architecture, food, vehicles) with animals the largest block. The animal set is engineered for honesty: red fox vs gray wolf vs husky-type dog lookalikes in meaningful quantity, plus bear and deer — Probe 2's ranking separation and Probe 3's wolf rejection must succeed against genuinely confusable candidates, not rigged ones.

Rejected alternatives: commit-only at full resolution (repo bloat, violates DON'T list); script-only (eval-time network flake risk on the run command); scraper-sourced randoms (licensing provenance too weak to defend).
