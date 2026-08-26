---
id: 02
title: Research Gemini Flash — image understanding, structured output, embeddings
label: wayfinder:research
hitl: false
status: closed
assignee: PSergio984
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

## Resolution

Resolved AFK by research subagent. Findings: branch [`research/gemini-apis`](https://github.com/PSergio984/flyrank-capstone-image-relevance/tree/research/gemini-apis) → `research/gemini-apis.md` (228 lines, every claim source-cited).

Gist: vision via `gemini-3.7-flash` (free tier) using `@google/genai`; inline base64 ≤20 MB covers our corpus. Structured output = `response_format` JSON mode + schema subset (keep tag schema shallow) — but JSON mode ≠ correctness: app-side Zod validation is mandatory design. Embeddings: `gemini-embedding-001`, `taskType: SEMANTIC_SIMILARITY`, MRL-truncate to **768 dims** (MTEB ≈ 3072-dim quality), manual L2 normalization required; persist model name + dims per vector row — `-001` and `-2` embedding spaces are incompatible. Free tier = 0.3× standard limits, no static numbers in docs; ~45 vision + ~55 embedding calls fit comfortably with 2–5 s pacing + exponential backoff on `429 RESOURCE_EXHAUSTED`. Unresolved for later tickets: exact live RPM/RPD (dashboard-only) and safety-block/refusal payload shape under structured output.
