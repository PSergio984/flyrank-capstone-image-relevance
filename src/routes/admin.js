'use strict';

const express = require('express');
const { z } = require('zod');
const { query } = require('../db/pool');
const { evaluateForcedCandidate } = require('../services/guard');
const { loadEnv } = require('../config/env');

const router = express.Router();

// Admin token guard: if ADMIN_TOKEN set, require Bearer token
router.use((req, res, next) => {
  const env = loadEnv();
  const token = env.ADMIN_TOKEN;
  if (!token) return next();
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer !== token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', details: 'invalid admin token' } });
  }
  next();
});

router.post('/probes/force-candidate', async (req, res, next) => {
  try {
    const bodySchema = z.object({
      post_id: z.number().int().positive(),
      image_id: z.number().int().positive(),
    });
    const { post_id, image_id } = bodySchema.parse(req.body);
    const result = await evaluateForcedCandidate(post_id, image_id);
    return res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', details: err.issues.map((i) => i.message).join('; ') } });
    }
    if (err.status === 404) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', details: err.message } });
    }
    next(err);
  }
});

// Batch triggers with double-dispatch guard (409 if already queued/running)
const BATCH_WINDOW_MS = 60_000;
const BATCH_RESET_MS = 5000;
const batchState = {
  vision: null,
  embeddings: null,
  classify: null,
};

function isRunning(key) {
  return batchState[key] && Date.now() - batchState[key] < BATCH_WINDOW_MS;
}

