#!/usr/bin/env node
// Imports the user's own drill videos from Drive into this repo and manifest.json: node scripts/import-drive-clips.mjs [plans.json]
// Drive stays the master copy; the workbook says which drills are the user's (not red). Re-run it after replacing a red drill's
// video and clearing its red: drills already in the manifest are skipped, so a run with nothing new changes nothing.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, newestPlans } from './check-manifest.mjs';
import { LIBRARY_CSV, BOOK_XLSX, drillRows, redIds } from './workbook.mjs';

const CLIP_BASE = 'https://go.dvlp.app/clips/';

/* What a run will do, worked out before anything is downloaded. One file per Drive file, not per drill: a Drive file already
   hosted keeps its URL, and a new one is named after the first drill ID that uses it. Red drills never get a key (R9). */
export function planImport({ drills, red, plans, manifest }) {
  const inPlans = new Set(plans.exercises.flatMap(x => x.aliases)), byId = new Map(drills.map(d => [d.id, d]));
  const hosted = new Map(), next = { ...manifest }, files = [], skipped = [], noLink = [];
  for (const [id, url] of Object.entries(manifest)) {
    const d = byId.get(id);
    if (d && d.driveId && !hosted.has(d.driveId)) hosted.set(d.driveId, url);
  }
  for (const d of drills) {
    if (red.has(d.id) || d.id in manifest) continue;
    if (!inPlans.has(d.id)) { skipped.push(d.id); continue; }
    if (!d.driveId) { noLink.push(d.id); continue; }
    if (!hosted.has(d.driveId)) { hosted.set(d.driveId, CLIP_BASE + d.id + '.mp4'); files.push({ driveId: d.driveId, file: d.id + '.mp4', ids: [] }); }
    next[d.id] = hosted.get(d.driveId);
    const f = files.find(x => x.driveId === d.driveId);
    if (f) f.ids.push(d.id);
  }
  return { manifest: next, files, skipped, noLink };
}

/* Both stop the run before anything is written. Red now but not before: a drill only leaves red when the user replaces its video,
   never the reverse. Out of red with the same video as when it was red: more likely a misread fill than a replacement, and a
   misread must never give old footage a key (R9). */
export function newlyRed(red, previousRed) {
  const before = new Set(previousRed.map(r => r.id));
  return [...red].filter(id => !before.has(id));
}
export function clearedWithSameVideo(red, previousRed, drills) {
  const now = new Map(drills.map(d => [d.id, d.video]));
  return previousRed.filter(r => !red.has(r.id) && now.has(r.id) && String(now.get(r.id)).trim() === String(r.video).trim()).map(r => r.id);
}

export function isVideo(buf) {
  return buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp';
}

export function sortedManifest(m) {
  return Object.fromEntries(Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })));
}

/* The hosted clips' look, measured on the 30 the manifest uses against their Drive originals (SSIM ≥ 0.99): 540×960, the whole frame fitted to the width over a
   blurred fill (the other recipe, a fixed crop, can cut a moving player out). H.264 CRF 24, yuv420p, no audio, +faststart. */
export const ENCODE_FILTER = '[0:v]split[a][b];[a]scale=540:960:force_original_aspect_ratio=increase,crop=540:960,boxblur=20[bg];' +
  '[b]scale=540:-2[fg];[bg][fg]overlay=0:(H-h)/2,setsar=1';

/* a bound on one download, not a retry: a stalled or huge Drive answer fails that drill */
const DOWNLOAD_MS = 5 * 60 * 1000, DOWNLOAD_MAX = 1024 * 1024 * 1024;
async function download(id) {
  const r = await fetch('https://drive.google.com/uc?export=download&id=' + id, { signal: AbortSignal.timeout(DOWNLOAD_MS) });
  if (!r.ok) throw new Error(`Drive answered ${r.status}`);
  if (Number(r.headers.get('content-length') || 0) > DOWNLOAD_MAX) throw new Error('the Drive file is over 1 GB');
  const buf = Buffer.from(await r.arrayBuffer());
  /* Drive labels .mov files inconsistently, so the file's own signature decides: MP4 and MOV both carry ftyp at byte 4 */
  if (!isVideo(buf)) throw new Error(`Drive sent ${r.headers.get('content-type') || 'no type'}, not a video (is the file shared with anyone with the link?)`);
  return buf;
}
async function encode(ffmpeg, buf, out) {
  const work = mkdtempSync(join(tmpdir(), 'clip-')), src = join(work, 'src');
  try {
    writeFileSync(src, buf);
    const part = join(work, 'out.mp4');
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file', '-i', src, '-filter_complex', ENCODE_FILTER, '-an', '-c:v', 'libx264',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', part], { stdio: ['ignore', 'ignore', 'pipe'] });
    writeFileSync(out, readFileSync(part));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const read = f => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
  const fetched = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} answered ${r.status}`); return r; };
  const getText = async url => (await fetched(url)).text(), getBytes = async url => Buffer.from(await (await fetched(url)).arrayBuffer());
  const src = process.argv[2];
  const plans = src ? JSON.parse(readFileSync(src, 'utf8')) : await newestPlans();
  const drills = drillRows(await getText(LIBRARY_CSV)), red = redIds(await getBytes(BOOK_XLSX)), previousRed = read('red-drills.json');
  const fresh = newlyRed(red, previousRed), same = clearedWithSameVideo(red, previousRed, drills);
  if (fresh.length) { console.error(`stopped: newly red since the last run, check the workbook: ${fresh.join(' ')}`); process.exit(1); }
  if (same.length) { console.error(`stopped: no longer red but the same video as when red, check the workbook: ${same.join(' ')}`); process.exit(1); }
  const redList = drills.filter(d => red.has(d.id)).map(d => ({ id: d.id, name: d.name, video: d.video, skill: d.skill }));
  writeFileSync(join(ROOT, 'red-drills.json'), JSON.stringify(redList, null, 1) + '\n');

  const plan = planImport({ drills, red, plans, manifest: read('manifest.json') });
  const ffmpeg = plan.files.length ? (await import('ffmpeg-static')).default : '';
  const failed = new Set();
  for (const f of plan.files) {
    try {
      await encode(ffmpeg, await download(f.driveId), join(ROOT, f.file));
      console.log(`wrote ${f.file} for ${f.ids.join(' ')}`);
    } catch (err) {
      f.ids.forEach(id => failed.add(id));
      console.error(`${f.ids.join(' ')}: not imported, ${String(err.message).split('\n')[0]}`);
    }
  }
  const manifest = Object.fromEntries(Object.entries(plan.manifest).filter(([id]) => !failed.has(id)));
  writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(sortedManifest(manifest), null, 2) + '\n');
  if (plan.skipped.length) console.log(`skipped, not drills in plans.json: ${plan.skipped.join(' ')}`);
  if (plan.noLink.length) console.log(`skipped, no Drive link: ${plan.noLink.join(' ')}`);
  console.log(`manifest.json: ${Object.keys(manifest).length} clips; red-drills.json: ${redList.length} drills${failed.size ? `; ${failed.size} failed` : ''}`);
  if (failed.size) process.exit(1);
}
