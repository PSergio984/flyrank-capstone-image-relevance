'use strict';

const { z } = require('zod');

const CATEGORIES = ['animal', 'landscape', 'urban', 'food', 'vehicle'];

const ALLOWED_SUBJECTS = [
  'red fox',
  'gray wolf',
  'siberian husky',
  'brown bear',
  'white-tailed deer',
  'alpine mountain',
  'forest trail',
  'desert dune',
  'lake reflection',
  'city skyline',
  'historic building',
  'pasta dish',
  'fruit bowl',
  'red car',
  'mountain bike',
];

const imageMetaSchema = z
  .object({
    subject: z
      .string()
      .min(2)
      .max(60)
      .refine((s) => s === s.toLowerCase(), { message: 'subject must be lowercase' }),
    category: z.enum(CATEGORIES),
    attributes: z.array(z.string().min(2).max(30)).min(3).max(6),
    caption: z.string().min(8).max(160),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const postClassifySchema = z
  .object({
    subject: z.string().min(2).max(60),
    category: z.enum([...CATEGORIES, 'none']),
    confidence: z.number().min(0).max(1),
  })
  .strict();

module.exports = { imageMetaSchema, postClassifySchema, CATEGORIES, ALLOWED_SUBJECTS };