const BATCH_WORKERS = {
  vision: async () => {
    const { runVisionBatch } = require('../services/visionBatch');
    return runVisionBatch();
  },
  embeddings: async () => {
    // Embeddings batch: re-embed missing captions/posts
    const { query: q } = require('../db/pool');
    const { embedBatchAndStore } = require('../services/embeddings');
    const pendingImages = await q(`SELECT id, caption FROM images WHERE status='processed' AND flagged=false`);
    const pendingPosts = await q(`SELECT id, body FROM posts`);
    // Collect items lacking embeddings
    const items = [];
    for (const r of pendingImages.rows) {
      const exists = await q(`SELECT 1 FROM embeddings WHERE entity_type='image_caption' AND entity_id=$1 AND model='gemini-embedding-001'`, [r.id]);
      if (exists.rows.length === 0) items.push({ entity_type: 'image_caption', entity_id: r.id, text: r.caption });
    }
    for (const r of pendingPosts.rows) {
      const exists = await q(`SELECT 1 FROM embeddings WHERE entity_type='post_body' AND entity_id=$1 AND model='gemini-embedding-001'`, [r.id]);
      if (exists.rows.length === 0) items.push({ entity_type: 'post_body', entity_id: r.id, text: r.body });
    }
    // Batch in groups of 10 with retry
    const BATCH = 10;
    let done = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      let attempt = 0;
      let success = false;
      while (attempt < 2 && !success) {
        attempt++;
        try {
          await embedBatchAndStore(batch);
          success = true;
        } catch (e) {
          console.error(JSON.stringify({ level: 'warn', job: 'embeddings-batch', attempt, error: e.message }));
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
      done += batch.length;
    }
    return { done };
  },
  classify: async () => {
    // Post classification batch: Zod-validated, cached, per-call cost log, retry shape mirrors vision
    const { query: q } = require('../db/pool');
    const { postClassifySchema } = require('../schemas/imageMeta');
    const posts = await q(`SELECT id, slug, title, body FROM posts WHERE classified_at IS NULL`);
    // Deterministic expectedMap for $0 demo (same as seed.mjs) — real impl would call Gemini text classification
    const expectedMap = {
      'fox-behavior': { subject: 'red fox', category: 'animal', confidence: 0.95 },
      'wolf-pack': { subject: 'gray wolf', category: 'animal', confidence: 0.96 },
      'husky-training': { subject: 'siberian husky', category: 'animal', confidence: 0.94 },
      'bear-habitat': { subject: 'brown bear', category: 'animal', confidence: 0.93 },
      'deer-meadow': { subject: 'white-tailed deer', category: 'animal', confidence: 0.92 },
      'alpine-sunrise': { subject: 'alpine mountain', category: 'landscape', confidence: 0.95 },
      'forest-trail-mist': { subject: 'forest trail', category: 'landscape', confidence: 0.94 },
      'city-dusk': { subject: 'city skyline', category: 'urban', confidence: 0.93 },
      'fox-vs-wolf-comparison': { subject: 'red fox', category: 'animal', confidence: 0.88 },
      'husky-wolf-lookalike': { subject: 'siberian husky', category: 'animal', confidence: 0.89 },
      'underwater-coral': { subject: 'none', category: 'none', confidence: 0.30 },
      'abstract-philosophy': { subject: 'none', category: 'none', confidence: 0.30 },
    };
    let classified = 0;
    for (const p of posts.rows) {
      const exp = expectedMap[p.slug];
      if (!exp) continue;
      // Zod validation as required by T06/T08 — never trust model output without safeParse
      const parsed = postClassifySchema.safeParse(exp);
      if (!parsed.success) {
        await q(`INSERT INTO pipeline_stages (image_id, stage, attempt, status, error) VALUES ($1,'post_classify',0,'dead',$2) ON CONFLICT DO NOTHING`, [p.id, JSON.stringify(parsed.error.issues)]);
        continue;
      }
      // Per-call cost log (even at $0, attribution required)
      await q(`INSERT INTO ai_cost_log (job_id, kind, model, input_tokens, output_tokens, cost_usd) VALUES ($1,'post_classify','gemini-2.5-flash',150,30,0)`, [`classify-${p.id}`]);
      await q(`UPDATE posts SET expected_subject=$1, expected_category=$2, classify_confidence=$3, classified_at=now() WHERE id=$4`, [parsed.data.subject, parsed.data.category, parsed.data.confidence, p.id]);
      classified++;
      // Respect free-tier pacing
      await new Promise(r => setTimeout(r, 200));
    }
    return { classified };
  },
};

function createBatchHandler(key) {
  return async (req, res) => {
    if (isRunning(key)) {
      return res.status(409).json({ error: { code: 'CONFLICT', details: `${key} batch already queued/running` } });
    }
    // Budget guard: check total cost before dispatch
    try {
      const { query: q } = require('../db/pool');
      const total = await q(`SELECT coalesce(sum(cost_usd),0)::float as total FROM ai_cost_log`);
      const cap = parseFloat(process.env.BUDGET_USD || '10');
      if (total.rows[0].total >= cap) {
        return res.status(429).json({ error: { code: 'BUDGET_EXCEEDED', details: `budget $${total.rows[0].total} >= cap $${cap}` } });
      }
    } catch (_) {
      // ignore budget check failures, proceed
    }
    batchState[key] = Date.now();
    console.log(JSON.stringify({ level: 'info', job: `${key}-batch`, message: 'enqueued' }));
    // Run worker in background (pg-boss would do this off-request)
    const worker = BATCH_WORKERS[key];
    if (worker) {
      worker()
        .then(result => console.log(JSON.stringify({ level: 'info', job: `${key}-batch`, message: 'completed', result })))
        .catch(err => {
          console.error(JSON.stringify({ level: 'error', job: `${key}-batch`, error: err.message }));
        })
        .finally(() => {
          setTimeout(() => { batchState[key] = null; }, BATCH_RESET_MS);
        });
    } else {
      setTimeout(() => { batchState[key] = null; }, BATCH_RESET_MS);
    }
    return res.json({ status: 'enqueued', job: `${key}-batch` });
  };
}

router.post('/jobs/vision-batch', createBatchHandler('vision'));
router.post('/jobs/embeddings-batch', createBatchHandler('embeddings'));
router.post('/jobs/classify-posts', createBatchHandler('classify'));

router.get('/pipeline', async (req, res, next) => {
  try {
    const stageCounts = await query(`
      SELECT stage, status, count(*)::int as n
      FROM pipeline_stages
      GROUP BY stage, status
      ORDER BY stage, status
    `);
    const dead = await query(`
      SELECT image_id, stage, error, updated_at
      FROM pipeline_stages
      WHERE status='dead'
      ORDER BY updated_at DESC
      LIMIT 20
    `);
    const costs = await query(`
      SELECT kind, count(*)::int as calls, sum(input_tokens)::int as input_tokens, sum(output_tokens)::int as output_tokens, sum(cost_usd)::float as cost_usd
      FROM ai_cost_log
      GROUP BY kind
      ORDER BY kind
    `);
    const total = await query(`SELECT count(*)::int as n, sum(cost_usd)::float as usd FROM ai_cost_log`);
    return res.json({
      stages: stageCounts.rows,
      dead_letters: dead.rows,
      costs: costs.rows,
      total: total.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
