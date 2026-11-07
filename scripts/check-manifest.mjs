#!/usr/bin/env node
// The video manifest's check (app-onboarding R9): node scripts/check-manifest.mjs [plans.json path or URL]
// Fails on a key that is not a drill ID in the newest published core/v{N}/plans.json, a URL off go.dvlp.app/clips/,
// a URL naming a file this repo does not have, or a red-marked drill (red-drills.json: old footage that is not DVLP's).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIP_URL = /^https:\/\/go\.dvlp\.app\/clips\/([A-Za-z0-9._-]+\.mp4)$/;

export function checkManifest(manifest, plans, red, hasFile) {
  const drills = new Set(plans.exercises.flatMap(x => x.aliases)), redIds = new Set(red.map(r => r.id)), errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest.json must be one {drillId: url} object'];
  for (const [id, url] of Object.entries(manifest)) {
    if (!drills.has(id)) errors.push(`${id}: not a drill ID in plans.json`);
    if (redIds.has(id)) errors.push(`${id}: red-marked drill, its old footage must never show`);
    const m = typeof url === 'string' && CLIP_URL.exec(url);
    if (!m) errors.push(`${id}: ${url} is not a go.dvlp.app/clips/ mp4`);
    else if (!hasFile(m[1])) errors.push(`${id}: ${m[1]} is not in this repo`);
  }
  return errors;
}

/* the newest core/v{N}/plans.json on go.dvlp.app: versions are added, never removed, so the first missing N ends the search */
async function newestPlans() {
  let found = null;
  for (let n = 1; ; n++) {
    const r = await fetch(`https://go.dvlp.app/core/v${n}/plans.json`);
    if (!r.ok) break;
    found = await r.json();
  }
  if (!found) throw new Error('no core/v{N}/plans.json is published on go.dvlp.app yet: publish core first (dvlp: node scripts/publish-core.mjs)');
  return found;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const src = process.argv[2], read = f => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
  const plans = !src ? await newestPlans() : /^https?:/.test(src) ? await (await fetch(src)).json() : JSON.parse(readFileSync(src, 'utf8'));
  const errors = checkManifest(read('manifest.json'), plans, read('red-drills.json'), f => existsSync(join(ROOT, f)));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`manifest.json: ${Object.keys(read('manifest.json')).length} clips, all good`);
}
