'use strict';

const { query } = require('../db/pool');
const { cosineSimilarity } = require('../lib/cosine');
const { isTaxonomyConflict } = require('../lib/taxonomy');
const thresholds = require('../../config/thresholds.json');

const GUARD_VERSION = thresholds.guard_version || 'guard-r1';

function loadThresholds() {
  return {
    similarity: thresholds.similarity_threshold,
    confidence: thresholds.confidence_threshold,
    flag_floor: thresholds.flag_floor,
    guard_version: GUARD_VERSION,
  };
}

// Per-candidate gate evaluation
function evaluateCandidate({ post, image, similarity, thresholds: thr }) {
  const reasons = [];
  let verdict = 'SUGGESTED';
  let rejectedAt = null;

  // Gate 1: taxonomy
  const taxonConflict = isTaxonomyConflict(
    { subject: post.expected_subject, category: post.expected_category },
    { subject: image.subject, category: image.category }
  );
  if (taxonConflict) {
    verdict = 'REJECTED';
    rejectedAt = 'taxonomy';
    reasons.push({ code: taxonConflict.code, detail: taxonConflict.detail });
    return { verdict, reasons, score: similarity, gate: 'taxonomy' };
  }

  // Gate 2: similarity
  if (similarity < thr.similarity) {
    verdict = 'REJECTED';
    rejectedAt = 'similarity';
    reasons.push({
      code: 'BELOW_SIMILARITY',
      detail: `Similarity ${similarity.toFixed(3)} < threshold ${thr.similarity}`,
    });
    return { verdict, reasons, score: similarity, gate: 'similarity' };
  }

  // Gate 3: confidence
  const imgConf = parseFloat(image.confidence);
  if (imgConf < thr.confidence) {
    verdict = 'REJECTED';
    rejectedAt = 'confidence';
    reasons.push({
      code: 'LOW_CONFIDENCE',
      detail: `Image confidence ${imgConf.toFixed(2)} < threshold ${thr.confidence}`,
    });
    return { verdict, reasons, score: similarity, gate: 'confidence' };
  }

  // All gates passed
  return { verdict, reasons, score: similarity, gate: 'none' };
}

async function getPostWithEmbedding(postId) {
  const r = await query('SELECT id, slug, title, body, expected_subject, expected_category, classify_confidence FROM posts WHERE id=$1', [postId]);
  if (r.rows.length === 0) return null;
  const post = r.rows[0];
  const emb = await query(`SELECT vector FROM embeddings WHERE entity_type='post_body' AND entity_id=$1 AND model='gemini-embedding-001'`, [postId]);
  if (emb.rows.length === 0) throw new Error(`missing embedding for post ${postId}`);
  post.vector = emb.rows[0].vector;
  return post;
}

async function getEligibleImages() {
  const thr = loadThresholds();
  // Gate 0: eligibility filter
  const r = await query(
    `SELECT id, file_path, category, subject, caption, confidence, flagged, status
     FROM images
     WHERE status='processed' AND flagged=false AND confidence >= $1
     ORDER BY id`,
    [thr.flag_floor]
  );
  return r.rows;
}

async function getImageById(imageId) {
  const r = await query('SELECT id, file_path, category, subject, caption, confidence, flagged, status FROM images WHERE id=$1', [imageId]);
  if (r.rows.length === 0) return null;
  return r.rows[0];
}

