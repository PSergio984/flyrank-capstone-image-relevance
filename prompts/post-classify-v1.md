# Post classification prompt v1

Version: post-classify-v1
Model: gemini-2.5-flash
Purpose: Read a blog post and record what it EXPECTS its illustration to show. The guard compares candidate images against these expectations — never against eval labels.

## Input
You receive a blog post's title and body (Markdown). Determine the single most appropriate illustration subject for that post.

## Output schema (Zod, strict)
```json
{
  "subject": "string 2-60 chars, lowercase noun phrase, must be from allowed list",
  "category": "'animal' | 'landscape' | 'urban' | 'food' | 'vehicle'",
  "confidence": "number 0-1, confidence that this subject is the correct dominant illustration"
}
```

## Allowed subjects (same closed list as vision)
- animal: red fox, gray wolf, siberian husky, brown bear, white-tailed deer
- landscape: alpine mountain, forest trail, desert dune, lake reflection
- urban: city skyline, historic building
- food: pasta dish, fruit bowl
- vehicle: red car, mountain bike

 plus the special case: if the post is purely conceptual with NO visual subject (e.g., philosophy of time, abstract math, underwater coral when no marine images exist), return subject "none" category "none" confidence 0.30 with an explanation that no corpus image can illustrate it. However for this capstone we expect only 2 such matchless posts; prefer a real subject when any corpus category plausibly fits.

## Rules
- Pick the DOMINANT subject the post is about, not every animal mentioned. Example: a fox post that compares wolves and huskies is still "red fox".
- Category must be the coarse bucket for that subject.
- Return ONLY the JSON object.
- For matchless posts (conceptual, no corpus affinity), set confidence low (<0.50) so the guard's reasoning can explain the mismatch.
