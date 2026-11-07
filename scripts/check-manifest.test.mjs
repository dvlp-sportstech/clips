// node --test "scripts/*.test.mjs" — the manifest check rejects each kind of bad entry and passes a good one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkManifest } from './check-manifest.mjs';

const PLANS = { exercises: [{ aliases: ['BH1_1', 'BH3_1'] }, { aliases: ['FW1_2'] }, { aliases: ['SH1_1'] }] };
const RED = [{ id: 'SH1_1' }];
const has = f => ['low-pound-dribbles-v2.mp4', 'forward-pivots.mp4'].includes(f);
const url = f => `https://go.dvlp.app/clips/${f}`;

test('a good manifest passes', () => {
  assert.deepEqual(checkManifest({ BH1_1: url('low-pound-dribbles-v2.mp4'), FW1_2: url('forward-pivots.mp4') }, PLANS, RED, has), []);
});
test('an unknown key, an off-host URL, a missing file and a red drill are each rejected', () => {
  assert.match(checkManifest({ ZZ9_9: url('forward-pivots.mp4') }, PLANS, RED, has)[0], /not a drill ID/);
  assert.match(checkManifest({ BH1_1: 'https://dvlp-sportstech.github.io/clips/low-pound-dribbles-v2.mp4' }, PLANS, RED, has)[0], /not a go\.dvlp\.app\/clips\/ mp4/);
  assert.match(checkManifest({ BH1_1: 'http://go.dvlp.app/clips/low-pound-dribbles-v2.mp4' }, PLANS, RED, has)[0], /not a go\.dvlp\.app\/clips\/ mp4/);
  assert.match(checkManifest({ BH1_1: url('nope.mp4') }, PLANS, RED, has)[0], /not in this repo/);
  assert.match(checkManifest({ SH1_1: url('forward-pivots.mp4') }, PLANS, RED, has)[0], /red-marked/);
  assert.equal(checkManifest([], PLANS, RED, has).length, 1);
});
