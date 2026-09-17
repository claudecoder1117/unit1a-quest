// tests/boss.test.mjs — T12. The Boss run, tested where it is pure: pool composition per boss (S2's
// table), the B4 equation rule (S3), the CONTINUE? check question (S4 Hearts), the run record — Boss XP
// once per seed, a KO that keeps XP/mastery/tiles, and a `*` run that never writes a personal best.
//
// S8 #12 acceptance, verbatim: "B6 ends on ang-10; B7 is not six midpoint problems; a wrong B4 setup
// forfeits flawless but no heart; a KO run still updates mastery and tiles; a `*` run never writes a PB."
import test from 'node:test';
import assert from 'node:assert/strict';

import * as T from '../site/data/templates.js';
import { bosses, bossById, moduleById } from '../site/data/modules.js';
import { getCard } from '../site/data/cards.js';
import { skillById } from '../site/data/skills.js';
import { fresh } from '../site/js/store.js';
import { wonRun, flawlessRun, bossOf, evaluate } from '../site/js/trophies.js';
import { MOCK_MISS_M } from '../site/js/mastery.js';
import {
  HEARTS, BOSS_XP, FLAWLESS_XP, CONTINUE_HEARTS, runKind,
  bossSeed, nextAttempt, bossRuns, composeBoss, prepareItem, equationPartIds,
  checkQuestion, missLine, SKILL_MISS, ghostFor, bestSplits, masteredSet, applyBossMiss,
  recordBossRun, fmtDelta,
} from '../site/js/screens/boss.js';
import { skills } from '../site/data/skills.js';

/* ------------------------------------------------------------------ helpers */

const AT = new Date(2026, 8, 17, 16, 0, 0).getTime();
const save = () => fresh(AT);

const seedOf = (id, attempt = 1) => bossSeed(id, attempt);
const compose = (id, attempt = 1) => composeBoss(id, seedOf(id, attempt), T);

/** The skills a slot exercises (template entry, or the card's own list). */
function slotSkills(slot) {
  if (slot.kind === 'variant') return T.getTemplate(slot.template)?.skills ?? [];
  return getCard(slot.id)?.skills ?? [];
}

/** A finished item row, as the screen pushes it. */
const item = (n, over = {}) => ({
  n, id: `i${n}`, skill: 'CS-LIN', tier: 2, label: `item ${n}`, ok: true, credit: 1,
  ms: 30_000, clean: true, rarity: 'gold', xp: 24, ...over,
});

/** A finished run, as `finish()` hands it to recordBossRun. */
const run = (over = {}) => ({
  bossId: 'B4', seed: 'abc123', attempt: 1, startedAt: AT, submittedAt: AT + 300_000,
  hearts: HEARTS, flagged: false, setupMiss: false, won: true, ko: false, tabAway: 0,
  items: [item(1), item(2), item(3), item(4), item(5), item(6)], ghost: null, ...over,
});

/* ------------------------------------------------------------------ composition (S2) */

test('boss: seven bosses, six items, elite original last (S1 glossary)', () => {
  assert.equal(bosses.length, 7);
  for (const b of bosses) {
    const c = compose(b.id);
    assert.ok(c, `${b.id} composes`);
    assert.equal(c.slots.length, b.variants + 1, `${b.id}: ${b.variants} + elite`);
    const last = c.slots[c.slots.length - 1];
    assert.equal(last.elite, true, `${b.id} ends on its elite`);
    assert.equal(last.kind, 'card');
    assert.equal(last.id, b.elite, `${b.id} elite is ${b.elite}`);
    assert.ok(getCard(b.elite), `${b.elite} is a real original`);
    assert.deepEqual(c.slots.map((s) => s.n), [1, 2, 3, 4, 5, 6], `${b.id} numbers its slots`);
    for (const s of c.slots.slice(0, -1)) assert.equal(s.elite, false);
  }
});

