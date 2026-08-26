---
id: 04
title: Where do the blog posts come from?
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: []
blocks: ["11"]
---

## Question

The brief matches images to "a set of posts" but never says where posts come from. Options: hand-write 12–15 short posts in-repo (fox/wolf/dog/bear/deer themed, including deliberately ambiguous or matchless ones so Probe 4 has material); reuse the A9 scraper experience against real articles; another path entirely.

Decide the source, where posts live in the repo (seed data layout), and the count (≥10 needed to build the labeled eval set later).

## Resolution

**Decision: hand-write 12 short posts in-repo as seed data — `seed/posts/*.md` with front-matter.**

- Exactly **12 posts** (operative commitment — eval arithmetic depends on it), 80–150 words each, Markdown with YAML front-matter (`slug`, `title`). Committed, versioned, deterministic — no scraping flake at eval time.
- Composition serves every probe honestly: most posts map cleanly onto corpus categories (fox behavior, wolf packs, dog training, bear habitat…), **≥2 are deliberately matchless** (topics with zero corpus affinity — Probe 4 material), **≥2 are boundary-strainers** that mention a neighbor subject (a fox post that discusses wolves; a husky post beside wolf content) so the guard must discriminate rather than pattern-match loosely.
- Each post's intended correct image id is authored alongside the post (in the eval mapping — see *Build the labeled eval set*) because labels written by the same hand that wrote the post are unambiguous; scraping real articles would make "the one correct image" contested.

Rejected: A9 scraper reuse (non-deterministic corpus → unstable eval numbers between runs); fewer posts (eval set needs ≥10 with headroom for tuning splits).
