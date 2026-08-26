'use strict';

const express = require('express');
const healthRoute = require('./routes/health');
const postsRoute = require('./routes/posts');
const imagesRoute = require('./routes/images');
const suggestionsRoute = require('./routes/suggestions');
const adminRoute = require('./routes/admin');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // Public plane.
  app.use('/health', healthRoute);
  app.use('/posts', postsRoute);
  app.use('/images', imagesRoute);
  app.use('/suggestions', suggestionsRoute);
  app.use('/admin', adminRoute);

  // Unknown route -> clean 404 (never a stack trace).
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', details: `no route for ${req.method} ${req.path}` } });
  });

  // Boundary error mapper: unexpected faults -> 500 with correlation id only.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', details: 'request body is not valid JSON' } });
    }
    const id = require('crypto').randomUUID();
    console.error(JSON.stringify({ level: 'error', correlation_id: id, message: err.message }));
    return res.status(500).json({ error: { code: 'INTERNAL', details: `correlation id ${id}` } });
  });

  return app;
}

module.exports = { createApp };
