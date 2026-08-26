# Context — AI Image Understanding & Content Matching Engine

Glossary of domain terms. Definitions are implementation-free on purpose.

## Mismatch Guard
The safety layer that answers "is this suggestion actually good enough?" before a human sees it. It never guesses: candidates either earn a justified suggestion, are refused with explicit reasons — or, when forced by an operator, are explicitly rejected. When nothing clears the bar, the honest answer is "no confident match".

## Eligibility Pool
The set of images allowed to become candidates at all: validated, not quarantined, confidence at or above the flag floor. Nothing outside the pool can be suggested by normal ranking.

## Subject Group
The fine-grained identity behind a subject ("red fox" → fox; "gray wolf" → wolf-canid). Two images may share a coarse category (animal) yet belong to different subject groups — sharing a category is never enough to call them compatible.

## Taxonomy Conflict
A candidate whose subject group or coarse category contradicts what the post expects. A conflict is a refusal with an explanation, not a low rank — the fox post never merely ranks the wolf lower; it refuses the wolf.

## Post Classification Stage
The step that reads a blog post and records what it is about (subject and coarse category). The guard compares against these recorded expectations, never against hand-labeled evaluation data.

## Forced Candidate
An operator-supplied (post, image) pair pushed through the guard's gates directly, bypassing pool construction but not any gate. The mechanism that makes "force the wolf onto the fox post" a repeatable test.

## No Confident Match
The honest refusal when nothing clears the bar. Always delivered with structured reasons — which gate failed and why — so the refusal itself is auditable.

## Flagged Image
A processed image whose classification confidence fell below the flag floor: kept, visible, excluded from matching, awaiting human eyes. Distinct from:

## Quarantined Image
An image whose model response failed validation even after its single repair retry. Its raw response is preserved; it is never trusted and never matched.

## Guard Version
The label carried by every guard answer identifying which rule set produced it. Rules change; old verdicts must stay interpretable.

## Eval Set
The small hand-labeled ground truth: which image is correct for each post. Authored alongside the posts themselves so labels are unambiguous.

## Case Roles
The eval set's three kinds of cases: clean (one unambiguous correct image), boundary (dominant-subject label where neighbor-species images must lose), matchless (no correct image exists; the right answer is refusal).

## Known-Bad Pair
A (post, image) pairing that must always be rejected — the wolf-on-the-fox-post case and friends. Threshold tuning treats accepting one as an unconditional failure.

## Operating Point
The chosen similarity/confidence thresholds from sweeping the eval set — picked to maximize top-1 precision under the constraint that no known-bad pair is ever accepted, then published in the README.

## Corpus Manifest
The provenance record for every image: where it came from, its license, its photographer, its category and subject identity. The corpus's birth certificate and the labels' anchor point.
