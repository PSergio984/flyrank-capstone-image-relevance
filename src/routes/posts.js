'use strict';

const express = require('express');
const { z } = require('zod');
const { query } = require('../db/pool');
const { rankForPost } = require('../services/guard');

const router = express.Router();

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.get('/:id/images', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    const postCheck = await query('SELECT id FROM posts WHERE id=$1', [id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', details: `post ${id} not found` } });
    }
    const result = await rankForPost(id);
    if (result.verdict === 'SUGGESTED') {
      return res.json({
        verdict: 'SUGGESTED',
        guard_version: result.guard_version,
        thresholds_used: result.thresholds_used,
        suggestions: result.ranked.map((s) => ({
          image_id: s.image_id,
          file_path: s.file_path,
          subject: s.subject,
          category: s.category,
          score: Number(s.score.toFixed(4)),
          explanation: s.explanation,
        })),
      });
    } else {
      return res.json({
        verdict: 'NO_CONFIDENT_MATCH',
        guard_version: result.guard_version,
        thresholds_used: result.thresholds_used,
        reasons: result.reasons,
        suggestions: [],
      });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', details: err.issues.map((i) => i.message).join('; ') } });
    }
    next(err);
  }
});

module.exports = router;
