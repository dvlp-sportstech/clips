// node --test "scripts/*.test.mjs" — the Drive import's plan and its stop checks, with no Drive or encoder, and the workbook CSV read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, newlyRed, clearedWithSameVideo } from './import-drive-clips.mjs';
import { drillRows, driveId } from './workbook.mjs';

const PLANS = { exercises: [{ aliases: ['BH1_1', 'BH3_1'] }, { aliases: ['BH1_2'] }, { aliases: ['FW1_1'] }, { aliases: ['SH1_1'] }, { aliases: ['FN1_1'] }] };
const D = (id, driveId) => ({ id, name: id, video: id + '.mov', driveId, skill: '' });
const URL = f => `https://go.dvlp.app/clips/${f}`;
const DRIVE = { a: 'aaaaaaaaaaaaaaaaaaaaaaaaa', b: 'bbbbbbbbbbbbbbbbbbbbbbbbb', c: 'ccccccccccccccccccccccccc', d: 'ddddddddddddddddddddddddd' };

test('a red drill gets no key and no file', () => {
  const p = planImport({ drills: [D('SH1_1', DRIVE.a), D('FW1_1', DRIVE.b)], red: new Set(['SH1_1']), plans: PLANS, manifest: {} });
  assert.deepEqual(Object.keys(p.manifest), ['FW1_1']);
  assert.deepEqual(p.files.map(f => f.file), ['FW1_1.mp4']);
});

test('a Drive file shared by two drills is written once, named after the first, and both point at it', () => {
  const p = planImport({ drills: [D('BH1_1', DRIVE.c), D('BH3_1', DRIVE.c)], red: new Set(), plans: PLANS, manifest: {} });
  assert.deepEqual(p.files, [{ driveId: DRIVE.c, file: 'BH1_1.mp4', ids: ['BH1_1', 'BH3_1'] }]);
  assert.equal(p.manifest.BH1_1, URL('BH1_1.mp4'));
  assert.equal(p.manifest.BH3_1, URL('BH1_1.mp4'));
});

test('a Drive file already hosted under another drill reuses its URL; nothing is downloaded', () => {
  const p = planImport({ drills: [D('BH1_1', DRIVE.a), D('BH3_1', DRIVE.a)], red: new Set(), plans: PLANS, manifest: { BH1_1: URL('low-pound-dribbles-v2.mp4') } });
  assert.deepEqual(p.files, []);
  assert.equal(p.manifest.BH3_1, URL('low-pound-dribbles-v2.mp4'));
});

test('a drill whose red is cleared is picked up on the next run, and a run with nothing new plans nothing', () => {
  const drills = [D('SH1_1', DRIVE.d)];
  assert.deepEqual(planImport({ drills, red: new Set(['SH1_1']), plans: PLANS, manifest: {} }).files, []);
  const cleared = planImport({ drills, red: new Set(), plans: PLANS, manifest: {} });
  assert.deepEqual(cleared.files.map(f => f.file), ['SH1_1.mp4']);
  const again = planImport({ drills, red: new Set(), plans: PLANS, manifest: cleared.manifest });
  assert.deepEqual(again.files, []);
  assert.deepEqual(again.manifest, cleared.manifest);
});

test('a drill not in plans.json is skipped and reported; one with no Drive link too', () => {
  const p = planImport({ drills: [D('BH3_25', DRIVE.a), D('FN1_1', '')], red: new Set(), plans: PLANS, manifest: {} });
  assert.deepEqual(p.skipped, ['BH3_25']);
  assert.deepEqual(p.noLink, ['FN1_1']);
  assert.deepEqual(p.manifest, {});
});

test('the stop checks: a drill red now but not before, and one out of red with the same video as when red', () => {
  assert.deepEqual(newlyRed(new Set(['A', 'B']), [{ id: 'A' }]), ['B']);
  assert.deepEqual(newlyRed(new Set(['A']), [{ id: 'A' }, { id: 'C' }]), []);
  const prev = [{ id: 'A', video: 'Old A.mp4' }, { id: 'C', video: 'Old C.mp4' }];
  assert.deepEqual(clearedWithSameVideo(new Set(['A']), prev, [D('C', DRIVE.a)]), [], 'C has a new video: fine');
  assert.deepEqual(clearedWithSameVideo(new Set(['A']), prev, [{ ...D('C', DRIVE.a), video: ' Old C.mp4 ' }]), ['C'], 'C left red with its old video');
  assert.deepEqual(clearedWithSameVideo(new Set(['A', 'C']), prev, [{ ...D('C', DRIVE.a), video: 'Old C.mp4' }]), [], 'still red');
});

test('the workbook CSV: both Drive link shapes, the link taken by position, only drill rows', () => {
  assert.equal(driveId('https://drive.google.com/file/d/1DNMoyD7N8x0EbiUoZ1GAp_cRjxpAUgba/view?usp=sharing'), '1DNMoyD7N8x0EbiUoZ1GAp_cRjxpAUgba');
  assert.equal(driveId('https://drive.google.com/open?id=1DNMoyD7N8x0EbiUoZ1GAp_cRjxpAUgba'), '1DNMoyD7N8x0EbiUoZ1GAp_cRjxpAUgba');
  const csv = 'Drill ID,Drill Name,Instructions,Demo Video,#REF!,Equipment,Tag,Court,Skill\n' +
    'BH1_1,"Pounds, low",50 reps, Low Pounds.mp4 ,https://drive.google.com/open?id=1DNMoyD7N8x0EbiUoZ1GAp_cRjxpAUgba,1 Ball,,Anywhere,Ball Handling\n,,,,\n';
  assert.deepEqual(drillRows(csv), [{ id: 'BH1_1', name: 'Pounds, low', video: 'Low Pounds.mp4', driveId: '1DNMoyD7N8x0EbiUoZ1GAp_cRjxpAUgba', skill: 'Ball Handling' }]);
});
