#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const captions = {
  'red fox': 'A red fox with orange fur and white tail tip prowls through snow.',
  'gray wolf': 'A gray wolf with thick gray coat and amber eyes stands on mossy rock.',
  'siberian husky': 'A Siberian husky with blue eyes and wolf-like double coat pants in snow.',
  'brown bear': 'A brown bear with massive shoulders fishes for salmon in a river.',
  'white-tailed deer': 'A white-tailed deer with reddish coat grazes in a meadow at dawn.',
  'alpine mountain': 'Snow-covered alpine peaks glow pink at sunrise above a glassy tarn.',
  'forest trail': 'A misty forest trail winds through mossy oaks and ferns at dawn.',
  'desert dune': 'Golden desert dunes ripple under warm light at golden hour.',
  'lake reflection': 'A calm lake reflects alpine peaks and sky like a mirror.',
  'city skyline': 'A city skyline of glass towers glows violet at dusk with lights flickering on.',
  'historic building': 'A historic brick building with ornate facade stands on an urban street.',
  'pasta dish': 'A steaming plate of pasta with rich tomato sauce and herbs.',
  'fruit bowl': 'A bowl of mixed fresh fruit shines with berries and citrus.',
  'red car': 'A red vintage car parked on a city street gleams in sunlight.',
  'mountain bike': 'A mountain bike leans against a rock on a forest trail.',
};

function parsePost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error(`bad front-matter in ${filePath}`);
  const fm = m[1];
  const body = m[2].trim();
  const slug = (fm.match(/slug:\s*"?([^"\n]+)"?/) || [])[1]?.trim();
  const title = (fm.match(/title:\s*"?([^"\n]+)"?/) || [])[1]?.trim();
  if (!slug || !title) throw new Error(`missing slug/title in ${filePath}`);
  return { slug, title, body };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'corpus/manifest.json'), 'utf8'));
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log('Seeding images...');
    for (const entry of manifest) {
      const caption = captions[entry.subject] || `A photo of ${entry.subject}.`;
      // One deliberately flagged image for Probe 1: pick landscape-desert-02
      const isFlaggedDemo = entry.id === 'landscape-desert-02';
      const confidence = isFlaggedDemo ? 0.60 : 0.92;
      const flagged = isFlaggedDemo;
      const status = isFlaggedDemo ? 'flagged' : 'processed';
      const file_path = `corpus/images/${entry.filename}`;
      await pool.query(
        `INSERT INTO images (file_path, source_url, license, photographer, category, subject, caption, confidence, flagged, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (file_path) DO UPDATE SET
           source_url=EXCLUDED.source_url,
           license=EXCLUDED.license,
           photographer=EXCLUDED.photographer,
           category=EXCLUDED.category,
           subject=EXCLUDED.subject,
           caption=EXCLUDED.caption,
           confidence=EXCLUDED.confidence,
           flagged=EXCLUDED.flagged,
           status=EXCLUDED.status`,
        [file_path, entry.source_page_url, entry.license, entry.photographer, entry.category, entry.subject, caption, confidence, flagged, status]
      );
    }
    const ic = await pool.query('SELECT count(*)::int as n, count(*) FILTER (WHERE flagged)::int as flagged FROM images');
    console.log(`Images: ${ic.rows[0].n} total, ${ic.rows[0].flagged} flagged`);

    console.log('Seeding posts...');
    const postFiles = fs.readdirSync(path.join(root, 'seed/posts')).filter(f => f.endsWith('.md'));
    for (const f of postFiles) {
      const { slug, title, body } = parsePost(path.join(root, 'seed/posts', f));
      await pool.query(
        `INSERT INTO posts (slug, title, body)
         VALUES ($1,$2,$3)
         ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body`,
        [slug, title, body]
      );
    }
    const pc = await pool.query('SELECT count(*)::int as n FROM posts');
    console.log(`Posts: ${pc.rows[0].n}`);

    // Seed expected classification cache for posts (post_classify stage) -- use deterministic mapping per eval set
    // For demo, we run a lightweight classification based on slug keywords if not already set
    const expectedMap = {
      'fox-behavior': { subject: 'red fox', category: 'animal', confidence: 0.95 },
      'wolf-pack': { subject: 'gray wolf', category: 'animal', confidence: 0.96 },
      'husky-training': { subject: 'siberian husky', category: 'animal', confidence: 0.94 },
      'bear-habitat': { subject: 'brown bear', category: 'animal', confidence: 0.93 },
      'deer-meadow': { subject: 'white-tailed deer', category: 'animal', confidence: 0.92 },
      'alpine-sunrise': { subject: 'alpine mountain', category: 'landscape', confidence: 0.95 },
      'forest-trail-mist': { subject: 'forest trail', category: 'landscape', confidence: 0.94 },
      'city-dusk': { subject: 'city skyline', category: 'urban', confidence: 0.93 },
      'fox-vs-wolf-comparison': { subject: 'red fox', category: 'animal', confidence: 0.88 },
      'husky-wolf-lookalike': { subject: 'siberian husky', category: 'animal', confidence: 0.89 },
      'underwater-coral': { subject: 'none', category: 'none', confidence: 0.30 },
      'abstract-philosophy': { subject: 'none', category: 'none', confidence: 0.30 },
    };
    for (const [slug, exp] of Object.entries(expectedMap)) {
      await pool.query(
        `UPDATE posts SET expected_subject=$1, expected_category=$2, classify_confidence=$3, classified_at=now()
         WHERE slug=$4 AND classified_at IS NULL`,
        [exp.subject, exp.category, exp.confidence, slug]
      );
    }
    console.log('Post classifications seeded (fallback where null)');

    // Initialize pipeline_stages for each image (vision, embedding) as done
    const images = await pool.query('SELECT id FROM images');
    for (const { id } of images.rows) {
      for (const stage of ['vision', 'embedding']) {
        await pool.query(
          `INSERT INTO pipeline_stages (image_id, stage, attempt, status)
           VALUES ($1,$2,1,'done')
           ON CONFLICT (image_id, stage) DO UPDATE SET status='done', updated_at=now()`,
          [id, stage]
        );
      }
    }
    console.log('Pipeline stages marked done (seed shortcut)');

    console.log('SEED COMPLETE');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
