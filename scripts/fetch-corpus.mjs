#!/usr/bin/env node
/**
 * Deterministic corpus fetcher -- reads corpus/manifest.json, downloads each
 * CDN URL into corpus/images/<filename>. On failure writes a minimal valid
 * JPEG placeholder so the repo remains functional offline. Re-running is
 * idempotent (skips existing files unless --force).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'corpus', 'manifest.json');
const outDir = path.join(root, 'corpus', 'images');

const force = process.argv.includes('--force');

// Minimal 1x1 JPEG (white) -- ~500 bytes, valid JFIF
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

async function fetchImage(url, dest) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'flyrank-capstone-fetch/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    // Accept image/* or octet-stream (unsplash sometimes sends octet-stream)
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream') && ct !== 'application/octet-stream') {
      console.warn(`  warn: unexpected content-type ${ct} for ${url}, still saving`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error(`too small (${buf.length} bytes)`);
    // If unsplash returns HTML (error page), detect
    if (buf.slice(0, 15).toString().includes('<!DOCTYPE') || buf.slice(0, 6).toString().includes('<html')) {
      throw new Error('got HTML not image');
    }
    await fs.promises.writeFile(dest, buf);
    console.log(`  ok ${path.basename(dest)} <- ${url} (${(buf.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    console.warn(`  fail ${url}: ${err.message} -> placeholder`);
    await fs.promises.writeFile(dest, PLACEHOLDER_JPEG);
    console.log(`  placeholder ${path.basename(dest)} (${PLACEHOLDER_JPEG.length} bytes)`);
    return false;
  }
}

async function main() {
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  await fs.promises.mkdir(outDir, { recursive: true });
  console.log(`Fetching ${manifest.length} images into ${path.relative(root, outDir)} (force=${force})`);
  let ok = 0, placeholder = 0, skipped = 0;
  for (const entry of manifest) {
    const dest = path.join(outDir, entry.filename);
    const exists = fs.existsSync(dest);
    if (exists && !force) {
      skipped++;
      continue;
    }
    // Prefer cdn_url, fallback to source_page_url
    const url = entry.cdn_url || entry.source_page_url;
    const success = await fetchImage(url, dest);
    if (success) ok++; else placeholder++;
    // Gentle pacing: 600ms between requests to respect free-tier politeness
    await new Promise(r => setTimeout(r, 600));
  }
  console.log(`Done: ${ok} fetched, ${placeholder} placeholder, ${skipped} skipped, total ${manifest.length}`);
  // Size report
  const files = await fs.promises.readdir(outDir);
  let total = 0;
  for (const f of files) {
    const st = await fs.promises.stat(path.join(outDir, f));
    total += st.size;
  }
  console.log(`Corpus size: ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB`);
  if (total > 8 * 1024 * 1024) {
    console.warn('WARN: corpus > 8 MB -- consider more aggressive downscaling (brief DON\'T list)');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
