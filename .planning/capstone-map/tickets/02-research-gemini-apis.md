---
id: 02
title: Research Gemini Flash — image understanding, structured output, embeddings
label: wayfinder:research
hitl: false
status: open
assignee:
blocked-by: []
blocks: ["06", "07"]
---

## Question

What do the official Gemini docs pin down for the three API surfaces this capstone needs?

(a) **Image understanding** — how images are sent to Gemini Flash (formats, size limits, inline vs Files API), model naming for the free tier.
(b) **Structured output** — `responseSchema` / responseMimeType JSON mode with the Node SDK: how schema-conforming tag JSON is forced, what happens on refusal, interaction with Zod validation.
(c) **Embeddings** — embedding model name(s), `SEMANTIC_SIMILARITY` task type, dimension options, batching limits, cosine-similarity guidance.
(d) **Free-tier rate limits** relevant to a ~45-image vision batch plus ~55 embedding calls (images + posts).

Findings land on throwaway branch `research/gemini-apis` as `research/gemini-apis.md`; this ticket carries only a context pointer to that branch.
