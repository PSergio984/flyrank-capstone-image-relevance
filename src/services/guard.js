'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { query } = require('../db/pool');
const { cosineSimilarity } = require('../lib/cosine');
const { isTaxonomyConflict } = require('../lib/taxonomy');

const GUARD_VERSION = 'guard-r1';
const THRESHOLDS_PATH = path.join(__dirname, '../../config/thresholds.json');

function loadThresholds() {
  // Read fresh each call so sweep updates are visible without restart
  const raw = JSON.parse(fs.readFileSync(THRESHOLDS_PATH, 'utf8'));
  return {
    similarity: raw.similarity_threshold,
    confidence: raw.confidence_threshold,
    flag_floor: raw.flag_floor,
    guard_version: raw.guard_version || GUARD_VERSION,
  };
}

function getConfidence(image) {
  return Number(image.confidence);
}

function buildExplanation(image, post, similarity, threshold) {
  return `matched ${image.subject} for expected ${post.expected_subject} (similarity ${similarity.toFixed(3)} >= ${threshold}, caption confidence ${getConfidence(image).toFixed(2)})`;
}

// Per-candidate gate evaluation
function evaluateCandidate({ post, image, similarity, thresholds: thr }) {
  const reasons = [];

  // Gate 1: taxonomy
  const taxonConflict = isTaxonomyConflict(
    { subject: post.expected_subject, category: post.expected_category },
    { subject: image.subject, category: image.category }
  );
  if (taxonConflict) {
    reasons.push({ code: taxonConflict.code, detail: taxonConflict.detail });
    return { verdict: 'REJECTED', reasons, score: similarity, gate: 'taxonomy' };
  }

  // Gate 2: similarity
  if (similarity < thr.similarity) {
    reasons.push({
      code: 'BELOW_SIMILARITY',
      detail: `Similarity ${similarity.toFixed(3)} < threshold ${thr.similarity}`,
    });
    return { verdict: 'REJECTED', reasons, score: similarity, gate: 'similarity' };
  }

  // Gate 3: confidence
  const imgConf = getConfidence(image);
  if (imgConf < thr.confidence) {
    reasons.push({
      code: 'LOW_CONFIDENCE',
      detail: `Image confidence ${imgConf.toFixed(2)} < threshold ${thr.confidence}`,
    });
    return { verdict: 'REJECTED', reasons, score: similarity, gate: 'confidence' };
  }

  return { verdict: 'SUGGESTED', reasons, score: similarity, gate: 'none' };
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

function rankEvaluated(evaluated, thr, post) {
  const suggested = evaluated
    .filter(e => e.verdict === 'SUGGESTED')
    .sort((a, b) => b.similarity - a.similarity);

  if (suggested.length === 0) {
    const sorted = [...evaluated].sort((a, b) => b.similarity - a.similarity);
    const topMiss = sorted[0];
    const reasons = topMiss
      ? [{ code: topMiss.reasons[0]?.code || 'BELOW_SIMILARITY', detail: `No candidate cleared all gates; top similarity ${topMiss.similarity.toFixed(3)}` }]
      : [{ code: 'EMPTY_POOL', detail: 'No candidates evaluated' }];
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

  const ranked = suggested.map(e => ({
    image_id: e.image.id,
    file_path: e.image.file_path,
    subject: e.image.subject,
    category: e.image.category,
    score: e.similarity,
    verdict: 'SUGGESTED',
    explanation: buildExplanation(e.image, post, e.similarity, thr.similarity),
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

async function rankForPost(postId) {
  const thr = loadThresholds();
  const post = await getPostWithEmbedding(postId);
  if (!post) throw Object.assign(new Error('post not found'), { status: 404 });
  if (!post.expected_subject || !post.expected_category) {
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

  const ids = candidates.map(c => c.id);
  const embs = await query(`SELECT entity_id, vector FROM embeddings WHERE entity_type='image_caption' AND entity_id = ANY($1) AND model='gemini-embedding-001'`, [ids]);
  const embMap = new Map(embs.rows.map(r => [r.entity_id, r.vector]));

  const evaluated = [];
  for (const img of candidates) {
    const vec = embMap.get(img.id);
    if (!vec) {
      evaluated.push({
        image: img,
        similarity: 0,
        verdict: 'REJECTED',
        reasons: [{ code: 'BELOW_SIMILARITY', detail: 'Missing embedding for image' }],
        gate: 'similarity',
      });
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

  return rankEvaluated(evaluated, thr, post);
}

async function evaluateForcedCandidate(postId, imageId) {
  const thr = loadThresholds();
  const post = await getPostWithEmbedding(postId);
  if (!post) throw Object.assign(new Error('post not found'), { status: 404 });
  const image = await getImageById(imageId);
  if (!image) throw Object.assign(new Error('image not found'), { status: 404 });

  const postEmb = post.vector;
  const imgEmbRes = await query(`SELECT vector FROM embeddings WHERE entity_type='image_caption' AND entity_id=$1 AND model='gemini-embedding-001'`, [imageId]);
  let similarity = 0;
  if (imgEmbRes.rows.length > 0) {
    similarity = cosineSimilarity(postEmb, imgEmbRes.rows[0].vector);
  }

  const result = evaluateCandidate({ post, image, similarity, thresholds: thr });

  const verdict = result.verdict;
  const reasons = result.reasons;
  const explanation = verdict === 'SUGGESTED'
    ? buildExplanation(image, post, similarity, thr.similarity)
    : reasons[0]?.detail || 'Rejected by guard';

  const status = verdict === 'SUGGESTED' ? 'pending' : 'rejected_by_guard';
  const thresholds_used = JSON.stringify({ similarity: thr.similarity, confidence: thr.confidence });

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

module.exports = { rankForPost, evaluateForcedCandidate, evaluateCandidate, loadThresholds, getPostWithEmbedding, getEligibleImages, buildExplanation };
