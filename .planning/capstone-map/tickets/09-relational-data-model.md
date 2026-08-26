---
id: 09
title: What is the relational data model?
label: wayfinder:grilling
hitl: true
status: open
assignee:
blocked-by: ["06", "07", "05"]
blocks: ["10"]
---

## Question

Shared requirement #4 wants real persistence: schema as migrations, right indexes. Tables needed for images, tags, embeddings, posts, suggestions, approvals/rejections.

Decide table shapes and relations, the indexes the query patterns actually need, idempotency representation for retried jobs (unique job keys?), and the per-call cost ledger's shape (shared requirement #7: attributed per call, budget guard).
