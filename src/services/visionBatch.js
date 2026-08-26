'use strict';

const path = require('node:path');
const { query } = require('../db/pool');
const { classifyImageValidated } = require('../gemini/vision');
const { FLAG_FLOOR } = require('../gemini/config');

const MAX_RETRIES = 5;
const BUDGET_USD_CAP = parseFloat(process.env.BUDGET_USD || '10');

async function checkBudgetGuard() {
  const r = await query(`SELECT coalesce(sum(cost_usd),0)::float as total FROM ai_cost_log`);
  const total = r.rows[0].total;
  if (total >= BUDGET_USD_CAP) {
    throw Object.assign(new Error(`budget guard: total $${total.toFixed(2)} >= cap $${BUDGET_USD_CAP}`), { status: 429 });
  }
  return total;
}

async function runVisionBatch({ concurrency = 2 } = {}) {
  await checkBudgetGuard();
  const images = await query(`SELECT id, file_path FROM images WHERE status='pending' ORDER BY id`);
  if (images.rows.length === 0) {
    // Also re-process flagged demo if needed? For now only pending
    return { processed: 0, flagged: 0, quarantined: 0 };
  }

  let processed = 0, flagged = 0, quarantined = 0;

  for (const img of images.rows) {
    // Per-call budget guard (ticket 09: SUM(cost) vs cap checked before dispatching new batch work)
    await checkBudgetGuard();
    // Idempotency: claim pipeline_stages row (natural-key idempotency per ticket 05)
    const stage = await query(`SELECT status FROM pipeline_stages WHERE image_id=$1 AND stage='vision'`, [img.id]);
    if (stage.rows.length > 0 && stage.rows[0].status === 'done') {
      continue; // already done, idempotent skip
    }
    await query(`INSERT INTO pipeline_stages (image_id, stage, attempt, status) VALUES ($1,'vision',0,'running')
                 ON CONFLICT (image_id, stage) DO UPDATE SET status='running', updated_at=now()`, [img.id]);

    let attempt = 0;
    let success = false;
    let lastError = null;
    while (attempt < MAX_RETRIES && !success) {
      attempt++;
      try {
        const absPath = path.join(process.cwd(), img.file_path);
        const result = await classifyImageValidated(absPath);
        // Cost log per call (estimate: prompt 258 tokens per image tile + output)
        const inputTokens = result.usage.promptTokenCount || 258;
        const outputTokens = result.usage.candidatesTokenCount || 80;
        // Vision cost is free tier, but log 0 USD; in paid $0.15/1M etc. Keep 0 for $0 rule
        await query(`INSERT INTO ai_cost_log (job_id, kind, model, input_tokens, output_tokens, cost_usd)
                     VALUES ($1,'vision',$2,$3,$4,0)`, [`vision-${img.id}-a${attempt}`, require('../gemini/config').VISION_MODEL, inputTokens, outputTokens]);

        if (result.quarantine) {
          await query(`UPDATE images SET status='quarantined', confidence=0, flagged=false WHERE id=$1`, [img.id]);
          await query(`UPDATE pipeline_stages SET status='dead', error=$1, updated_at=now() WHERE image_id=$2 AND stage='vision'`, [JSON.stringify(result.error.issues), img.id]);
          quarantined++;
          success = true; // quarantine is terminal, not retry
        } else {
          const d = result.data;
          const isFlagged = d.confidence < FLAG_FLOOR;
          await query(`UPDATE images SET category=$1, subject=$2, caption=$3, confidence=$4, flagged=$5, status=$6 WHERE id=$7`,
            [d.category, d.subject, d.caption, d.confidence, isFlagged, isFlagged ? 'flagged' : 'processed', img.id]);
          await query(`UPDATE pipeline_stages SET status='done', attempt=$1, error=NULL, updated_at=now() WHERE image_id=$2 AND stage='vision'`, [attempt, img.id]);
          if (isFlagged) flagged++; else processed++;
          success = true;
        }
      } catch (err) {
        lastError = err.message;
        // Exponential backoff before retry; don't log cost on network error? still log 0
        await new Promise(r => setTimeout(r, 1000 * attempt));
        if (err.status === 429) throw err; // budget guard bubbles
      }
    }
    if (!success) {
      await query(`UPDATE pipeline_stages SET status='failed', error=$1, updated_at=now() WHERE image_id=$2 AND stage='vision'`, [lastError || 'unknown', img.id]);
    }
    // Respect free-tier pacing: 1 req per 2s
    await new Promise(r => setTimeout(r, 1200));
  }

  return { processed, flagged, quarantined };
}

module.exports = { runVisionBatch, checkBudgetGuard };