test('boss: pool composition per boss — every slot belongs to the boss (S2 table)', () => {
  for (const b of bosses) {
    const c = compose(b.id);
    const bossSkills = new Set(b.skills);
    const moduleSkills = new Set(b.modules.flatMap((m) => moduleById[m]?.skills ?? []));
    for (const s of c.slots.slice(0, -1)) {
      const sk = slotSkills(s);
      assert.ok(sk.length, `${b.id} slot ${s.n} has skills`);
      const owned = sk.some((x) => bossSkills.has(x) || moduleSkills.has(x));
      assert.ok(owned, `${b.id} slot ${s.n} (${s.template ?? s.id}) exercises one of the boss's skills, got ${sk}`);
      if (s.kind === 'card') {
        const mid = b.modules.find((m) => (moduleById[m]?.originals ?? []).includes(s.id));
        assert.ok(mid, `${b.id} original slot ${s.id} comes from one of its modules`);
        assert.notEqual(s.id, b.elite, `${b.id} never repeats the elite in the five`);
      }
    }
    // Every boss skill that HAS a generator in the boss's own modules is asked at least once.
    const cand = b.modules.flatMap((m) => moduleById[m]?.templates ?? []).map((id) => T.getTemplate(id)).filter(Boolean);
    const asked = new Set(c.slots.flatMap(slotSkills));
    for (const sk of b.skills) {
      if (!cand.some((e) => (e.skills ?? []).includes(sk))) continue;
      assert.ok(asked.has(sk), `${b.id} covers ${sk}`);
    }
  }
});

test('boss: the five are ordered by tier — a boss never opens on its hardest item', () => {
  for (const b of bosses) {
    const tiers = compose(b.id).slots.slice(0, -1).map((s) => s.tier);
    const sorted = [...tiers].sort((x, y) => x - y);
    assert.deepEqual(tiers, sorted, `${b.id} ramps: ${tiers}`);
  }
});

test('boss: B6 ends on ang-10 (S8 #12 acceptance)', () => {
  for (const attempt of [1, 2, 3, 7, 40]) {
    const c = compose('B6', attempt);
    const last = c.slots[c.slots.length - 1];
    assert.equal(last.id, 'ang-10');
    assert.equal(last.elite, true);
    assert.equal(last.kind, 'card');
    // and the five before it are M6/M12 figure algebra + systems, never ang-10 again
    for (const s of c.slots.slice(0, -1)) assert.notEqual(s.id, 'ang-10');
  }
});

test('boss: B7 is not six midpoint problems (S2: 2 each of seg-mid / quad-ctx / factor-a2)', () => {
  const seen = new Set();
  for (let attempt = 1; attempt <= 25; attempt++) {
    const c = compose('B7', attempt);
    const templates = c.slots.slice(0, -1).map((s) => s.template);
    assert.equal(templates.length, 5);
    const counts = new Map();
    for (const t of templates) counts.set(t, (counts.get(t) || 0) + 1);
    assert.ok((counts.get('T-seg-mid') ?? 0) <= 2, `attempt ${attempt}: at most 2 midpoint items, got ${templates}`);
    assert.ok((counts.get('T-quad-ctx') ?? 0) >= 1, `attempt ${attempt}: QUAD-CTX present`);
    assert.ok((counts.get('T-factor-a2') ?? 0) >= 1, `attempt ${attempt}: FAC2 present`);
    assert.ok((counts.get('T-seg-mid') ?? 0) >= 1, `attempt ${attempt}: SEG-ALG present`);
    assert.equal(new Set(templates).size, 3, 'all three families every time');
    assert.equal(c.slots[5].id, 'ang-04');
    for (const t of templates) seen.add(t);
  }
  assert.deepEqual([...seen].sort(), ['T-factor-a2', 'T-quad-ctx', 'T-seg-mid']);
});

