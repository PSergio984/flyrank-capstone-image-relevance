'use strict';

require('dotenv').config();
const { z } = require('zod');

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(20),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().or(
    z.string().regex(/^postgres(ql)?:\/\//),
  ),
  ADMIN_TOKEN: z.string().optional().default(''),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment - ${issues}`);
  }
  return parsed.data;
}

module.exports = { loadEnv };
