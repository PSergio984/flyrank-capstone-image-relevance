import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidate } from '../src/services/guard.js';

describe('mismatch guard gates', () => {
  const thr = { similarity: 0.80, confidence: 0.80, flag_floor: 0.70 };
  const foxPost = { expected_subject: 'red fox', expected_category: 'animal' };
  const wolfImg = { subject: 'gray wolf', category: 'animal', confidence: 0.92 };
  const foxImg = { subject: 'red fox', category: 'animal', confidence: 0.92 };
  const lowConfFox = { subject: 'red fox', category: 'animal', confidence: 0.60 };

  it('rejects taxonomy conflict (fox vs wolf)', () => {
    const r = evaluateCandidate({ post: foxPost, image: wolfImg, similarity: 0.85, thresholds: thr });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.reasons[0].code, 'SUBJECT_CONFLICT');
  });

  it('rejects below similarity', () => {
    const r = evaluateCandidate({ post: foxPost, image: foxImg, similarity: 0.50, thresholds: thr });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.reasons[0].code, 'BELOW_SIMILARITY');
  });

  it('rejects low confidence', () => {
    const r = evaluateCandidate({ post: foxPost, image: lowConfFox, similarity: 0.90, thresholds: thr });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.reasons[0].code, 'LOW_CONFIDENCE');
  });

  it('suggests when all gates pass', () => {
    const r = evaluateCandidate({ post: foxPost, image: foxImg, similarity: 0.85, thresholds: thr });
    assert.equal(r.verdict, 'SUGGESTED');
    assert.equal(r.reasons.length, 0);
  });

  it('rejects category conflict (fox vs mountain)', () => {
    const mtn = { subject: 'alpine mountain', category: 'landscape', confidence: 0.92 };
    const r = evaluateCandidate({ post: foxPost, image: mtn, similarity: 0.90, thresholds: thr });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.reasons[0].code, 'CATEGORY_CONFLICT');
  });
});