test('boss: B2 is M9 plus exactly one pairs ask (S2 "+ 1 pairs ask")', () => {
  const c = compose('B2');
  const five = c.slots.slice(0, -1);
  const pairs = five.filter((s) => s.template === 'T-fig-pairs');
  assert.equal(pairs.length, 1, 'exactly one generated pairs item');
  const originals = five.filter((s) => s.kind === 'card');
  assert.equal(originals.length, 4);
  for (const s of originals) assert.match(s.id, /^(asn|qz)-\d\d$/);
  assert.equal(new Set(originals.map((s) => s.id)).size, 4, 'no repeats');
  assert.equal(c.slots[5].id, 'asn-32');
});

test('boss: B4 draws all three CS-* templates, B3 covers all five of its skills', () => {
  const b4 = compose('B4').slots.slice(0, -1).map((s) => s.template);
  for (const t of ['T-cs-lin', 'T-cs-ratio', 'T-cs-quad']) assert.ok(b4.includes(t), `B4 asks ${t}: ${b4}`);
  assert.equal(compose('B4').slots[5].id, 'wp-16');

  const b3 = compose('B3').slots.slice(0, -1);
  const skills = new Set(b3.flatMap(slotSkills));
  for (const sk of ['FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX', 'SYS']) assert.ok(skills.has(sk), `B3 covers ${sk}`);
  assert.equal(compose('B3').slots[5].id, 'fac-16');
});

test('boss: composition is deterministic in (boss, seed) and moves with the seed', () => {
  for (const b of bosses) {
    const seed = seedOf(b.id, 3);
    const a = composeBoss(b.id, seed, T);
    const c = composeBoss(b.id, seed, T);
    assert.deepEqual(a.slots, c.slots, `${b.id} replays byte-identically on the same seed`);
    for (const s of a.slots) assert.ok(String(s.seed).startsWith(seed), 'item seeds hang off the run seed');
  }
  const shapes = new Set();
  for (let n = 1; n <= 12; n++) shapes.add(compose('B3', n).slots.map((s) => s.template ?? s.id).join(','));
  assert.ok(shapes.size > 1, 'different attempts give different runs');
});

test('boss: seeds follow S3 — cyrb53(boss|attempt), six hex characters', () => {
  assert.match(bossSeed('B4', 1), /^[0-9a-f]{6}$/);
  assert.equal(bossSeed('B4', 1), bossSeed('B4', 1));
  assert.notEqual(bossSeed('B4', 1), bossSeed('B4', 2));
  assert.notEqual(bossSeed('B4', 1), bossSeed('B5', 1));
  const s = save();
  assert.equal(nextAttempt(s, 'B4'), 1);
  recordBossRun(s, run({ attempt: 1 }));
  assert.equal(nextAttempt(s, 'B4'), 2);
});

test('boss: an unknown id composes to null instead of throwing', () => {
  assert.equal(composeBoss('B9', 'abc', T), null);
  assert.equal(composeBoss('B4', 'abc', null), null);
});

/* ------------------------------------------------------------------ the B4 equation rule (S3) */

test('boss: B4 keeps the equation slot and makes it required; every other boss drops it', () => {
  const b4 = bossById.B4, b7 = bossById.B7;
  const v = T.generate('T-cs-lin', 'x1');
  assert.ok(v.parts.some((p) => p.type === 'equation'), 'the generator emits the setup slot');

  const forB4 = prepareItem(v, b4);
  const eq = forB4.parts.filter((p) => p.type === 'equation');
  assert.equal(eq.length, 1, 'B4 keeps it');
  assert.equal(eq[0].optional, false, 'B4 makes it required (S3)');
  assert.equal(forB4.parts.length, v.parts.length, 'nothing else changes');

  const seg = T.generate('T-seg-mid', 'x1');
  const forB7 = prepareItem(seg, b7);
  assert.equal(forB7.parts.filter((p) => p.type === 'equation').length, 0, 'B7 drops the optional setup');
  assert.equal(forB7.parts.length, seg.parts.length - 1);
  assert.ok(forB7.parts.length >= 1);

  assert.deepEqual(v.parts.map((p) => p.optional), v.parts.map((p) => p.optional), 'prepareItem never mutates its source');
  assert.equal(v.parts.find((p) => p.type === 'equation').optional, true);
});

