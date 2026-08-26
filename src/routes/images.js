'use strict';

const express = require('express');
const { z } = require('zod');
const { query } = require('../db/pool');

const router = express.Router();

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    const r = await query(
      `SELECT id, file_path, source_url, license, photographer, category, subject, caption, confidence, flagged, status, created_at
       FROM images WHERE id=$1`,
      [id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', details: `image ${id} not found` } });
    }
    const image = r.rows[0];

    const stages = await query(`SELECT stage, attempt, status, error, updated_at FROM pipeline_stages WHERE image_id=$1 ORDER BY stage`, [id]);

    const suggestions = await query(
      `SELECT id, post_id, score, verdict, explanation, reasons, guard_version, thresholds_used, status, origin, created_at
       FROM suggestions WHERE image_id=$1 ORDER BY created_at DESC`,
      [id]
    );

    return res.json({
      image: {
        id: image.id,
        file_path: image.file_path,
        source_url: image.source_url,
        license: image.license,
        photographer: image.photographer,
        category: image.category,
        subject: image.subject,
        caption: image.caption,
        confidence: parseFloat(image.confidence),
        flagged: image.flagged,
        status: image.status,
      },
      pipeline: stages.rows,
      suggestions: suggestions.rows.map((s) => ({
        id: s.id,
        post_id: s.post_id,
        score: s.score !== null ? parseFloat(s.score) : null,
        verdict: s.verdict,
        explanation: s.explanation,
        reasons: s.reasons,
        guard_version: s.guard_version,
        thresholds_used: s.thresholds_used,
        status: s.status,
        origin: s.origin,
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', details: err.issues.map((i) => i.message).join('; ') } });
    }
    next(err);
  }
});

module.exports = router;
