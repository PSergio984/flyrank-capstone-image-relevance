'use strict';

const express = require('express');
const { z } = require('zod');
const { query } = require('../db/pool');

const router = express.Router();

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    const s = await query('SELECT id, status FROM suggestions WHERE id=$1', [id]);
    if (s.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', details: `suggestion ${id} not found` } });
    }
    // Idempotent: if already approved, return current
    if (s.rows[0].status === 'approved') {
      const cur = await query('SELECT * FROM suggestions WHERE id=$1', [id]);
      return res.json({ suggestion: cur.rows[0] });
    }
    // Guard verdict REJECTED cannot be approved? Actually machine never self-approves forced passes; human can approve forced? For now allow any pending.
    await query('BEGIN');
    await query(`UPDATE suggestions SET status='approved' WHERE id=$1`, [id]);
    await query(`INSERT INTO review_events (suggestion_id, action, actor) VALUES ($1,'approve','reviewer')`, [id]);
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
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    const s = await query('SELECT id, status FROM suggestions WHERE id=$1', [id]);
    if (s.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', details: `suggestion ${id} not found` } });
    }
    if (s.rows[0].status === 'rejected') {
      const cur = await query('SELECT * FROM suggestions WHERE id=$1', [id]);
      return res.json({ suggestion: cur.rows[0] });
    }
    await query('BEGIN');
    await query(`UPDATE suggestions SET status='rejected' WHERE id=$1`, [id]);
    await query(`INSERT INTO review_events (suggestion_id, action, actor) VALUES ($1,'reject','reviewer')`, [id]);
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
});

module.exports = router;