test('boss: the elite original keeps the same equation rule', () => {
  const wp16 = getCard('wp-16');
  const eqOnCard = (wp16.parts ?? []).filter((p) => p.type === 'equation');
  const inB4 = prepareItem(wp16, bossById.B4).parts.filter((p) => p.type === 'equation');
  assert.equal(inB4.length, eqOnCard.length);
  for (const p of inB4) assert.equal(p.optional, false);
  const inB6 = prepareItem(getCard('ang-10'), bossById.B6).parts.filter((p) => p.type === 'equation');
  assert.equal(inB6.length, 0, 'B6 shows no setup box');
});

test('boss: equationPartIds names the parts that cost no heart (S3: "no heart but no flawless")', () => {
  const it = prepareItem(T.generate('T-cs-ratio', 'q'), bossById.B4);
  const ids = equationPartIds(it);
  assert.equal(ids.size, 1);
  const eq = it.parts.find((p) => p.type === 'equation');
  assert.ok(ids.has(eq.id));
  assert.equal(equationPartIds(prepareItem(T.generate('T-cs-ratio', 'q'), bossById.B5)).size, 0);
  assert.equal(equationPartIds(null).size, 0);
});

test('boss: a wrong B4 setup forfeits flawless but the heart stays (S8 #12 acceptance)', () => {
  const s = save();
  const { record } = recordBossRun(s, run({ hearts: HEARTS, setupMiss: true, won: true }));
  assert.equal(record.hearts, HEARTS, 'no heart was taken');
  assert.equal(record.won, true);
  assert.equal(record.flawless, false, 'the flawless bonus is gone');
  assert.equal(flawlessRun(record), false);
  assert.equal(record.xp, BOSS_XP, 'the win still pays 150, never the +300');
});

/* ------------------------------------------------------------------ CONTINUE? (S4 Hearts) */

test('boss: the check question is one tap, three options, exactly one right', () => {
  const it = prepareItem(T.generate('T-cs-lin', 'k9'), bossById.B4);
  const q = checkQuestion(it, 'seed|0');
  assert.ok(q, 'a generated item always has something to ask');
  assert.equal(q.options.length, 3);
  assert.equal(q.options.filter((o) => o.ok).length, 1);
  assert.equal(new Set(q.options.map((o) => o.text)).size, 3, 'no duplicate options');
  const right = q.options.find((o) => o.ok).text;
  assert.equal(right, (it.solution[0].say || it.solution[0].math).trim(), 'the answer is the first move of the solution');
  assert.deepEqual(checkQuestion(it, 'seed|0'), q, 'deterministic per (item, seed)');
  assert.notDeepEqual(checkQuestion(it, 'seed|1').options, q.options, 'a different slot shuffles differently');
});

test('boss: the check question falls back to the hint ladder, then to null', () => {
  const short = { id: 'x', solution: [{ say: 'only step' }], hints: ['H1 relationship', 'H2 setup', 'H3 last step'] };
  const q = checkQuestion(short, 's');
  assert.match(q.prompt, /relationship/i);
  assert.equal(q.options.find((o) => o.ok).text, 'H1 relationship');
  assert.equal(checkQuestion({ id: 'y', solution: [], hints: ['one'] }, 's'), null);
  assert.equal(checkQuestion(null, 's'), null);
});

test('boss: every elite original can ask a check question (the CONTINUE? panel is never empty)', () => {
  for (const b of bosses) {
    const it = prepareItem(getCard(b.elite), b);
    assert.ok(checkQuestion(it, b.id), `${b.elite} has a check question`);
  }
});

