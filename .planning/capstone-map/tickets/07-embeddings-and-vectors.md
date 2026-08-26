---
id: 07
title: How are image and post vectors embedded and stored?
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: ["02"]
blocks: ["08", "09"]
---

## Question

Both image captions and post text must land in one semantic space so "red fox" matches "Vulpes vulpes". Decide:

- Embedding model + task type (research ticket feeds this).
- Storage at ~50-vector scale: Postgres `float[]` columns with in-app cosine vs pgvector extension (brief says pgvector optional here).
- Where cosine similarity runs (SQL vs Node) and how top-k ranking candidates are fetched.

## Resolution

**Decision: `gemini-embedding-001` @ 768 dims, manual L2 norm, plain Postgres `real[]`, cosine in Node.**

- One embedding call shape for both entity types (image captions, post bodies): `gemini-embedding-001` with `taskType: SEMANTIC_SIMILARITY`, `outputDimensionality: 768`. Research verdict: MTEB quality at 768 ≈ 3072 (67.99 vs 68.16) at 1/4 the storage; `-001` truncated dims need manual L2 normalization — done once in the embed service before persisting.
- Storage: `embeddings(entity_type, entity_id, model, dims, vector real[], normalized boolean)` with `UNIQUE(entity_type, entity_id, model)`. Model name + dims persisted per row because `-001` and `-2` spaces are incompatible — an upgrade means a full re-embed, and the schema must make that impossible to do accidentally.
- Ranking: load candidate vectors (≈45 rows — trivial), cosine in the service layer, sort desc. No extension install, no SQL operator class to defend.
- Rejected: pgvector (brief marks it optional at this scale; extension lifecycle + index tuning is defense burden with zero benefit under ~10k vectors); in-SQL cosine via hand-written scalar math (harder to test than the same function in Node).
