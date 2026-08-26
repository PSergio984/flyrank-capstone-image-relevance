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

**Scope of this ticket's outputs**: the guard's rule structure (gates, their order, their inputs), the threshold SELECTION METHOD (procedure, not numbers), rejection explanation formats, and the "no confident match" response shape. Numeric threshold VALUES are explicitly out of scope here — they are produced by running the selection method against the eval set during build, and remain fog on the map until then.

Fix: decision order and inputs (subject-level semantics vs category vs similarity score vs confidence) — including how a post's expected subject is established at runtime; where each threshold comes from (selection method: sweep on the labeled eval set, pick the operating point, defend with precision — never guessed); rejection explanation string formats; the "no confident match" response shape with its reasons.