test('boss: a miss names the skill in words with a Drill 5 link (S4)', () => {
  const it = prepareItem(T.generate('T-cs-lin', 'k9'), bossById.B4);
  const plain = missLine(it, []);
  assert.equal(plain.skill, 'CS-LIN');
  assert.equal(plain.skillName, skillById['CS-LIN'].name);
  assert.equal(plain.drill, '#/run/drill/CS-LIN');
  assert.equal(plain.text, SKILL_MISS['CS-LIN'], 'the line is the skill, said in words');
  assert.match(plain.text, /word problems, linear/i);

  const tagged = missLine(it, ['gave-complement']);
  assert.match(tagged.text, /complement/i, 'a catalogued tag speaks instead of the skill name');
  assert.equal(tagged.drill, '#/run/drill/CS-LIN', 'the Drill 5 link is still the skill');
  assert.equal(missLine(it, ['not-a-real-tag']).text, plain.text, 'an unknown tag falls back to the skill');
  assert.equal(missLine({}, []).drill, null);

  // every one of the 19 skills has a sentence, so a miss is never "That one is gone."
  for (const s of skills) {
    assert.ok(SKILL_MISS[s.id], `${s.id} has a miss line`);
    assert.ok(SKILL_MISS[s.id].length <= 140, `${s.id} miss line is one line`);
    const said = missLine({ skills: [s.id] }, []);
    assert.equal(said.text, SKILL_MISS[s.id]);
    assert.equal(said.drill, `#/run/drill/${s.id}`);
    assert.equal(said.skillName, s.name);
  }
  // the elite of every boss can name its skill at the moment of the miss
  for (const b of bosses) {
    const line = missLine(prepareItem(getCard(b.elite), b), []);
    assert.ok(line.skill, `${b.elite} has a skill to name`);
    assert.ok(line.text.length > 10);
    assert.equal(line.drill, `#/run/drill/${line.skill}`);
  }
});

test('boss: the constants are the S4 numbers', () => {
  assert.equal(HEARTS, 3);
  assert.equal(CONTINUE_HEARTS, 1);
  assert.equal(BOSS_XP, 150);
  assert.equal(FLAWLESS_XP, 300);
  for (const b of bosses) { assert.equal(b.hearts, 3); assert.equal(b.variants, 5); }
});

/* ------------------------------------------------------------------ mastery (S4) */

test('boss: a miss on a Mastered skill drops it to 69, and only ever downward', () => {
  const s = save();
  s.skills['CS-LIN'] = { m: 92, n: 6, lastAt: AT - 86_400_000, lastDueCorrectAt: AT - 86_400_000, placedAt: null, decayDays: 0 };
  s.skills['CS-RATIO'] = { m: 50, n: 6, lastAt: AT, lastDueCorrectAt: AT, placedAt: null, decayDays: 0 };
  const mastered = masteredSet(s, ['CS-LIN', 'CS-RATIO']);
  assert.deepEqual([...mastered], ['CS-LIN']);
  applyBossMiss(s, ['CS-LIN', 'CS-RATIO'], mastered);
  assert.equal(s.skills['CS-LIN'].m, MOCK_MISS_M);
  assert.equal(s.skills['CS-RATIO'].m, 50, 'an unmastered skill is left to the normal EMA');

  s.skills['CS-LIN'].m = 40;                      // the Card engine's own first-wrong EMA got there first
  applyBossMiss(s, ['CS-LIN'], mastered);
  assert.equal(s.skills['CS-LIN'].m, 40, 'never raised back up to 69');
});

/* ------------------------------------------------------------------ the run record (S6 + S4) */

