'use strict';

const { GoogleGenAI } = require('@google/genai');
const { l2Normalize } = require('../lib/cosine');
const { query } = require('../db/pool');

const MODEL = 'gemini-embedding-001';
const DIMS = 768;
const TASK_TYPE = 'SEMANTIC_SIMILARITY';

function getClient() {
  return new GoogleGenAI({});
}

async function embedTexts(texts) {
  const ai = getClient();
  const res = await ai.models.embedContent({
    model: MODEL,
    contents: texts,
    config: { taskType: TASK_TYPE, outputDimensionality: DIMS },
  });
  // res.embeddings is array of {values: number[]}
  const vectors = res.embeddings.map((e) => l2Normalize(e.values));
  return vectors;
}

async function embedBatchAndStore(items) {
  // items: [{entity_type, entity_id, text}]
  if (items.length === 0) return [];
  const texts = items.map((i) => i.text);
  const vectors = await embedTexts(texts);
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const vector = vectors[idx];
    await query(
      `INSERT INTO embeddings (entity_type, entity_id, model, dims, vector, normalized)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (entity_type, entity_id, model) DO UPDATE SET vector=EXCLUDED.vector, dims=EXCLUDED.dims, normalized=EXCLUDED.normalized`,
      [item.entity_type, item.entity_id, MODEL, DIMS, vector, true]
    );
    // cost ledger: embedding calls have negligible token cost; log 0 but count call
    await query(
      `INSERT INTO ai_cost_log (job_id, kind, model, input_tokens, output_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [`embed-${item.entity_type}-${item.entity_id}`, 'embedding', MODEL, texts[idx].length, 0, 0]
    );
  }
  return vectors;
}

async function getEmbedding(entity_type, entity_id) {
  const r = await query('SELECT vector FROM embeddings WHERE entity_type=$1 AND entity_id=$2 AND model=$3', [
    entity_type,
    entity_id,
    MODEL,
  ]);
  if (r.rows.length === 0) return null;
  return r.rows[0].vector;
}

async function getAllEmbeddings(entity_type) {
  const r = await query('SELECT entity_id, vector FROM embeddings WHERE entity_type=$1 AND model=$2', [
    entity_type,
    MODEL,
  ]);
  const map = new Map();
  for (const row of r.rows) map.set(row.entity_id, row.vector);
  return map;
}

module.exports = { embedTexts, embedBatchAndStore, getEmbedding, getAllEmbeddings, MODEL, DIMS };
