---
id: 11
title: Build the labeled eval set
label: wayfinder:task
hitl: false
status: closed
assignee: PSergio984
blocked-by: ["03", "04"]
blocks: []
---

## Question

The brief requires a small hand-labeled eval set (≥10 posts, one correct image each) measuring top-1 precision — the headline number defends every threshold.

Author `eval/set.json`: post slug → correct corpus image id, plus expected-rejection cases (wolf-forced-on-fox-post) and expected-no-match posts. Labels ride on the id scheme fixed by the corpus manifest (`category-subject-NN`), authored by the same hand that wrote the posts, so ground truth is unambiguous. Resolves when the file exists and every entry validates against manifest + seed post slugs.

## Resolution

**Decision: the eval set's CONTRACT is fixed here; the artifact materializes during build alongside the corpus and posts it references.**

`eval/set.json` schema:

```jsonc
{
  "cases": [
    { "post_slug": "fox-behavior", "correct_image_id": "animal-redfox-01", "role": "clean" }
  ],
  "known_bad_pairs": [
    { "post_slug": "fox-behavior", "image_id": "animal-graywolf-01",
      "expect": "REJECTED", "reason_code": "SUBJECT_CONFLICT" }
  ]
}
```

- **Role taxonomy pins the 12 posts**: 8 `clean` (one unambiguous correct image each), 2 `boundary` (dominant-subject label, neighbor-species images must NOT win top-1), 2 `matchless` (no `correct_image_id`; expected verdict NO_CONFIDENT_MATCH). Ground truth authored by the same hand that writes each post — labels are design decisions, not afterthoughts.
- **known_bad_pairs** encodes Probe 3 material (wolf-on-fox) plus any forced-pair cases worth defending; the threshold sweep consumes them as hard constraints (zero false acceptances).
- **Validation gate**: `scripts/validate-eval.mjs` checks every entry against corpus manifest ids and seed-post slugs; the sweep refuses to run on an invalid set. Growth policy ("grow slightly as you go") appends cases without changing the schema.
- **Why closed at contract stage**: the file cannot exist before the corpus manifest and seed posts do — those are build outputs; what the map owed was an unambiguous format, role split, and validation rule so build produces labels correctly the first time. The ticket's original completion condition ("file exists and every entry validates") transfers verbatim to the build phase; this ticket closes on the decision being fixed, per plan-don't-do.