test('boss: a win writes the S6 run record trophies.js can read', () => {
  const s = save();
  const { record, xp, flawless } = recordBossRun(s, run());
  assert.equal(s.runs.length, 1);
  assert.equal(record.kind, 'boss:B4');
  assert.equal(bossOf(record), 'B4');
  assert.equal(record.status, 'done');
  assert.equal(record.limitMs, null, 'S4: no cap timer on a boss');
  assert.equal(record.items.length, 6);
  assert.equal(record.score, 6);
  assert.equal(wonRun(record), true);
  assert.equal(flawlessRun(record), true);
  assert.equal(flawless, true);
  assert.equal(xp, BOSS_XP + FLAWLESS_XP);
  assert.equal(s.xp, BOSS_XP + FLAWLESS_XP);
  assert.deepEqual(record.splits.map((x) => x.n), [1, 2, 3, 4, 5, 6]);
  assert.equal(record.splits[5].cum, 6 * 30_000, 'splits are cumulative');
  const earned = evaluate(s);
  assert.ok(earned.includes('boss:B4'), 'the stamp is earned');
  assert.ok(earned.includes('boss-flawless:B4'));
});

test('boss: Boss XP is granted once per seed (S4)', () => {
  const s = save();
  const first = recordBossRun(s, run({ hearts: 2 }));
  assert.equal(first.xp, BOSS_XP);
  assert.equal(s.xp, BOSS_XP);
  const second = recordBossRun(s, run({ hearts: HEARTS, submittedAt: AT + 200_000 }));
  assert.equal(second.xp, 0, 'the same seed never pays twice');
  assert.equal(second.record.xpAwarded, false);
  assert.equal(s.xp, BOSS_XP, 'the save is untouched by the replay');
  const third = recordBossRun(s, run({ seed: 'zzz999' }));
  assert.equal(third.xp, BOSS_XP + FLAWLESS_XP, 'a new seed pays again');
});

test('boss: a KO keeps XP, mastery and tiles and forfeits only the stamp (S8 #12 acceptance)', () => {
  const s = save();
  // three items were cleared before the run died: the Card engine already wrote them.
  s.xp = 90;
  s.cards['wp-05'] = { attempts: 1, cleared: true, rarity: 'gold', foilProgress: [], bucket: 1, lastAt: AT, due: AT + 86_400_000, history: [{ at: AT, ok: true, attempt: 1, hints: 0, ms: 20_000 }] };
  s.variants['T-cs-lin'] = { clears: 2, clearsGold: 2, goldDays: ['2026-09-17'] };
  s.skills['CS-LIN'] = { m: 74, n: 4, lastAt: AT, lastDueCorrectAt: null, placedAt: null, decayDays: 0 };
  const before = JSON.parse(JSON.stringify({ cards: s.cards, variants: s.variants, skills: s.skills, xp: s.xp }));

  const { record, xp } = recordBossRun(s, run({
    won: false, ko: true, hearts: 0, flagged: false,
    items: [item(1), item(2), item(3, { ok: false, credit: 0, rarity: null, xp: 0 })],
  }));

  assert.equal(xp, 0, 'no boss bonus');
  assert.equal(s.xp, before.xp, 'the XP earned on the way is kept, nothing is taken back');
  assert.deepEqual(s.cards, before.cards, 'tiles kept');
  assert.deepEqual(s.variants, before.variants, 'Variant Gold counts kept');
  assert.deepEqual(s.skills, before.skills, 'mastery kept');
  assert.equal(record.won, false);
  assert.equal(record.ko, true);
  assert.equal(record.xpAwarded, false);
  assert.equal(wonRun(record), false);
  assert.equal(flawlessRun(record), false);
  const earned = evaluate(s);
  assert.ok(!earned.includes('boss:B4'), 'the stamp is forfeited');
});

