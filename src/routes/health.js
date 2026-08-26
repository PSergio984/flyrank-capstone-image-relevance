'use strict';

const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
