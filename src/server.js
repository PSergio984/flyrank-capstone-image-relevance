'use strict';

const { createApp } = require('./app');
const { loadEnv } = require('./config/env');

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: 'info', message: `listening on :${env.PORT}` }));
});
