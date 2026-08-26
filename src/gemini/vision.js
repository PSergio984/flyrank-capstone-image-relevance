'use strict';

const fs = require('node:fs');
const { GoogleGenAI } = require('@google/genai');
const { imageMetaSchema } = require('../schemas/imageMeta');
const { VISION_MODEL } = require('./config');

// Versioned prompt text — keep in sync with prompts/vision-v1.md
const PROMPT_TEXT = fs.readFileSync(require('node:path').join(__dirname, '../../prompts/vision-v1.md'), 'utf8');

function buildVisionSchema() {
  // JSON Schema for Gemini structured output, derived from Zod but kept explicit
  return {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Primary subject, must be from allowed list' },
      category: { type: 'string', enum: ['animal', 'landscape', 'urban', 'food', 'vehicle'] },
      attributes: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
      caption: { type: 'string', description: 'Single declarative sentence 8-160 chars' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['subject', 'category', 'attributes', 'caption', 'confidence'],
  };
}

async function classifyImageWithGemini(imagePath, { repairErrors } = {}) {
  const ai = new GoogleGenAI({});
  const base64 = fs.readFileSync(imagePath).toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  let prompt = PROMPT_TEXT;
  if (repairErrors) {
    prompt += `\n\nRepair hint: Your previous response failed Zod validation with:\n${repairErrors}\nReturn ONLY a valid JSON object matching the schema.`;
  }

  const schema = buildVisionSchema();

  // Prefer legacy generateContent with responseMimeType for stability; fallback to interactions
  try {
    const res = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { data: base64, mimeType } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });
    const text = res.text || (res.candidates && res.candidates[0]?.content?.parts?.[0]?.text);
    if (!text) throw new Error('empty vision response');
    const parsed = JSON.parse(text);
    const usage = res.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
    return { parsed, usage, raw: text };
  } catch (err) {
    // If generateContent fails (e.g. model not found), try interactions API
    if (err.message && err.message.includes('responseSchema')) {
      const interaction = await ai.interactions.create({
        model: VISION_MODEL,
        input: [
          { type: 'text', text: prompt },
          { type: 'image', data: base64, mime_type: mimeType },
        ],
        response_format: { type: 'text', mime_type: 'application/json', schema },
      });
      const text = interaction.output_text;
      const parsed = JSON.parse(text);
      return { parsed, usage: { promptTokenCount: 0, candidatesTokenCount: 0 }, raw: text };
    }
    throw err;
  }
}

async function classifyImageValidated(imagePath) {
  // First attempt
  let result = await classifyImageWithGemini(imagePath);
  let parsed = imageMetaSchema.safeParse(result.parsed);
  if (parsed.success) {
    return { data: parsed.data, usage: result.usage, attempts: 1, raw: result.raw };
  }
  // One repair retry
  const errors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  result = await classifyImageWithGemini(imagePath, { repairErrors: errors });
  parsed = imageMetaSchema.safeParse(result.parsed);
  if (parsed.success) {
    return { data: parsed.data, usage: result.usage, attempts: 2, raw: result.raw };
  }
  // Still invalid -> quarantine
  return { error: parsed.error, usage: result.usage, attempts: 2, raw: result.raw, quarantine: true };
}

module.exports = { classifyImageWithGemini, classifyImageValidated, buildVisionSchema, VISION_MODEL };
