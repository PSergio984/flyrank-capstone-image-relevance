#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'corpus/manifest.json'), 'utf8'));
const evalSet = JSON.parse(fs.readFileSync(path.join(root, 'eval/set.json'), 'utf8'));
const postFiles = fs.readdirSync(path.join(root, 'seed/posts')).filter(f => f.endsWith('.md'));
const slugs = postFiles.map(f => path.basename(f, '.md'));
const manifestIds = new Set(manifest.map(m => m.id));

console.log(`Manifest: ${manifest.length} images`);
console.log(`Posts: ${slugs.length} slugs`);
console.log(`Eval cases: ${evalSet.cases.length}, known_bad: ${evalSet.known_bad_pairs.length}`);

// Role counts — per ticket 11 contract: 8 clean / 2 boundary / 2 matchless
const EXPECTED_ROLES = { clean: 8, boundary: 2, matchless: 2 };
const roles = { clean: 0, boundary: 0, matchless: 0 };
for (const c of evalSet.cases) {
  roles[c.role] = (roles[c.role] || 0) + 1;
  if (!['clean', 'boundary', 'matchless'].includes(c.role)) fail(`unknown role ${c.role}`);
  if (!slugs.includes(c.post_slug)) fail(`case post_slug not found in seed/posts: ${c.post_slug}`);
  if (c.role === 'matchless') {
    if (c.correct_image_id !== null) fail(`matchless ${c.post_slug} must have correct_image_id null`);
  } else {
    if (!c.correct_image_id) fail(`non-matchless ${c.post_slug} missing correct_image_id`);
    if (!manifestIds.has(c.correct_image_id)) fail(`correct_image_id not in manifest: ${c.correct_image_id}`);
  }
}
if (roles.clean !== EXPECTED_ROLES.clean) fail(`expected ${EXPECTED_ROLES.clean} clean, got ${roles.clean}`);
if (roles.boundary !== EXPECTED_ROLES.boundary) fail(`expected ${EXPECTED_ROLES.boundary} boundary, got ${roles.boundary}`);
if (roles.matchless !== EXPECTED_ROLES.matchless) fail(`expected ${EXPECTED_ROLES.matchless} matchless, got ${roles.matchless}`);
console.log(`Roles ok: clean=${roles.clean} boundary=${roles.boundary} matchless=${roles.matchless}`);

// known_bad_pairs validation
for (const p of evalSet.known_bad_pairs) {
  if (!slugs.includes(p.post_slug)) fail(`known_bad post_slug not found: ${p.post_slug}`);
  if (!manifestIds.has(p.image_id)) fail(`known_bad image_id not in manifest: ${p.image_id}`);
  if (!['REJECTED', 'NO_CONFIDENT_MATCH'].includes(p.expect)) fail(`known_bad expect must be REJECTED or NO_CONFIDENT_MATCH`);
  if (!p.reason_code) fail(`known_bad missing reason_code`);
}
console.log('known_bad_pairs ok');

// duplicate post_slug check
const seen = new Set();
for (const c of evalSet.cases) {
  if (seen.has(c.post_slug)) fail(`duplicate post_slug in cases: ${c.post_slug}`);
  seen.add(c.post_slug);
}
const EXPECTED_TOTAL = Object.values(EXPECTED_ROLES).reduce((a,b)=>a+b,0);
if (seen.size !== EXPECTED_TOTAL) fail(`expected ${EXPECTED_TOTAL} unique post_slugs, got ${seen.size}`);

console.log('ALL EVAL VALIDATIONS PASSED');
