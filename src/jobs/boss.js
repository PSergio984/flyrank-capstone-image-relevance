'use strict';

/**
 * pg-boss wiring — production batch runner (ticket 05).
 * In the $0 demo we run batches in-process via src/routes/admin.js BATCH_WORKERS
 * with the same semantics (natural-key idempotency, retries, per-call cost).
 * This module shows the prod swap: Boss.start() + publish/subscribe.
 *
 * Usage (prod):
 *   const boss = createBoss();
 *   await boss.start();
 *   await boss.publish('vision-process', { imageId }, { singletonKey: `vision:${imageId}` });
 *   boss.work('vision-process', { retryLimit: 5, retryBackoff: true }, handler);
 */

const PgBoss = require('pg-boss');

function createBoss() {
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    // Natural-key idempotency via singletonKey, retries via retryLimit
    retryLimit: 5,
    retryBackoff: true,
    expireInHours: 12,
  });

  boss.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', source: 'pg-boss', error: err.message }));
  });

  return boss;
}

// Example handler shape for vision — mirrors src/services/visionBatch.js
async function visionHandler(job) {
  const { imageId } = job.data;
  const { query } = require('../db/pool');
  // Idempotency: check pipeline_stages before work (same as in-process)
  const stage = await query(`SELECT status FROM pipeline_stages WHERE image_id=$1 AND stage='vision'`, [imageId]);
  if (stage.rows.length > 0 && stage.rows[0].status === 'done') return;
  // ... call classifyImageValidated, update images, ai_cost_log, pipeline_stages
}

module.exports = { createBoss, visionHandler };
