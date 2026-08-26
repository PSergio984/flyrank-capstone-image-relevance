#!/usr/bin/env node
import pg from 'pg';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-embedding-001';
const DIMS = 768;

function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec.slice();
  return vec.map(v => v / norm);
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const ai = new GoogleGenAI({});
  try {
    // Fetch images needing embeddings (processed, not flagged/quarantined)
    const images = await pool.query(
      `SELECT id, caption FROM images WHERE status='processed' AND flagged=false ORDER BY id`
    );
    const posts = await pool.query(`SELECT id, body FROM posts ORDER BY id`);

    const items = [];
    for (const r of images.rows) {
      const exists = await pool.query(
        `SELECT 1 FROM embeddings WHERE entity_type='image_caption' AND entity_id=$1 AND model=$2`,
        [r.id, MODEL]
      );
      if (exists.rows.length === 0) items.push({ entity_type: 'image_caption', entity_id: r.id, text: r.caption });
    }
    for (const r of posts.rows) {
      const exists = await pool.query(
        `SELECT 1 FROM embeddings WHERE entity_type='post_body' AND entity_id=$1 AND model=$2`,
        [r.id, MODEL]
      );
      if (exists.rows.length === 0) items.push({ entity_type: 'post_body', entity_id: r.id, text: r.body });
    }

    console.log(`Need embeddings for ${items.length} items (${images.rows.length} images + ${posts.rows.length} posts)`);
    if (items.length === 0) {
      console.log('All embeddings present');
      return;
    }

    const BATCH = 10;
    let done = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const texts = batch.map(b => b.text);
      console.log(`Embedding batch ${i / BATCH + 1}: ${batch.length} texts`);
      const res = await ai.models.embedContent({
        model: MODEL,
        contents: texts,
        config: { taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: DIMS },
      });
      const vectors = res.embeddings.map(e => l2Normalize(e.values));
      for (let j = 0; j < batch.length; j++) {
        const it = batch[j];
        const vec = vectors[j];
        await pool.query(
          `INSERT INTO embeddings (entity_type, entity_id, model, dims, vector, normalized)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (entity_type, entity_id, model) DO UPDATE SET vector=EXCLUDED.vector, dims=EXCLUDED.dims, normalized=EXCLUDED.normalized`,
          [it.entity_type, it.entity_id, MODEL, DIMS, vec, true]
        );
        await pool.query(
          `INSERT INTO ai_cost_log (job_id, kind, model, input_tokens, output_tokens, cost_usd)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [`embed-${it.entity_type}-${it.entity_id}`, 'embedding', MODEL, texts[j].length, 0, 0]
        );
      }
      done += batch.length;
      console.log(`  stored ${done}/${items.length}`);
      // pacing 1s between batches
      if (i + BATCH < items.length) await new Promise(r => setTimeout(r, 1200));
    }

    const cnt = await pool.query('SELECT count(*)::int as n FROM embeddings WHERE model=$1', [MODEL]);
    console.log(`Embeddings now: ${cnt.rows[0].n}`);
    console.log('EMBED COMPLETE');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
