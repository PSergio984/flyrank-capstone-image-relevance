'use strict';

const { z } = require('zod');
const taxonomy = require('../../config/taxonomy.json');

// Single source of truth — taxonomy.json owns subjects/categories (shotgun surgery fix)
const ALLOWED_SUBJECTS = Object.keys(taxonomy.subjects);
const CATEGORIES = taxonomy.categories;

const imageMetaSchema = z
  .object({
    subject: z.enum(ALLOWED_SUBJECTS),
    category: z.enum(CATEGORIES),
    attributes: z.array(z.string().min(2).max(30)).min(3).max(6),
    caption: z.string().min(8).max(160),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const postClassifySchema = z
  .object({
    subject: z.enum([...ALLOWED_SUBJECTS, 'none']),
    category: z.enum([...CATEGORIES, 'none']),
    confidence: z.number().min(0).max(1),
  })
  .strict();

module.exports = { imageMetaSchema, postClassifySchema, CATEGORIES, ALLOWED_SUBJECTS };