async function rankForPost(postId, opts = {}) {
  const thr = loadThresholds();
  const post = await getPostWithEmbedding(postId);
  if (!post) throw Object.assign(new Error('post not found'), { status: 404 });
  if (!post.expected_subject || !post.expected_category) {
    // If post not classified, treat as no confident match
    return {
      verdict: 'NO_CONFIDENT_MATCH',
      reasons: [{ code: 'EMPTY_POOL', detail: 'Post classification missing; cannot evaluate candidates' }],
      guard_version: thr.guard_version,
      thresholds_used: { similarity: thr.similarity, confidence: thr.confidence },
      ranked: [],
    };
  }

  const candidates = await getEligibleImages();
  if (candidates.length === 0) {
    return {
      verdict: 'NO_CONFIDENT_MATCH',
      reasons: [{ code: 'EMPTY_POOL', detail: 'No eligible images in pool (all flagged, quarantined, or below flag floor)' }],
      guard_version: thr.guard_version,
      thresholds_used: { similarity: thr.similarity, confidence: thr.confidence },
      ranked: [],
    };
  }

  // Load all candidate embeddings in one query
  const ids = candidates.map(c => c.id);
  const embs = await query(`SELECT entity_id, vector FROM embeddings WHERE entity_type='image_caption' AND entity_id = ANY($1) AND model='gemini-embedding-001'`, [ids]);
  const embMap = new Map(embs.rows.map(r => [r.entity_id, r.vector]));

  const evaluated = [];
  for (const img of candidates) {
    const vec = embMap.get(img.id);
    if (!vec) {
      // Missing embedding: treat as below similarity
      const evalRes = {
        image: img,
        similarity: 0,
        verdict: 'REJECTED',
        reasons: [{ code: 'BELOW_SIMILARITY', detail: 'Missing embedding for image' }],
      };
      evaluated.push(evalRes);
      continue;
    }
    const sim = cosineSimilarity(post.vector, vec);
    const result = evaluateCandidate({ post, image: img, similarity: sim, thresholds: thr });
    evaluated.push({
      image: img,
      similarity: sim,
      verdict: result.verdict,
      reasons: result.reasons,
      gate: result.gate,
    });
  }

  const suggested = evaluated
    .filter(e => e.verdict === 'SUGGESTED')
    .sort((a, b) => b.similarity - a.similarity);

  if (suggested.length === 0) {
    // Aggregate reasons for NO_CONFIDENT_MATCH: collect top near-miss
    const topMiss = evaluated.sort((a, b) => b.similarity - a.similarity)[0];
    const reasons = topMiss
      ? [{ code: topMiss.reasons[0]?.code || 'BELOW_SIMILARITY', detail: `No candidate cleared all gates; top similarity ${topMiss.similarity.toFixed(3)}` }]
      : [{ code: 'EMPTY_POOL', detail: 'No candidates evaluated' }];
    // Also add counts
    const conflictCount = evaluated.filter(e => e.gate === 'taxonomy').length;
    if (conflictCount > 0) reasons.push({ code: 'SUBJECT_CONFLICT', detail: `${conflictCount} candidates rejected by taxonomy gate` });

    return {
      verdict: 'NO_CONFIDENT_MATCH',
      reasons,
      guard_version: thr.guard_version,
      thresholds_used: { similarity: thr.similarity, confidence: thr.confidence },
      ranked: [],
      evaluated,
    };
  }

  // Build ranked results with explanations
  const ranked = suggested.map(e => ({
    image_id: e.image.id,
    file_path: e.image.file_path,
    subject: e.image.subject,
    category: e.image.category,
    score: e.similarity,
    verdict: 'SUGGESTED',
    explanation: `matched ${e.image.subject} for expected ${post.expected_subject} (similarity ${e.similarity.toFixed(3)} >= ${thr.similarity}, caption confidence ${parseFloat(e.image.confidence).toFixed(2)})`,
    reasons: [],
  }));

  return {
    verdict: 'SUGGESTED',
    reasons: [],
    guard_version: thr.guard_version,
    thresholds_used: { similarity: thr.similarity, confidence: thr.confidence },
    ranked,
    evaluated,
  };
}

async function evaluateForcedCandidate(postId, imageId) {
  const thr = loadThresholds();
  const post = await getPostWithEmbedding(postId);
  if (!post) throw Object.assign(new Error('post not found'), { status: 404 });
  const image = await getImageById(imageId);
  if (!image) throw Object.assign(new Error('image not found'), { status: 404 });

  // Need embeddings for both
  const postEmb = post.vector;
  const imgEmbRes = await query(`SELECT vector FROM embeddings WHERE entity_type='image_caption' AND entity_id=$1 AND model='gemini-embedding-001'`, [imageId]);
  let similarity = 0;
  if (imgEmbRes.rows.length > 0) {
    similarity = cosineSimilarity(postEmb, imgEmbRes.rows[0].vector);
  }

  // Gate 0 is skipped (forced)
  // If image is quarantined, still evaluate but it will likely fail taxonomy/similarity
  // Gate 1 taxonomy
  const result = evaluateCandidate({ post, image, similarity, thresholds: thr });

  const verdict = result.verdict;
  const reasons = result.reasons;
  let explanation;
  if (verdict === 'SUGGESTED') {
    explanation = `matched ${image.subject} for expected ${post.expected_subject} (similarity ${similarity.toFixed(3)} >= ${thr.similarity}, caption confidence ${parseFloat(image.confidence).toFixed(2)})`;
  } else {
    explanation = reasons[0]?.detail || 'Rejected by guard';
  }

  // Persist suggestion row per ticket 08/09: one row per guard answer
  // status mapping: SUGGESTED -> pending (human review), REJECTED -> rejected_by_guard
  const status = verdict === 'SUGGESTED' ? 'pending' : 'rejected_by_guard';
  const thresholds_used = JSON.stringify({ similarity: thr.similarity, confidence: thr.confidence });

  // Upsert: unique(post_id,image_id,guard_version)
  const existing = await query(
    `SELECT id FROM suggestions WHERE post_id=$1 AND image_id=$2 AND guard_version=$3`,
    [postId, imageId, thr.guard_version]
  );
  let suggestionId;
  if (existing.rows.length > 0) {
    suggestionId = existing.rows[0].id;
    await query(
      `UPDATE suggestions SET score=$1, verdict=$2, explanation=$3, reasons=$4, thresholds_used=$5, status=$6 WHERE id=$7`,
      [similarity, verdict, explanation, JSON.stringify(reasons), thresholds_used, status, suggestionId]
    );
  } else {
    const ins = await query(
      `INSERT INTO suggestions (post_id, image_id, score, verdict, explanation, reasons, guard_version, thresholds_used, status, origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'forced_probe') RETURNING id`,
      [postId, imageId, similarity, verdict, explanation, JSON.stringify(reasons), thr.guard_version, thresholds_used, status]
    );
    suggestionId = ins.rows[0].id;
  }

  return {
    post_id: postId,
    image_id: imageId,
    score: similarity,
    verdict,
    reasons,
    explanation,
    guard_version: thr.guard_version,
    thresholds_used: { similarity: thr.similarity, confidence: thr.confidence },
    suggestion_id: suggestionId,
    status,
  };
}

module.exports = { rankForPost, evaluateForcedCandidate, evaluateCandidate, loadThresholds, getPostWithEmbedding, getEligibleImages };
