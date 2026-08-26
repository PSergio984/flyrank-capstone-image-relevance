---
id: 08
title: What exactly makes a suggestion good enough? (mismatch guard rules)
label: wayfinder:grilling
hitl: true
status: open
assignee:
blocked-by: ["06", "07"]
blocks: ["10"]
---

## Question

The guard is the capstone's decision core. Note the trap: fox and wolf share category `animal` — category equality alone cannot reject the wolf-on-fox-post case. Probe 3 demands exactly that rejection with an explanation.

Fix: decision order and inputs (subject-level semantics vs category vs similarity score vs confidence); where each threshold comes from (selection method: sweep on the labeled eval set, pick the operating point, defend with precision — never guessed); rejection explanation string formats; the "no confident match" response shape with its reasons.
