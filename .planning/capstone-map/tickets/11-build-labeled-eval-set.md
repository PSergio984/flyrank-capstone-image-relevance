---
id: 11
title: Build the labeled eval set
label: wayfinder:task
hitl: false
status: open
assignee:
blocked-by: ["03", "04"]
blocks: []
---

## Question

The brief requires a small hand-labeled eval set (≥10 posts, one correct image each) measuring top-1 precision — the headline number defends every threshold.

Author `eval/set.json`: post slug → correct corpus image id, plus expected-rejection cases (wolf-forced-on-fox-post) and expected-no-match posts. Labels ride on the id scheme fixed by the corpus manifest (`category-subject-NN`), authored by the same hand that wrote the posts, so ground truth is unambiguous. Resolves when the file exists and every entry validates against manifest + seed post slugs.
