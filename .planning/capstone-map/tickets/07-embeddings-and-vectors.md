---
id: 07
title: How are image and post vectors embedded and stored?
label: wayfinder:grilling
hitl: true
status: open
assignee:
blocked-by: ["02"]
blocks: ["08", "09"]
---

## Question

Both image captions and post text must land in one semantic space so "red fox" matches "Vulpes vulpes". Decide:

- Embedding model + task type (research ticket feeds this).
- Storage at ~50-vector scale: Postgres `float[]` columns with in-app cosine vs pgvector extension (brief says pgvector optional here).
- Where cosine similarity runs (SQL vs Node) and how top-k ranking candidates are fetched.
