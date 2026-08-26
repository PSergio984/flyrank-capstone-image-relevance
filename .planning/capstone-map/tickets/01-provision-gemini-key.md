---
id: 01
title: Provision a Gemini API key
label: wayfinder:task
hitl: true
status: open
assignee:
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
