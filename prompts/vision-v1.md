# Vision prompt v1 — image understanding

Version: vision-v1
Model: gemini-2.5-flash
Purpose: Classify a single corpus image into the strict metadata schema below. JSON mode is requested, but the response MUST still pass Zod safeParse; never trust the model blindly.

## Schema (source of truth: src/schemas/imageMeta.js)
```json
{
  "subject": "string 2-60 chars, lowercase noun phrase, e.g. 'red fox'",
  "category": "'animal' | 'landscape' | 'urban' | 'food' | 'vehicle'",
  "attributes": "string[3..6] each 2-30 chars, e.g. ['orange fur','white tail tip']",
  "caption": "string 8-160 chars, single declarative sentence for embedding, e.g. 'A red fox prowls through snow.'",
  "confidence": "number 0-1, your self-reported confidence that the subject/category are correct"
}
```

## Allowed subjects (must pick exactly one from this closed list)
- animal: red fox, gray wolf, siberian husky, brown bear, white-tailed deer
- landscape: alpine mountain, forest trail, desert dune, lake reflection
- urban: city skyline, historic building
- food: pasta dish, fruit bowl
- vehicle: red car, mountain bike

Category must be the coarse bucket for that subject (see config/taxonomy.json). Do not invent subjects outside the list; pick the closest match.

## Rules
- Return ONLY the JSON object, no markdown, no prose.
- `attributes` must be 3 to 6 short visual observations (colors, textures, setting, count).
- `caption` must be a single sentence, 8-160 chars, describing what is visible (not what you guess).
- `confidence` should be low (<0.70) if the image is ambiguous, blurry, or placeholder-like; high (0.85-0.99) if the subject is clearly visible.
- If the image is a 1x1 white square, placeholder, or abstract noise, set confidence to 0.20 and pick the closest subject anyway — the guard will flag low confidence.

## Repair hint (appended only on retry after validation failure)
Your previous response failed Zod validation. Fix the errors listed and return a single valid JSON object matching the schema exactly.
