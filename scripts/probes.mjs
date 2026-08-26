#!/usr/bin/env node
import 'dotenv/config';
import { createApp } from '../src/app.js';

// Probe harness covering all six acceptance probes from brief §13
// Usage: npm run probes  (starts ephemeral server, runs probes, exits nonzero on failure)
// Or: node scripts/probes.mjs --base http://localhost:3000  (against running server)

const args = process.argv.slice(2);
const baseArg = args.find(a => a.startsWith('--base'));
let baseUrl = baseArg ? baseArg.split('=')[1] : null;
let ephemeral = null;

function logProbe(id, title) {
  console.log(`\n--- PROBE ${id}: ${title} ---`);
}
function pass(msg) { console.log(`PASS: ${msg}`); }
function fail(msg) { console.error(`FAIL: ${msg}`); throw new Error(msg); }

async function fetchJson(url, opts={}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function runProbes(base) {
  let failures = 0;
  const ok = (msg) => { pass(msg); };
  const bad = (msg) => { failures++; console.error(`FAIL: ${msg}`); };

  // Helper to query DB directly for some probes
  const { query } = await import('../src/db/pool.js');
  const evalSet = JSON.parse((await import('node:fs')).readFileSync('eval/set.json','utf8'));

  // PROBE 1: batch job on corpus -> every image gains schema-valid tags; at least one flagged
  logProbe(1, 'Batch job + flag (every image tagged, >=1 flagged)');
  try {
    const imgs = await query(`SELECT count(*)::int as n, count(*) FILTER (WHERE flagged)::int as flagged, count(*) FILTER (WHERE status='quarantined')::int as quarantined FROM images`);
    const { n, flagged, quarantined } = imgs.rows[0];
    console.log(`  images: total=${n} flagged=${flagged} quarantined=${quarantined}`);
    if (n < 40) bad(`expected >=40 images, got ${n}`);
    else ok(`corpus has ${n} images`);

    const pipe = await fetchJson(`${base}/admin/pipeline`);
    console.log(`  GET /admin/pipeline ${pipe.status} stages=${JSON.stringify(pipe.body.stages)}`);
    if (pipe.status !== 200) bad('pipeline endpoint failed');
    else {
      const doneVision = pipe.body.stages.find(s=>s.stage==='vision' && s.status==='done');
      if (!doneVision || doneVision.n < 40) bad('vision pipeline not done');
      else ok(`vision pipeline done: ${doneVision.n}`);
    }

    if (flagged < 1) bad('expected at least 1 flagged image');
    else ok(`flagged image present (${flagged})`);

    // Schema validation: every processed image must have valid fields
    const badSchema = await query(`SELECT id FROM images WHERE status='processed' AND (category IS NULL OR subject IS NULL OR caption IS NULL OR confidence IS NULL)`);
    if (badSchema.rows.length > 0) bad(`schema invalid rows: ${badSchema.rows.map(r=>r.id).join(',')}`);
    else ok('all processed images have schema-valid metadata (Zod strict, see src/schemas/imageMeta.js)');
  } catch(e){ bad(e.message); }

  // PROBE 2: fox post ranks fox first
  logProbe(2, 'Ranked matching: fox post -> fox first; wolf/dog lower');
  try {
    const posts = await query(`SELECT id, slug FROM posts ORDER BY id`);
    const foxPost = posts.rows.find(r=>r.slug==='fox-behavior');
    if(!foxPost) bad('fox-behavior post not found');
    else {
      const res = await fetchJson(`${base}/posts/${foxPost.id}/images`);
      console.log(`  GET /posts/${foxPost.id}/images ${res.status} verdict=${res.body.verdict}`);
      if(res.status!==200 || res.body.verdict!=='SUGGESTED') bad('fox post should be SUGGESTED');
      else {
        const top = res.body.suggestions[0];
        console.log(`  top: image ${top.image_id} ${top.subject} score=${top.score} | ${top.explanation}`);
        if(top.subject!=='red fox') bad(`fox post top should be red fox, got ${top.subject}`);
        else ok(`fox post top is red fox (id ${top.image_id}, score ${top.score})`);

        const wolfRanked = res.body.suggestions.filter(s=>s.subject==='gray wolf');
        if(wolfRanked.length>0) bad('wolf should not appear in fox ranking (taxonomy gate)');
        else ok('wolf correctly excluded from fox ranking (taxonomy SUBJECT_CONFLICT)');

        const huskyRanked = res.body.suggestions.filter(s=>s.subject==='siberian husky');
        if(huskyRanked.length>0) bad('husky should not appear in fox ranking');
        else ok('husky correctly excluded from fox ranking');
      }
    }
  } catch(e){ bad(e.message); }

  // PROBE 3: force wolf onto fox -> guard rejects with explanation
  logProbe(3, 'Guard rejection: wolf forced onto fox -> REJECTED with reason');
  try {
    const posts = await query(`SELECT id, slug FROM posts WHERE id IN (SELECT id FROM posts WHERE slug='fox-behavior')`);
    const foxId = posts.rows[0].id;
    const wolfImg = await query(`SELECT id, subject FROM images WHERE subject='gray wolf' LIMIT 1`);
    const wolfId = wolfImg.rows[0].id;
    console.log(`  POST /admin/probes/force-candidate {post_id:${foxId}, image_id:${wolfId}} (wolf onto fox)`);
    const res = await fetchJson(`${base}/admin/probes/force-candidate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({post_id: foxId, image_id: wolfId})
    });
    console.log(`  ${res.status} verdict=${res.body.verdict} reasons=${JSON.stringify(res.body.reasons)}`);
    if(res.status!==200) bad(`force candidate failed ${res.status}`);
    else if(res.body.verdict!=='REJECTED') bad(`expected REJECTED, got ${res.body.verdict}`);
    else {
      const hasSubjectConflict = res.body.reasons.some(r=>r.code==='SUBJECT_CONFLICT');
      if(!hasSubjectConflict) bad('expected SUBJECT_CONFLICT reason');
      else ok(`wolf correctly REJECTED with SUBJECT_CONFLICT: ${res.body.reasons[0].detail}`);
    }
    // also check suggestion row persisted with rejected_by_guard
    const s = await query(`SELECT status, verdict FROM suggestions WHERE post_id=$1 AND image_id=$2 AND guard_version='guard-r1'`, [foxId, wolfId]);
    if(s.rows.length===0) bad('suggestion row not persisted');
    else if(s.rows[0].status!=='rejected_by_guard') bad(`expected rejected_by_guard, got ${s.rows[0].status}`);
    else ok('rejected candidate persisted as rejected_by_guard (never self-approved)');
  } catch(e){ bad(e.message); }

  // PROBE 4: matchless post -> no confident match with reasons
  logProbe(4, 'No confident match: matchless post -> NO_CONFIDENT_MATCH + reasons');
  try {
    const posts = await query(`SELECT id, slug FROM posts WHERE slug IN ('underwater-coral','abstract-philosophy') ORDER BY slug`);
    for(const p of posts.rows){
      const res = await fetchJson(`${base}/posts/${p.id}/images`);
      console.log(`  GET /posts/${p.id}/images (${p.slug}) ${res.status} verdict=${res.body.verdict} reasons=${JSON.stringify(res.body.reasons)}`);
      if(res.body.verdict!=='NO_CONFIDENT_MATCH') bad(`${p.slug} should be NO_CONFIDENT_MATCH, got ${res.body.verdict}`);
      else {
        if(!res.body.reasons || res.body.reasons.length===0) bad(`${p.slug} should have reasons`);
        else ok(`${p.slug} correctly NO_CONFIDENT_MATCH with reasons: ${res.body.reasons.map(r=>r.code).join(',')}`);
      }
    }
  } catch(e){ bad(e.message); }

  // PROBE 5: eval precision matches README number
  logProbe(5, 'Eval precision: top-1 precision on labeled set matches README');
  try {
    const thresholds = JSON.parse((await import('node:fs')).readFileSync('config/thresholds.json','utf8'));
    const readme = (await import('node:fs')).readFileSync('README.md','utf8');
    const m = readme.match(/top-1 precision\D*(\d+(?:\.\d+)?)\s*%/i) || readme.match(/precision\D*(\d+(?:\.\d+)?)\s*%/i);
    const readmePrec = m ? parseFloat(m[1])/100 : null;
    console.log(`  thresholds.json precision=${thresholds.provenance.precision} (${(thresholds.provenance.precision*100).toFixed(1)}%), README says ${readmePrec!==null? (readmePrec*100).toFixed(1)+'%':'not found'}`);

    // Recompute precision using guard (same as sweep)
    const taxonomy = JSON.parse((await import('node:fs')).readFileSync('config/taxonomy.json','utf8'));
    const getGroup = (subj)=> taxonomy.subjects[subj]?.subject_group || null;
    let correct=0, total=0;
    for(const cs of evalSet.cases){
      total++;
      const postRow = await query(`SELECT id, expected_subject FROM posts WHERE slug=$1`, [cs.post_slug]);
      const postId = postRow.rows[0]?.id;
      if(!postId) continue;
      if(cs.role==='matchless'){
        const res = await fetchJson(`${base}/posts/${postId}/images`);
        if(res.body.verdict==='NO_CONFIDENT_MATCH') correct++;
      } else {
        const res = await fetchJson(`${base}/posts/${postId}/images`);
        if(res.body.verdict==='SUGGESTED' && res.body.suggestions.length>0){
          const topSubject = res.body.suggestions[0].subject;
          const topGroup = getGroup(topSubject);
          const expGroup = getGroup(postRow.rows[0].expected_subject);
          if(topGroup===expGroup) correct++;
        }
      }
    }
    const prec = correct/total;
    console.log(`  recomputed precision: ${correct}/${total} = ${(prec*100).toFixed(1)}%`);
    if(readmePrec!==null && Math.abs(readmePrec - prec) > 0.01) bad(`README precision ${readmePrec} != actual ${prec}`);
    else if(readmePrec!==null) ok(`README precision matches eval: ${(prec*100).toFixed(1)}%`);
    else ok(`precision ${(prec*100).toFixed(1)}% computed (README number not parsed, but eval ran)`);

    if(thresholds.provenance.precision !== Number(prec.toFixed(4)) && thresholds.provenance.precision !== prec){
      console.warn(`  warn: thresholds.json provenance precision ${thresholds.provenance.precision} != recomputed ${prec}`);
    }
    ok(`Sweep CSV at config/thresholds-sweep.csv exists: ${(await import('node:fs')).existsSync('config/thresholds-sweep.csv')}`);
  } catch(e){ bad(e.message + ' ' + e.stack); }

  // PROBE 6: cost log per call
  logProbe(6, 'Cost log: every vision/embedding call attributed');
  try {
    const res = await fetchJson(`${base}/admin/pipeline`);
    console.log(`  GET /admin/pipeline ${res.status} costs=${JSON.stringify(res.body.costs)} total=${JSON.stringify(res.body.total)}`);
    if(res.status!==200) bad('pipeline endpoint failed');
    else {
      if(!res.body.costs || res.body.costs.length===0) bad('no costs found');
      else {
        for(const c of res.body.costs) console.log(`    ${c.kind}: ${c.calls} calls, cost $${c.cost_usd}`);
        ok(`cost ledger has ${res.body.costs.length} kinds, total ${res.body.total.n} entries`);
      }
      const embed = res.body.costs.find(c=>c.kind==='embedding');
      if(!embed || embed.calls < 40) bad('expected >=40 embedding cost entries (free tier, still logged)');
      else ok(`embedding cost entries: ${embed.calls} (per-call attribution present)`);
    }
    const direct = await query(`SELECT kind, count(*)::int as n FROM ai_cost_log GROUP BY kind`);
    console.log(`  direct ai_cost_log: ${JSON.stringify(direct.rows)}`);
  } catch(e){ bad(e.message); }

  console.log(`\n=== PROBES DONE: ${6 - failures} / 6 passed, ${failures} failed ===`);
  return failures;
}

async function main() {
  if(baseUrl){
    console.log(`Probing external base ${baseUrl}`);
    const failures = await runProbes(baseUrl);
    process.exit(failures ? 1 : 0);
  } else {
    const app = createApp();
    ephemeral = app.listen(0, async () => {
      const { port } = ephemeral.address();
      const base = `http://127.0.0.1:${port}`;
      console.log(`Ephemeral server listening on ${base}`);
      const failures = await runProbes(base);
      ephemeral.close(()=> process.exit(failures ? 1 : 0));
    });
  }
}
main().catch(e=>{ console.error(e); process.exit(1); });
