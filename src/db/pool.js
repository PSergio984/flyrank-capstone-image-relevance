'use strict';

const { Pool } = require('pg');
const { loadEnv } = require('../config/env');

const env = loadEnv();

const pool = new Pool({ connectionString: env.DATABASE_URL });

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
