'use strict';

const express = require('express');
const { z } = require('zod');
const { query } = require('../db/pool');

const router = express.Router();

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

async function handleReview(req, res, next, action) {
  const statusMap = { approve: 'approved', reject: 'rejected' };
  const targetStatus = statusMap[action];
  try {
    const { id } = paramsSchema.parse(req.params);
    const s = await query('SELECT id, status FROM suggestions WHERE id=$1', [id]);
    if (s.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', details: `suggestion ${id} not found` } });
    }
    if (s.rows[0].status === targetStatus) {
      const cur = await query('SELECT * FROM suggestions WHERE id=$1', [id]);
      return res.json({ suggestion: cur.rows[0] });
    }
    await query('BEGIN');
    await query(`UPDATE suggestions SET status=$1 WHERE id=$2`, [targetStatus, id]);
    await query(`INSERT INTO review_events (suggestion_id, action, actor) VALUES ($1,$2,'reviewer')`, [id, action]);
    await query('COMMIT');
    const updated = await query('SELECT * FROM suggestions WHERE id=$1', [id]);
    return res.json({ suggestion: updated.rows[0] });
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', details: err.issues.map((i) => i.message).join('; ') } });
    }
    next(err);
  }
}

router.post('/:id/approve', (req, res, next) => handleReview(req, res, next, 'approve'));
router.post('/:id/reject', (req, res, next) => handleReview(req, res, next, 'reject'));

module.exports = router;
