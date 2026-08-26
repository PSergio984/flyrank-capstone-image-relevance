'use strict';

function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec.slice();
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error(`cosine: dims mismatch ${a.length} vs ${b.length}`);
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm);
  if (denom === 0) return 0;
  return dot / denom;
}

module.exports = { l2Normalize, cosineSimilarity };
