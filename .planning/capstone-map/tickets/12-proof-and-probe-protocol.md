---
id: 12
title: What is the proof and probe protocol?
label: wayfinder:grilling
hitl: true
status: closed
assignee: PSergio984
blocked-by: ["10"]
blocks: []
---

## Question

The destination demands all six acceptance probes passing with one pasted proof per Section 6 box in EVIDENCE.md — but nothing yet owns HOW proof gets made.

Decide: the proof format per requirements box (test name+output vs curl transcript vs log line — which box gets which); how the six probes are executed repeatably (a scripted probe harness vs manual curls recorded as they happen); when proofs are captured (as-you-go vs final pass); and the submission checklist that turns a green repo into a portal link.

## Resolution

**Decision: one probe harness, proof-per-box mapping fixed, proofs captured at phase gates, five-step submission checklist.**

**Probe harness**: `scripts/probes.mjs` — boots against a running server, executes all six probes in order (P1 batch+flag, P2 fox ranking, P3 forced wolf, P4 no-confident-match, P5 eval precision vs README, P6 cost ledger completeness), prints `PASS/FAIL` per probe with the evidence line beneath, exits nonzero on any failure. One command, repeatable, CI-shaped.

**Proof format per requirements box** (EVIDENCE.md section per box, brief's "one pasted proof per box"):

| Box type | Proof artifact |
|---|---|
| Schema validation / never-trust-invalid | test name + PASS output from the validation suite |
| Low-confidence flagging | P1 output excerpt showing ≥1 flagged image |
| Batch job w/ retries | batch log including one deliberately-failed call retried then succeeded |
| Ranked matching | curl of `GET /posts/:id/images` for the fox post, ranked JSON verbatim |
| Guard rejections | force-candidate response verbatim (P3) + reasons array |
| No confident match | P4 response with reasons verbatim |
| Eval precision | eval script stdout block; number matches README to the decimal |
| Cost tracking | `GET /admin/pipeline` ledger totals + one raw `ai_cost_log` row |
| Persistence/migrations | `migrate up` status output + `\d` snippet of two key tables |
| Secrets clean | `git log -p --all -- .env` empty-output proof + .gitignore line |

**Capture timing**: EVIDENCE.md scaffolded with empty sections on day one of build; each phase gate fills its boxes as-you-go (brief's own rule); full harness re-run immediately before submission — stale proofs are the failure mode this kills.

**Submission checklist**: probes green → README numbers current → capstone.yaml endpoints accurate → tag `submission-v1` → paste repo URL into portal form. No ZIPs ever.
