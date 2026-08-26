---
id: 01
title: Provision a Gemini API key
label: wayfinder:task
hitl: true
status: closed
assignee: PSergio984
blocked-by: []
blocks: []
---

## Question

The build needs a Gemini API key (vision + embeddings, free tier, no credit card). Nothing that touches the live model can run until it exists. This is a human checklist:

1. Sign in at Google AI Studio (aistudio.google.com) with a Google account.
2. Create an API key (free tier — no card anywhere in the flow).
3. Put it in this repo's `.env` as `GEMINI_API_KEY=...` (never committed).
4. Add `GEMINI_API_KEY=your_key_here` placeholder to `.env.example`.

Resolves when the key exists and one cheap smoke call succeeds.

**Scaffolded already**: `.env` (gitignored) and `.env.example` exist with `GEMINI_API_KEY`, `PORT`, `DATABASE_URL`, `ADMIN_TOKEN`. Remaining human steps: 1–2 above, then paste the key into `.env`'s `GEMINI_API_KEY=`.

## Resolution

Human generated the key into `.env` (never shown, never committed). Smoke call: `GET v1beta/models` → **HTTP 200**, 50 models visible.

**Live-API correction to the research findings**: the stable Flash family is **`gemini-2.5-flash`** (plus aliases `gemini-flash-latest`, `gemini-2.5-flash-lite`) — the research doc's `gemini-3.7-flash` naming does not exist on the live API; vision calls pin `gemini-2.5-flash` via a config constant so alias drift is one-line changeable. Embeddings confirmed present exactly as decided: `gemini-embedding-001` (and `gemini-embedding-2`).
