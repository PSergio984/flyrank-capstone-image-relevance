---
id: 06
title: What is the image metadata schema the vision model must return?
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: ["02"]
blocks: ["08", "09"]
---

## Question

Every vision response must satisfy one Zod-validated JSON shape. The brief's example (`subject`, `category`, `attributes[]`, `caption`, `confidence`) is a starting point, not a contract.

Fix precisely: the category enum (must carry the categories the guard will check), attribute format and cardinality, caption constraints (it gets embedded — length/shape matters), the confidence floor below which a result is flagged rather than accepted, and the failure path when validation fails (retry vs flag vs quarantine — never silently accept).

## Resolution

**Decision: shallow strict schema, two-level identity (`category` coarse, `subject` fine), Zod as the only trust boundary.**

```jsonc
{
  "subject":    "string, 2–60 chars, lowercase noun phrase",   // e.g. "red fox"
  "category":   "'animal' | 'landscape' | 'urban' | 'food' | 'vehicle'",
  "attributes": "string[3..6], each 2–30 chars",               // e.g. ["orange fur","wild"]
  "caption":    "string, 8–160 chars, single declarative sentence",
  "confidence": "number 0–1"                                   // model self-report
}
```

- **Two levels by design**: `category` feeds coarse gates; `subject` is what makes fox-vs-wolf discrimination possible — Probe 3's rejection names subjects, not categories (a wolf and a fox share category `animal`).
- **Zod `strict()` object** — unknown fields rejected; safeParse on EVERY response even though Gemini JSON mode enforces the shape (research finding: JSON mode ≠ correctness). The Zod schema is the single source of truth; the Gemini `responseSchema` is generated from it to stay in sync.
- **Flag rule**: `confidence < 0.70` → image marked `flagged_for_review`, excluded from auto-matching, visible in review API. Threshold value lives in `config/thresholds.json` with provenance, revisited during eval tuning.
- **Failure path**: validation failure → exactly ONE repair retry (validation errors appended to prompt) → still invalid → status `quarantined`, raw response stored, never trusted. Silent acceptance is structurally impossible: no code path writes metadata without a safeParse pass.
- Prompt pinned versioned at `prompts/vision-v1.md` (A17 pattern: cache/version key travels with the prompt text).