test('boss: a `*` run never writes a PB and is never the ghost (S8 #12 acceptance)', () => {
  const s = save();
  const slow = recordBossRun(s, run({ submittedAt: AT + 600_000 }));
  assert.equal(slow.record.pb, true, 'the first clean win sets the bar');

  const starred = recordBossRun(s, run({ flagged: true, hearts: CONTINUE_HEARTS, submittedAt: AT + 60_000 }));
  assert.equal(starred.record.flagged, true);
  assert.equal(starred.record.pb, false, 'fastest run of the three, and still no PB');
  assert.equal(starred.record.flawless, false);
  assert.equal(flawlessRun(starred.record), false);
  assert.equal(ghostFor(s, 'B4', 'abc123').startedAt, slow.record.startedAt, 'the ghost is the clean run');

  const faster = recordBossRun(s, run({ submittedAt: AT + 120_000 }));
  assert.equal(faster.record.pb, true, 'a clean run beats the clean bar, not the * time');

  const afterStar = recordBossRun(s, run({ flagged: true, submittedAt: AT + 10_000 }));
  assert.equal(afterStar.record.pb, false);
  assert.equal([...bestSplits(s, 'B4', 'abc123').keys()].length, 6);
  for (const r of bossRuns(s, 'B4')) if (r.flagged) assert.equal(r.pb, false);
});

test('boss: a KO never writes a PB either, however fast it died', () => {
  const s = save();
  const { record } = recordBossRun(s, run({ won: false, ko: true, hearts: 0, submittedAt: AT + 5_000, items: [item(1)] }));
  assert.equal(record.pb, false);
  assert.equal(ghostFor(s, 'B4', 'abc123'), null, 'a lost run is not a ghost');
});

test('boss: splits are compared against the ghost on the same seed only', () => {
  const s = save();
  recordBossRun(s, run({ submittedAt: AT + 180_000, items: [1, 2, 3, 4, 5, 6].map((n) => item(n, { ms: 30_000 })) }));
  const ghost = ghostFor(s, 'B4', 'abc123');
  assert.ok(ghost);
  const { record } = recordBossRun(s, run({
    ghost, submittedAt: AT + 150_000,
    items: [1, 2, 3, 4, 5, 6].map((n) => item(n, { ms: n === 1 ? 20_000 : 30_000 })),
  }));
  assert.equal(record.splits[0].delta, -10_000, 'ten seconds up on item 1');
  assert.equal(record.splits[5].delta, -10_000, 'and still ten seconds up at the end');
  assert.equal(ghostFor(s, 'B4', 'other-seed'), null, 'another seed has no ghost');
  assert.equal(fmtDelta(-10_000), '−10s');
  assert.equal(fmtDelta(4_200), '+4.2s');
});

test('boss: the run record caps what it stores (S6 caps) and carries the attempt', () => {
  const s = save();
  const { record } = recordBossRun(s, run({
    attempt: 4, tabAway: 2,
    items: [item(1, { raw: 'x'.repeat(500) })],
  }));
  assert.equal(record.attempt, 4);
  assert.equal(record.tabAway, 2);
  assert.equal(record.items[0].raw.length, 200, 'a typed answer is clipped to CAPS.rawChars');
  assert.equal(record.n, 1);
  assert.equal(recordBossRun(s, run()).record.n, 2, 'runs are numbered per boss');
  assert.equal(runKind('B7'), 'boss:B7');
});

test('boss: hearts are clamped and flawless needs all three, clean (S4 Hearts)', () => {
  const s = save();
  assert.equal(recordBossRun(s, run({ seed: 's1', hearts: 9 })).record.hearts, HEARTS);
  assert.equal(recordBossRun(s, run({ seed: 's2', hearts: -4, won: false, ko: true })).record.hearts, 0);
  assert.equal(recordBossRun(s, run({ seed: 's3', hearts: 2 })).record.flawless, false);
  assert.equal(recordBossRun(s, run({ seed: 's4', hearts: HEARTS, flagged: true })).record.flawless, false);
  assert.equal(recordBossRun(s, run({ seed: 's5', hearts: HEARTS })).record.flawless, true);
});
