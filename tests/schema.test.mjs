import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { imageMetaSchema, postClassifySchema } from '../src/schemas/imageMeta.js';

describe('imageMetaSchema', () => {
  it('accepts valid metadata', () => {
    const r = imageMetaSchema.safeParse({
      subject: 'red fox',
      category: 'animal',
      attributes: ['orange fur', 'white tail', 'pointed ears'],
      caption: 'A red fox prowls through snow.',
      confidence: 0.92,
    });
    assert.equal(r.success, true);
  });
  it('rejects unknown subject (must be from allow list)', () => {
    const r = imageMetaSchema.safeParse({
      subject: 'dragon',
      category: 'animal',
      attributes: ['scaly', 'fiery', 'wings'],
      caption: 'A dragon breathes fire.',
      confidence: 0.9,
    });
    assert.equal(r.success, false);
  });
  it('rejects low attribute count', () => {
    const r = imageMetaSchema.safeParse({
      subject: 'red fox',
      category: 'animal',
      attributes: ['only one'],
      caption: 'A red fox.',
      confidence: 0.5,
    });
    assert.equal(r.success, false);
  });
});

describe('postClassifySchema', () => {
  it('accepts none for matchless', () => {
    const r = postClassifySchema.safeParse({ subject: 'none', category: 'none', confidence: 0.3 });
    assert.equal(r.success, true);
  });
});
