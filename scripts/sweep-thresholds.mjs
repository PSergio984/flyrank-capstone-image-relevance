#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const taxonomy = JSON.parse(fs.readFileSync(path.join(root, 'config/taxonomy.json'), 'utf8'));
const evalSet = JSON.parse(fs.readFileSync(path.join(root, 'eval/set.json'), 'utf8'));

function getSubjectGroup(subject) {
  const info = taxonomy.subjects[subject];
  return info ? info.subject_group : null;
}

async function main() {
  const thresholdsPath = path.join(root, 'config/thresholds.json');
  const baseThresholds = JSON.parse(fs.readFileSync(thresholdsPath, 'utf8'));

  // We'll import guard dynamically but need to override thresholds per iteration
  // For simplicity, we directly compute similarity without calling guard's file thresholds;
  // instead we load embeddings and compute ourselves similar to guard.

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // Load posts with embeddings
  const posts = await pool.query(`SELECT id, slug, expected_subject, expected_category FROM posts ORDER BY id`);
  const postMap = new Map(posts.rows.map(r => [r.slug, r]));
  const images = await pool.query(`SELECT id, file_path, category, subject, confidence, flagged, status FROM images WHERE status='processed' AND flagged=false ORDER BY id`);
  const imageMap = new Map(images.rows.map(r => [r.id, r]));

  // Load embeddings
  const postEmbs = await pool.query(`SELECT entity_id, vector FROM embeddings WHERE entity_type='post_body' AND model='gemini-embedding-001'`);
  const imgEmbs = await pool.query(`SELECT entity_id, vector FROM embeddings WHERE entity_type='image_caption' AND model='gemini-embedding-001'`);
  const postVec = new Map(postEmbs.rows.map(r => [r.entity_id, r.vector]));
  const imgVec = new Map(imgEmbs.rows.map(r => [r.entity_id, r.vector]));

  function cosine(a,b){
    let dot=0, an=0, bn=0;
    for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; an+=a[i]*a[i]; bn+=b[i]*b[i]; }
    return dot / (Math.sqrt(an)*Math.sqrt(bn));
  }
  function isTaxonomyConflict(expected, detected){
    const eInfo = taxonomy.subjects[expected.subject];
    const dInfo = taxonomy.subjects[detected.subject];
    if(!eInfo || !dInfo){
      if(expected.category!==detected.category) return {code:'CATEGORY_CONFLICT'};
      if(expected.subject!==detected.subject) return {code:'SUBJECT_CONFLICT'};
      return null;
    }
    if(eInfo.coarse_category!==dInfo.coarse_category) return {code:'CATEGORY_CONFLICT'};
    if(eInfo.subject_group!==dInfo.subject_group) return {code:'SUBJECT_CONFLICT'};
    return null;
  }

  // Build eval entries with expected subject group
  const cases = evalSet.cases.map(c => ({
    ...c,
    expected: c.role==='matchless' ? null : (() => {
      const p = postMap.get(c.post_slug);
      return { subject: p.expected_subject, category: p.expected_category, group: getSubjectGroup(p.expected_subject) };
    })(),
    postId: postMap.get(c.post_slug)?.id,
    correctGroup: c.role==='matchless' ? null : getSubjectGroup(postMap.get(c.post_slug)?.expected_subject),
  }));

  const knownBad = evalSet.known_bad_pairs;

  const simGrid = [0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90];
  const confGrid = [0.60, 0.70, 0.80];

  let best = null;
  const rows = [];

  for(const simThr of simGrid){
    for(const confThr of confGrid){
      let correct = 0;
      let total = 0;
      const details = [];

      for(const cs of cases){
        total++;
        const postId = cs.postId;
        if(!postId){ details.push(`${cs.post_slug}: missing post`); continue; }
        const postRow = posts.rows.find(r=>r.id===postId);
        const pVec = postVec.get(postId);
        if(!pVec){ details.push(`${cs.post_slug}: no post vec`); continue; }

        // Evaluate all eligible images
        let bestCand = null;
        let bestSim = -1;
        for(const img of images.rows){
          const iVec = imgVec.get(img.id);
          if(!iVec) continue;
          const sim = cosine(pVec, iVec);
          const tax = isTaxonomyConflict({subject: postRow.expected_subject, category: postRow.expected_category}, {subject: img.subject, category: img.category});
          if(tax) continue;
          if(sim < simThr) continue;
          if(parseFloat(img.confidence) < confThr) continue;
          if(sim > bestSim){ bestSim = sim; bestCand = img; }
        }

        if(cs.role==='matchless'){
          if(bestCand===null){ correct++; details.push(`${cs.post_slug}: PASS matchless correctly NO_MATCH`); }
          else { details.push(`${cs.post_slug}: FAIL matchless got ${bestCand.subject} ${bestSim.toFixed(3)}`); }
        } else {
          if(bestCand===null){ details.push(`${cs.post_slug}: FAIL no candidate (expected ${cs.expected.subject})`); }
          else {
            const candGroup = getSubjectGroup(bestCand.subject);
            if(candGroup===cs.correctGroup){ correct++; details.push(`${cs.post_slug}: PASS top ${bestCand.subject} (${candGroup}) sim ${bestSim.toFixed(3)}`); }
            else { details.push(`${cs.post_slug}: FAIL top ${bestCand.subject} (${candGroup}) != expected ${cs.correctGroup} sim ${bestSim.toFixed(3)}`); }
          }
        }
      }

      // Known bad check: forced candidate must be rejected
      let badFails = 0;
      for(const kb of knownBad){
        const postRow = postMap.get(kb.post_slug);
        if(!postRow) continue;
        const pVec = postVec.get(postRow.id);
        // Find image by manifest id via file_path (parameterized to avoid injection)
        const allImgs = await pool.query(`SELECT id, subject, category, confidence FROM images WHERE file_path LIKE $1 LIMIT 1`, [`%${kb.image_id}%`]);
        const img = allImgs.rows[0];
        if(!img) continue;
        const iv = await pool.query(`SELECT vector FROM embeddings WHERE entity_type='image_caption' AND entity_id=$1 AND model='gemini-embedding-001'`, [img.id]);
        const iVec = imgVec.get(img.id) || iv.rows[0]?.vector;
        let verdict = 'REJECTED';
        // Simulate gate evaluation for forced
        const tax = isTaxonomyConflict({subject: postRow.expected_subject, category: postRow.expected_category}, {subject: img.subject, category: img.category});
        if(tax){
          verdict='REJECTED';
        } else {
          const sim = iVec && pVec ? cosine(pVec, iVec) : 0;
          if(sim < simThr) verdict='REJECTED';
          else if(parseFloat(img.confidence) < confThr) verdict='REJECTED';
          else verdict='SUGGESTED';
        }
        if(verdict!=='REJECTED'){ badFails++; }
      }

      const precision = correct/ total;
      const passKnownBad = badFails===0;
      rows.push({ simThr, confThr, correct, total, precision, badFails, passKnownBad, details });

      console.log(`sim=${simThr} conf=${confThr} => ${correct}/${total} ${(precision*100).toFixed(1)}% badFails=${badFails} ${passKnownBad?'PASS':'FAIL BAD'}`);

      if(passKnownBad){
        if(!best || precision > best.precision || (precision===best.precision && (simThr > best.simThr || (simThr===best.simThr && confThr > best.confThr)))){
          best = { simThr, confThr, correct, total, precision, badFails, details };
        }
      }
    }
  }

  console.log('\n=== BEST ===');
  if(best){
    console.log(`sim=${best.simThr} conf=${best.confThr} precision ${(best.precision*100).toFixed(1)}% ${best.correct}/${best.total}`);
    console.log(best.details.join('\n'));
    // Write to config/thresholds.json
    const out = {
      version: 'thresholds-v2-sweep',
      description: 'Sweep-derived operating point maximizing top-1 precision under zero-known-bad constraint',
      flag_floor: baseThresholds.flag_floor,
      similarity_threshold: best.simThr,
      confidence_threshold: best.confThr,
      guard_version: baseThresholds.guard_version,
      provenance: {
        method: 'grid sweep',
        sim_grid: simGrid,
        conf_grid: confGrid,
        eval_set: 'eval/set.json',
        precision: Number(best.precision.toFixed(4)),
        correct: best.correct,
        total: best.total,
        model_vision: 'gemini-2.5-flash',
        model_embedding: 'gemini-embedding-001@768',
        sweeptime: new Date().toISOString(),
      }
    };
    fs.writeFileSync(thresholdsPath, JSON.stringify(out,null,2));
    console.log(`Wrote ${thresholdsPath}`);

    // Also write CSV artifact
    const csvPath = path.join(root, 'config/thresholds-sweep.csv');
    const header = 'similarity,confidence,correct,total,precision,badFails,passKnownBad\n';
    const csv = header + rows.map(r=>`${r.simThr},${r.confThr},${r.correct},${r.total},${r.precision.toFixed(4)},${r.badFails},${r.passKnownBad}`).join('\n');
    fs.writeFileSync(csvPath, csv);
    console.log(`Wrote ${csvPath}`);
  } else {
    console.log('No operating point satisfied zero-known-bad constraint');
  }

  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1);});
