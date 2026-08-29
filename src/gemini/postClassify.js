'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { GoogleGenAI } = require('@google/genai');
const { postClassifySchema } = require('../schemas/imageMeta');

const PROMPT_TEXT = fs.readFileSync(path.join(__dirname, '../../prompts/post-classify-v1.md'), 'utf8');

function buildPostClassifySchema() {
  return {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Dominant illustration subject, from allowed list or none' },
      category: { type: 'string', enum: ['animal', 'landscape', 'urban', 'food', 'vehicle', 'none'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['subject', 'category', 'confidence'],
  };
}

async function classifyPostWithGemini(title, body, { repairErrors } = {}) {
  const ai = new GoogleGenAI({});
  let prompt = `${PROMPT_TEXT}\n\nTitle: ${title}\n\nBody:\n${body}`;
  if (repairErrors) {
    prompt += `\n\nRepair hint: Previous response failed Zod validation: ${repairErrors}. Return ONLY valid JSON.`;
  }
  const schema = buildPostClassifySchema();
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
  const text = res.text || res.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty post_classify response');
  const parsed = JSON.parse(text);
  const usage = res.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
  return { parsed, usage, raw: text };
}

async function classifyPostValidated(title, body) {
  let result = await classifyPostWithGemini(title, body);
  let parsed = postClassifySchema.safeParse(result.parsed);
  if (parsed.success) return { data: parsed.data, usage: result.usage, attempts: 1, raw: result.raw };
  const errors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  result = await classifyPostWithGemini(title, body, { repairErrors: errors });
  parsed = postClassifySchema.safeParse(result.parsed);
  if (parsed.success) return { data: parsed.data, usage: result.usage, attempts: 2, raw: result.raw };
  return { error: parsed.error, usage: result.usage, attempts: 2, raw: result.raw, quarantine: true };
}

module.exports = { classifyPostWithGemini, classifyPostValidated, buildPostClassifySchema };
