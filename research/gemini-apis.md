# Research: Gemini APIs — image understanding, structured output, embeddings

**Ticket:** `.planning/capstone-map/tickets/02-research-gemini-apis.md` · **Branch:** `research/gemini-apis` · **Date:** 2026-08-26
**Sources:** official docs only — ai.google.dev (Gemini API docs). All claims cite the page they came from. Pages last-verified 2026-08-26; the structured-output page shows "Last updated 2026-08-17".

---

## (a) Image understanding

### SDK and API surface

The current Node.js SDK is **`@google/genai`** ([Image understanding](https://ai.google.dev/gemini-api/docs/vision), [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)):

```js
import { GoogleGenAI } from "@google/genai";
const client = new GoogleGenAI({}); // reads GEMINI_API_KEY from env by default
```

All vision examples in the docs now use the **Interactions API** ("generally available" per the page banner):

```js
const interaction = await client.interactions.create({
  model: "gemini-3.7-flash",
  input: [
    { type: "text", text: "Caption this image." },
    {
      type: "image",
      data: base64String,            // inline base64 …
      mime_type: "image/jpeg",       // … or { uri, mime_type } for Files-API uploads
    },
  ],
});
console.log(interaction.output_text);
```

([Image understanding > Passing images to Gemini](https://ai.google.dev/gemini-api/docs/vision))

Note the docs also ship a "Migrate to Interactions API" / "Interactions breaking changes (May 2026)" pair of pages (linked in the site nav of every doc page) — the older `client.models.generateContent(...)` surface still exists in the same SDK.

### Model names

From [Models](https://ai.google.dev/gemini-api/docs/models) (badge labels as shown on that page):

| Model code | Docs label | Status badge |
|---|---|---|
| `gemini-3.7-flash` | "Our latest and most capable Flash model" | Stable |
| `gemini-3.6-flash` | previous-generation Flash | New/Stable |
| `gemini-3.5-flash` | legacy Flash | Stable |
| `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` | fastest/cheapest tier | Stable |

Every Gemini model version is multimodal ("All Gemini model versions are multimodal" — [Image understanding](https://ai.google.dev/gemini-api/docs/vision)), so any Flash above does image understanding. Docs examples pin `gemini-3.7-flash`. Pricing lists Flash input/output as **"Free of charge"** on the Free Tier ([Pricing](https://ai.google.dev/gemini-api/docs/pricing)).

### Sending images: inline vs Files API

| Method | How | Limit |
|---|---|---|
| Inline base64 | `{ type: "image", data: "<b64>", mime_type }` | **Total request ≤ 20 MB** (prompt + system instruction + all inline bytes) |
| Files API | `client.files.upload({ file, config: { mimeType } })` → pass returned `uri` + `mime_type` | For requests over 20 MB |

Both from [Image understanding](https://ai.google.dev/gemini-api/docs/vision). Blog-scale images (hundreds of KB each) are comfortably inline; the Files API is only needed for oversized assets.

### Formats and limits

Supported MIME types ([Image understanding](https://ai.google.dev/gemini-api/docs/vision)): `image/png`, `image/jpeg`, `image/webp`, `image/heic`, `image/heif`.

Other technical facts ([Image understanding > Limitations](https://ai.google.dev/gemini-api/docs/vision)):

| Item | Value |
|---|---|
| Max image files per request | 3,600 |
| Token cost per image | **258 tokens** if both dimensions ≤ 384 px |
| Larger images | tiled into 768×768 px tiles, **258 tokens per tile** |
| Media resolution control | `media_resolution` parameter (Gemini 3): caps tokens allocated per image/frame; higher = better small-detail reading, more tokens/latency |

---

## (b) Structured output

### Mechanism

Configure the request so the response must be JSON matching a schema ([Structured outputs > JSON schema support](https://ai.google.dev/gemini-api/docs/structured-output)). In the current Interactions API this is a `response_format` object with `type: "text"`, `mime_type: "application/json"`, and the JSON Schema in `schema`. (On the legacy `generateContent` surface this corresponds to `config.responseMimeType = "application/json"` + `config.responseSchema`.)

Minimal Node shape straight from the docs:

```js
import { GoogleGenAI } from "@google/genai";
import * as z from "zod"; // npm install zod

const tagJsonSchema = {
  type: "object",
  properties: {
    subject:     { type: "string", description: "Primary subject of the image." },
    category:    { type: "string", enum: ["hero", "inline", "diagram"] },
    attributes:  { type: "array", items: { type: "string" } },
    caption:     { type: "string" },
    confidence:  { type: "number" },
  },
  required: ["subject", "category", "attributes", "caption", "confidence"],
};
const tagSchema = z.fromJSONSchema(tagJsonSchema);

const interaction = await client.interactions.create({
  model: "gemini-3.7-flash",
  input: prompt,
  response_format: {
    type: "text",
    mime_type: "application/json",
    schema: tagJsonSchema,
  },
});

const tag = tagSchema.parse(JSON.parse(interaction.output_text));
```

(Adapted from [Structured outputs > JavaScript example](https://ai.google.dev/gemini-api/docs/structured-output); the docs show exactly this pattern with `z.fromJSONSchema(...)` then `.parse(JSON.parse(interaction.output_text))`.)

### Supported schema subset

The docs now describe this as "a subset of the **JSON Schema** specification" ([Structured outputs > JSON schema support](https://ai.google.dev/gemini-api/docs/structured-output)):

| Schema feature | Support |
|---|---|
| `type`: `string`, `number`, `integer`, `boolean`, `object`, `array` | Supported |
| Nullable | `"type": ["string", "null"]` (type arrays) |
| `title`, `description` | Supported — guide the model |
| `enum` | Shown throughout doc examples |
| `anyOf` (union of object shapes) | Shown in the moderation example |
| Recursive `$ref: "#"` | Shown in the org-chart example |

### Failures / refusals

What the official page pins down ([Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), Limitations + Best practices):

- Output is **syntactically correct JSON** when the schema/mime-type is set — but "always validate values in your application."
- "Implement robust error handling for **schema-compliant but semantically incorrect outputs**."
- **Limitations:** not all JSON Schema features are supported; "Very large or deeply nested schemas may be rejected."
- The page does *not* document a specific refusal payload shape — safety-blocked/refusing responses are handled under general API error handling ([API errors](https://ai.google.dev/gemini-api/docs/troubleshooting)); streaming chunks are "valid partial JSON strings that can be concatenated."

Design consequence: treat Zod validation as mandatory post-processing, not a formality, and wrap the whole call in try/catch (network, 429, safety block, schema rejection are all distinct failure modes).

---

## (c) Embeddings

Two embedding models share the same Gemini API key ([Embeddings](https://ai.google.dev/gemini-api/docs/embeddings), [Pricing](https://ai.google.dev/gemini-api/docs/pricing)):

| Property | `gemini-embedding-001` | `gemini-embedding-2` |
|---|---|---|
| Modality | Text only | Text, image, video, audio, PDF → one unified space |
| Task types | `task_type` param: `SEMANTIC_SIMILARITY`, `RETRIEVAL_DOCUMENT`, … | **Not supported** — put task instructions in the prompt instead |
| Multiple inputs | One embedding **per string** when passed a list | Aggregates into a **single** embedding unless each input is wrapped in its own `Content` object |
| Input limit | — | 8,192 tokens shared across all modalities |
| Default dimensionality | 3072 | 3072 |
| Dimensionality options (MRL) | truncate to 2048 / 1536 / 768 / 512 / 256 / 128 via `output_dimensionality`; **manual renormalization required** for non-default dims | flexible 128–3072; recommended **768, 1536, 3072**; auto-normalizes non-default dims |
| Free tier price | "Free of charge" (paid $0.15/1M text tokens) | Text free of charge (paid $0.20/1M); images free of charge (paid $0.45/1M ≈ $0.00012/image) |
| Status | "available to developers on the free and paid tiers" | Stable (latest update April 2026) |

Quality across truncated dims barely drops — MTEB scores for `gemini-embedding-001`: 2048→68.16, **1536→68.17**, **768→67.99**, 512→67.55, 256→66.19, 128→63.31 ([Embeddings > Ensuring quality for smaller dimensions](https://ai.google.dev/gemini-api/docs/embeddings)).

**Cosine similarity guidance:** "Cosine similarity is a good distance metric because it focuses on direction rather than magnitude… Values range from −1 (opposite) to 1 (greatest similarity)" ([Embeddings > Specify task type](https://ai.google.dev/gemini-api/docs/embeddings)).

**One semantic space:** both caption text and blog-post text embedded with the *same* model land in one space — either model satisfies the capstone requirement; `-001` gives you the documented `SEMANTIC_SIMILARITY` task type, `-002` gives multimodal headroom.

Minimal Node call (batched, `-001`):

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

const result = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: ["caption for img_01.jpg", "Full text of blog post A…"],
  config: { taskType: "SEMANTIC_SIMILARITY", outputDimensionality: 768 },
});

const vectors = result.embeddings.map(e => e.values); // number[][] — one vector per input string
```

(Pattern per [Embeddings](https://ai.google.dev/gemini-api/docs/embeddings) Python/JS/REST examples: `client.models.embed_content(model="gemini-embedding-001", contents=[...], config=EmbedContentConfig(task_type="SEMANTIC_SIMILARITY"))`; REST endpoint `POST /v1beta/models/gemini-embedding-001:embedContent` with `taskType` + `content.parts[]`.)

---

## (d) Free-tier rate limits

How limits work ([Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)):

- Measured on three axes: **RPM** (requests/min), **TPM** (input tokens/min), **RPD** (requests/day). Exceeding *any* → error.
- Limits are **per project, not per API key**. **RPD resets at midnight Pacific time.**
- Experimental/preview models have tighter limits.
- Breaching returns `429 RESOURCE_EXHAUSTED`; remedy: "wait and retry," reduce expensive requests.

The key structural fact: the rate-limits page **no longer publishes static per-model numbers**. It states:

> "Default rate limits are: **0.3× the standard rate limit for each model and tier**"

and points developers at the live dashboard: **https://aistudio.google.com/rate-limit** ("View your active rate limits in AI Studio").

Separately, the **Batch API** has its own generous pool ([Rate limits > Batch API](https://ai.google.dev/gemini-api/docs/rate-limits)): 100 concurrent batch requests, 2 GB input files, 20 GB storage, per-model enqueued-token budgets (e.g., Tier 1 "Gemini Embedding": 500k enqueued tokens).

### Verdict for our workload (~45 vision calls + ~55 embedding calls)

Even at an assumed conservative ~10 RPM effective free-tier ceiling, 100 sequential calls finish in ~10 minutes. Nothing in the official numbers makes this workload risky:

1. **RPM is trivially satisfiable** with simple pacing — e.g., 1 request every 2–5 s keeps any plausible RPM headroom and finishes both batches in <15 min total.
2. **TPM is the axis to watch**: a typical photo costs a few hundred–few thousand tokens (258/token-tile math above), ×45 images — well inside even scaled-down TPM budgets.
3. **Required engineering**: exponential backoff on `429 RESOURCE_EXHAUSTED`, resumable batch state (checkpoint which items completed), and don't run other jobs against the same project on run day (per-project quota).
4. **Verify actual numbers before the run**: log into https://aistudio.google.com/rate-limit with the project's key — that's the only authoritative live source.

---

## Gotchas that affect our design decisions

1. **Docs center on the new Interactions API (`client.interactions.create`) — GA since May 2026.** Structured output is `response_format: { mime_type, schema }`, not the old `responseMimeType/responseSchema` config keys. Pin ONE surface in the storage/schema tickets; if we use the legacy `generateContent`, expect different option names. There's a migration doc: "Migrate to Interactions API / breaking changes (May 2026)."
2. **Schema subset is real and enforced**: keep the tag schema shallow and flat-ish — "very large or deeply nested schemas may be rejected." Use `description` fields liberally; enums are supported and recommended ("strong typing").
3. **JSON mode ≠ correctness.** Official best practice says outputs can be schema-compliant but semantically wrong — Zod validation after parse is mandatory design, and each failure mode (429, safety block, schema rejection, bad values) needs its own retry/skip policy in the batch job.
4. **Embedding model choice locks the vector space.** `-001` and `-2` spaces are incompatible; switching models means re-embedding everything. Storage ticket should persist the model name (+ dimensionality) alongside vectors.
5. **`task_type: SEMANTIC_SIMILARITY` exists only on `-001`.** If we pick `-2` later, there is no task-type parameter — instructions go into the prompt. Also `-2` aggregates multiple inputs into ONE vector unless each input is wrapped separately.
6. **Normalization differs**: `-001` requires manual L2 normalization when using truncated dims (e.g., 768); `-2` auto-normalizes non-default dims. Recommend `outputDimensionality: 768` — MTEB delta vs 3072 is negligible (67.99 vs 68.16) and storage shrinks 4×.
7. **Cosine similarity is the documented metric** (−1..1). No pgvector-specific guidance exists in these docs; cosine distance in Postgres maps directly.
8. **Free-tier limits are no longer static numbers in docs** — the formula is "0.3× standard per model/tier," exact values live in the AI Studio dashboard. The batch job must therefore be defensive (pacing + backoff + resume) rather than tuned to hard-coded quotas.
9. **Inline images cap at 20 MB total request size** — fine for blog assets inline; only reach for Files API if assets are huge (it adds upload latency + file-lifecycle management).
10. **Image token math favors us**: 258 tokens per ≤384px image or per 768×768 tile; max 3,600 images/request. 45 images is nothing token-wise; RPD resets midnight Pacific and quotas are per project.

## Could not answer from official docs

- **Exact static free-tier RPM/RPD/TPD numbers per model** — Google removed them from the rate-limits page in favor of the "0.3× standard" formula plus the live AI Studio dashboard. Needs a one-time check at https://aistudio.google.com/rate-limit during implementation.
- **Exact payload shape of refusals/safety blocks when structured output is requested** — the structured-output page doesn't specify; it only mandates app-side validation and general error handling.
