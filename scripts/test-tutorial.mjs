// Tutorial: Battle and Story tours both build, Story has its own "seen" flags, and Story copy never mentions Edicts.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const T = await import('../src/components/tutorialSteps.js');

let n = 0; const ok = (name) => { n += 1; console.log(`PASS ${name}`); };

const battle = T.buildSteps(4, false); const duel = T.buildSteps(2, false); const story = T.buildSteps(2, true);
for (const [name, list] of [['battle (4)', battle], ['battle duel', duel], ['story', story]]) {
  assert.ok(list.length >= 10, `${name} has steps`);
  for (const s of list) { assert.ok(s.title && Array.isArray(s.lines) && s.lines.length, `${name}: "${s.title}" has copy`); }
}
ok('every tour builds with titles and copy');

const text = story.map((s) => `${s.title} ${s.lines.join(' ')}`).join('\n');
assert.ok(!/edict/i.test(text), 'story tour must say Powers, not Edicts');
assert.ok(story.some((s) => s.title === 'Your Powers' && s.optional), 'story has an optional Powers step');
assert.ok(story.some((s) => s.target === '.sm-hud' && s.optional), 'story explains the stakes panel, skipped if absent');
ok('story tour uses Story vocabulary and optional steps');

assert.equal(T.tutorialSeen(false), false); assert.equal(T.tutorialSeen(true), false);
T.markTutorialSeen(false);
assert.equal(T.tutorialSeen(false), true); assert.equal(T.tutorialSeen(true), false, 'seeing the Battle tour must not hide the Story tour');
T.markTutorialSeen(true); assert.equal(T.tutorialSeen(true), true);
T.markHintsDone(true); assert.equal(T.hintsDone(true), true); assert.equal(T.hintsDone(false), false);
ok('Battle and Story keep separate seen / hints flags');

console.log(`\n${n} tutorial checks passed`);
