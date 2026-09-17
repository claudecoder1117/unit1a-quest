// tests/page.test.mjs — T10: Today's Page composer. Deterministic initial seed; block order (opener →
// rematches → dues → new → weak → floor); never 3 consecutive same-skill items; ang-10 never new before
// QUAD-SOLVE ≥ 40 or placed; a Rematch never item 1; first Page ≥ 3 non-M1 items; ≤ 2 tier-4 items incl.
// Rematches; reload restores the queue at idx with answered items still answered; nextAction naming.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, pageSeed, seedHex, pageIndexFor, isFirstPage, qFor, newCardPool, renameFor, bossReady, spreadSkills,
  composePage, pageLabel, missedOriginals, nextAction, startPage, resumePage, currentItem, markItem, requeueReview, finishPage, describeQueue,
  MAX_REQUEUE,   // r1
} from '../site/js/page.js';
import { applyOutcome, recordRematch, freezeVariant, DAY_MS, HOUR_MS } from '../site/js/schedule.js';
import { fresh, pack, unpack, migrate, applyCaps } from '../site/js/store.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cyrb53, mulberry32 } from '../site/js/rng.js';
import { cards, byId } from '../site/data/cards.js';
import { generate, getTemplate } from '../site/data/templates.js';
import { isBonus } from '../site/data/source-manifest.js';
import { resolve } from '../site/js/figure/model.js';
import { getFigure } from '../site/data/figures.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const mk = ({ testDate = '2026-09-22', createdDaysAgo = 3, profileId = 'page-test' } = {}) => {
  const s = fresh(NOW - createdDaysAgo * DAY_MS);
  s.profileId = profileId;
  s.settings.testDate = testDate;
  return s;
};
const clear = (s, id, { now = NOW - DAY_MS, outcome = 'clean', due = null } = {}) => {
  const rec = applyOutcome(s, id, outcome, { now });
  rec.cleared = outcome !== 'wrong'; rec.attempts = 1; rec.rarity = rec.cleared ? 'gold' : null;
  if (due != null) rec.due = due;
  return rec;
};
const skillRuns = (queue) => {
  let worst = 0, run = 1;
  for (let i = 1; i < queue.length; i++) { run = queue[i].skill === queue[i - 1].skill ? run + 1 : 1; worst = Math.max(worst, run); }
  return worst;
};
const bank = cards.filter(c => !isBonus(c.id));

describe('seed + identity', () => {
  test('page seed is cyrb53(profileId|dayIndex|pageIndex) >>> 0 and the composition is reproducible', () => {
    assert.equal(pageSeed('p', 3, 0), cyrb53('p|3|0') >>> 0);
    assert.notEqual(pageSeed('p', 3, 0), pageSeed('p', 3, 1));
    assert.match(seedHex(pageSeed('p', 3, 0)), /^[0-9a-f]{6}$/);
    const s = mk();
    const a = composePage(s, { now: NOW }), b = composePage(s, { now: NOW });
    assert.deepEqual(a, b, 'same save, same day, same page index → identical');
    assert.equal(a.seed, pageSeed(s.profileId, 3, 0));
    const c = composePage(s, { now: NOW, pageIndex: 1 });
    assert.notEqual(c.seed, a.seed);
    assert.ok(c.queue.filter(it => it.isVariant).some((it, i) => it.id !== a.queue.filter(x => x.isVariant)[i]?.id), 'a second page of the day draws different Variants');
  });
  test('pageIndexFor counts today\'s page runs; isFirstPage flips after one', () => {
    const s = mk();
    assert.equal(pageIndexFor(s, TODAY), 0);
    assert.equal(isFirstPage(s), true);
    s.runs.push({ kind: 'page', n: 1, seed: 'x', startedAt: NOW - HOUR_MS, status: 'done', items: [] });
    s.runs.push({ kind: 'page', n: 2, seed: 'y', startedAt: NOW - 2 * DAY_MS, status: 'done', items: [] });
    assert.equal(pageIndexFor(s, TODAY), 1);
    assert.equal(isFirstPage(s), false);
  });
  test('every generated item on a page replays from its (template, seed, params)', () => {
    const s = mk();
    s.skills['CS-LIN'] = { m: 20, n: 3, lastAt: NOW };
    const { queue } = composePage(s, { now: NOW });
    const vars = queue.filter(it => it.isVariant);
    assert.ok(vars.length >= 2);
    for (const it of vars) {
      const item = generate(it.template, it.seed, it.params ?? {});
      assert.equal(item.id, it.id);
      assert.deepEqual(generate(it.template, it.seed, it.params ?? {}), item);
    }
  });
});

describe('interleave constraints', () => {
  test('never 3 consecutive items of one skill (fresh, mid-week, review-heavy and ASN-heavy saves, several days)', () => {
    const saves = [];
    saves.push(mk()); saves.push(mk({ testDate: null }));
    const mid = mk();
    ['voc-01', 'voc-02', 'not-01', 'not-02', 'ang-wu-1', 'fac-01', 'fac-02', 'wp-01', 'asn-01', 'asn-02', 'quad-01', 'cls-01'].forEach((id, i) => clear(mid, id, { now: NOW - (2 + (i % 3)) * DAY_MS, due: NOW - (i % 4) * DAY_MS }));
    mid.skills = { 'CS-LIN': { m: 30, n: 2, lastAt: NOW }, PAIRS: { m: 40, n: 3, lastAt: NOW }, FAC2: { m: 80, n: 7, lastAt: NOW } };
    recordRematch(mid, { item: 'wp-01', got: '73', now: NOW - HOUR_MS });
    saves.push(mid);
    const asn = mk();                                 // 30 ASN-ANG reviews all due at once, nothing else touched
    bank.filter(c => c.skills[0] === 'ASN-ANG').slice(0, 24).forEach((c, i) => clear(asn, c.id, { now: NOW - 3 * DAY_MS, due: NOW - (i % 5) * DAY_MS }));
    saves.push(asn);
    const sweep = mk({ testDate: addDays(TODAY, 2) });   // D = 2: Final Sweep
    bank.filter(c => c.skills[0] === 'FAC2').forEach(c => clear(sweep, c.id, { now: NOW - DAY_MS, due: NOW + 5 * DAY_MS }));
    saves.push(sweep);
    let pages = 0;
    for (const s of saves) for (let day = 0; day < 4; day++) for (let pi = 0; pi < 2; pi++) {
      const { queue } = composePage(s, { now: NOW + day * DAY_MS, pageIndex: pi });
      pages++;
      assert.ok(queue.length > 0);
      assert.ok(skillRuns(queue) <= LIMITS.sameSkillRun, `run of ${skillRuns(queue)} same-skill items:\n${describeQueue(queue)}`);
      const ids = queue.map(it => it.id);
      assert.equal(new Set(ids).size, ids.length, 'no duplicate items');
      assert.ok(queue.every((it, i) => it.n === i + 1), 'numbered 1..n');
    }
    assert.ok(pages >= 40);
  });
  test('spreadSkills swaps forward and, when no other skill exists, drops the surplus (never a run of 3)', () => {
    const q = (ids) => ids.map((skill, i) => ({ id: `i${i}`, skill, n: i + 1 }));
    const r = spreadSkills(q(['A', 'A', 'A', 'B', 'B', 'B', 'C']));
    assert.equal(skillRuns(r.queue), 2);
    assert.equal(r.queue.length, 7); assert.equal(r.dropped.length, 0);
    const solo = spreadSkills(q(['A', 'A', 'A', 'A']));
    assert.deepEqual(solo.queue.map(x => x.skill), ['A', 'A']);
    assert.equal(solo.dropped.length, 2);
  });
  test('geometry and algebra alternate in the new block; micro-cards interleave 1-in-4; tier ramps (hard items never first)', () => {
    const { queue, meta } = composePage(mk(), { now: NOW });
    const fresh_ = queue.filter(it => it.role === 'new');
    assert.ok(fresh_.length >= 8);
    const fams = fresh_.filter(it => it.tier > 1).map(it => (['M10', 'M11', 'M12'].includes(it.module) ? 'alg' : 'geo'));
    assert.ok(fams.includes('alg') && fams.includes('geo'), 'both families present on day 1');
    let flips = 0; for (let i = 1; i < fams.length; i++) if (fams[i] !== fams[i - 1]) flips++;
    assert.ok(flips >= fams.length / 2 - 1, `alternation: ${fams.join(',')}`);
    const micro = fresh_.filter(it => it.tier === 1).length;
    assert.ok(micro >= 2 && micro <= Math.ceil(fresh_.length / 4) + 1, `micro-cards ${micro} of ${fresh_.length}`);
    assert.ok(queue[0].tier <= 2 && !queue[0].isRematch, 'item 1 is easy');
    assert.equal(meta.modules.length, 3);
    assert.ok(meta.modules.some(m => ['M10', 'M11', 'M12'].includes(m)), 'an algebra module is among the three');
  });
});

describe('needs, first page, tier-4 cap, rematch slot', () => {
  test('ang-10 (and every needs:[QUAD-SOLVE] card) is never served as new before QUAD-SOLVE ≥ 40 or placed', () => {
    const s = mk();
    for (const c of bank) if (!['ang-10', 'ang-04', 'ang-05', 'ang-09', 'wp-12', 'doc-07'].includes(c.id)) clear(s, c.id, { now: NOW - DAY_MS, due: NOW + 10 * DAY_MS });
    const ids0 = composePage(s, { now: NOW }).queue.map(it => it.id);
    assert.ok(!ids0.includes('ang-10') && !ids0.includes('ang-04') && !ids0.includes('ang-05') && !ids0.includes('ang-09') && !ids0.includes('wp-12'), 'nothing that needs QUAD-SOLVE');
    assert.ok(!ids0.includes('doc-07'), 'doc-07 needs SYS');
    assert.deepEqual(newCardPool(s).map(c => c.id), [], 'the pool is empty');
    s.skills['QUAD-SOLVE'] = { m: 39, n: 5, lastAt: NOW };
    assert.ok(!composePage(s, { now: NOW }).queue.some(it => it.id === 'ang-10'), 'm = 39 is not enough');
    s.skills['QUAD-SOLVE'].m = 40;
    const ids1 = composePage(s, { now: NOW }).queue.map(it => it.id);
    assert.ok(ids1.includes('ang-10'), 'served once QUAD-SOLVE ≥ 40');
    assert.ok(!ids1.includes('doc-07'));
    s.skills['QUAD-SOLVE'] = { m: 0, n: 5, lastAt: NOW, placedAt: NOW };
    assert.ok(composePage(s, { now: NOW }).queue.some(it => it.id === 'ang-10'), 'placed counts');
    s.skills.SYS = { m: 0, n: 5, placedAt: NOW };
    assert.ok(composePage(s, { now: NOW }).queue.some(it => it.id === 'doc-07'));
  });
  test('the first Page of a save carries ≥ 3 non-M1 items, with and without a test date', () => {
    for (const s of [mk(), mk({ testDate: null }), mk({ testDate: addDays(TODAY, 10) })]) {
      const { queue, meta } = composePage(s, { now: NOW });
      assert.equal(meta.first, true);
      assert.ok(queue.filter(it => it.module !== 'M1').length >= LIMITS.firstPageNonM1, describeQueue(queue));
    }
  });
  test('at most 2 tier-4 items per page INCLUDING Rematches; the rest is carried', () => {
    const s = mk();
    s.skills['QUAD-SOLVE'] = { m: 80, n: 5, lastAt: NOW, placedAt: NOW };
    s.skills.SYS = { m: 80, n: 5, lastAt: NOW, placedAt: NOW };
    for (const id of ['ang-10', 'ang-05', 'ang-04']) { clear(s, id, { now: NOW - 2 * DAY_MS, outcome: 'wrong', due: NOW - DAY_MS }); recordRematch(s, { item: id, got: 'x', now: NOW - HOUR_MS }); }
    clear(s, 'doc-05', { now: NOW - 2 * DAY_MS, outcome: 'wrong', due: NOW - DAY_MS });
    const { queue, meta } = composePage(s, { now: NOW });
    const t4 = queue.filter(it => it.tier >= 4);
    assert.ok(t4.length <= LIMITS.tier4, `tier-4 items: ${t4.map(it => it.id).join(', ')}`);
    assert.equal(meta.tier4, t4.length);
    assert.ok(meta.carried.length >= 3, `carried: ${meta.carried.join(', ')}`);
    assert.ok(queue.filter(it => it.isRematch).length <= LIMITS.rematches);
    assert.ok(queue.filter(it => it.isRematch && it.tier >= 4).length <= LIMITS.tier4);
    assert.ok(!queue[0].isRematch && queue[0].tier < 4, 'the opener is not a hard item');
  });
  test('a Rematch is never item 1 — even when there are no dues and no new cards', () => {
    const s = mk();
    for (const c of bank) clear(s, c.id, { now: NOW - DAY_MS, due: NOW + 10 * DAY_MS });   // nothing due, nothing new
    recordRematch(s, { item: 'wp-07', got: '68.5', now: NOW - HOUR_MS });
    recordRematch(s, { item: 'fac-16', got: '(2a+5)(3a+5)', now: NOW - 2 * HOUR_MS });
    for (let pi = 0; pi < 3; pi++) {
      const { queue } = composePage(s, { now: NOW, pageIndex: pi });
      assert.ok(queue.length >= 2);
      assert.ok(queue.some(it => it.isRematch), 'the rematches are on the page');
      assert.equal(queue[0].isRematch, false, describeQueue(queue));
    }
    const s2 = mk();
    recordRematch(s2, { item: 'wp-07', got: '68.5', now: NOW - HOUR_MS });
    const { queue } = composePage(s2, { now: NOW });
    assert.equal(queue[0].isRematch, false);
    assert.ok(queue.some(it => it.isRematch && it.template === 'T-cs-lin' && it.forCard === 'wp-07'));
  });
  test('rematches are slotted after the first two reviews and before the remaining dues', () => {
    const s = mk();
    ['voc-01', 'voc-02', 'not-01', 'fac-01', 'asn-01', 'ang-wu-1'].forEach((id, i) => clear(s, id, { now: NOW - 3 * DAY_MS, due: NOW - (6 - i) * DAY_MS }));
    recordRematch(s, { item: 'wp-07', got: '68.5', now: NOW - HOUR_MS });
    const { queue } = composePage(s, { now: NOW });
    assert.equal(queue[0].role, 'review'); assert.equal(queue[1].role, 'review');
    const ri = queue.findIndex(it => it.isRematch);
    assert.ok(ri >= 2 && ri <= 3, `rematch at ${ri + 1}:\n${describeQueue(queue)}`);
    assert.ok(queue.slice(ri + 1).some(it => it.role === 'review'), 'more dues follow');
    assert.equal(queue[0].overdue >= queue[1].overdue, true, 'dues by overdue days desc');
  });
});

describe('dues, frozen returns, weak Variants, floor, label', () => {
  test('due reviews come first (opener = the two most overdue easy ones), frozen Variants return byte-identical', () => {
    const s = mk();
    clear(s, 'wp-07', { now: NOW - 5 * DAY_MS, due: NOW - 4 * DAY_MS });
    clear(s, 'doc-05', { now: NOW - 5 * DAY_MS, due: NOW - 5 * DAY_MS });   // tier 4 — never the opener
    clear(s, 'asn-09', { now: NOW - 3 * DAY_MS, due: NOW - 2 * DAY_MS });
    const item = generate('T-factor-a2', 'missed');
    freezeVariant(s, item, { forCard: 'fac-01', now: NOW - 3 * DAY_MS });
    s.frozen[item.id].due = NOW - 3 * DAY_MS;
    const { queue } = composePage(s, { now: NOW });
    assert.deepEqual(queue.slice(0, 2).map(it => it.id), ['wp-07', item.id]);
    const frozen = queue.find(it => it.frozenKey === item.id);
    assert.equal(frozen.role, 'review'); assert.equal(frozen.forCard, 'fac-01'); assert.equal(frozen.seed, 'missed');
    assert.deepEqual(generate(frozen.template, frozen.seed), item);
    assert.ok(queue.some(it => it.id === 'doc-05'), 'the tier-4 due is still on the page, later');
    assert.notEqual(queue[0].id, 'doc-05');
  });
  test('pairs reviews carry a fresh injective rename over the figure\'s letters that resolves', () => {
    const s = mk();
    clear(s, 'ang-wu-1', { now: NOW - 3 * DAY_MS, due: NOW - DAY_MS });
    const it = composePage(s, { now: NOW }).queue.find(q => q.id === 'ang-wu-1');
    assert.ok(it.rename, 'rename present');
    const vals = Object.values(it.rename);
    assert.equal(new Set(vals).size, vals.length, 'injective');
    assert.ok(vals.every(v => /^[A-HJ-NP-Z]$/.test(v)), 'no I / O');
    const card = byId['ang-wu-1'];
    const model = resolve(getFigure(card.figure.id), { ...card.figure, rename: it.rename });
    assert.equal(model.vertex, it.rename.F);
    assert.equal(renameFor(byId['wp-07'], mulberry32(1)), null, 'no figure → no rename');
    assert.equal(renameFor(byId['ang-10'], mulberry32(1)), null, 'not a pairs card → no rename (T09 renders letters in the stem)');
  });
  test('weak-skill Variants: 2–3 ordered by w × (1 − m/100); ASN weak spots fall back to an original; a floor of 2 M11/M12 Variants', () => {
    const s = mk();
    s.skills = { 'CS-LIN': { m: 20, n: 4, lastAt: NOW }, 'ASN-ANG': { m: 50, n: 3, lastAt: NOW }, PAIRS: { m: 60, n: 5, lastAt: NOW } };
    const { queue, meta } = composePage(s, { now: NOW });
    const weak = queue.filter(it => it.role === 'weak');
    assert.equal(weak.length, 3);
    assert.equal(weak[0].skill, 'CS-LIN', 'w 9 × 0.8 = 7.2 first');
    assert.ok(weak.some(it => it.skill === 'ASN-ANG' && it.kind === 'card'), 'ASN has no generator → an ASN original');
    assert.ok(weak.filter(it => it.isVariant).every(it => it.forCard === null), 'weak Variants are not credited to a card');
    const alg = queue.filter(it => it.module === 'M11' || it.module === 'M12');
    assert.ok(alg.length >= LIMITS.algebraFloor, `M11/M12 items: ${alg.length}`);
    assert.equal(meta.counts.weak, 3);
    const one = mk(); one.skills = { NOTE: { m: 10, n: 2, lastAt: NOW } };
    assert.equal(composePage(one, { now: NOW }).queue.filter(it => it.role === 'weak').length, LIMITS.weakMin, 'one weak skill → 2 Variants');
    assert.equal(composePage(mk(), { now: NOW }).queue.filter(it => it.role === 'weak').length, 0, 'no weak skills → none');
  });
  test('q follows the S7 plan (tier-weighted R / (D − 1)), lowered to 12 when it warns, 12 with no date; a review-heavy day shrinks new cards but never below 4', () => {
    const s = mk();
    const q7 = qFor(s, { D: 7 });
    assert.ok(q7.R > 55 && q7.R < 70, `R ${q7.R}`);
    assert.ok(q7.q <= 12 && !q7.warn, `q ${q7.q}`);
    assert.equal(qFor(s, { D: null }).q, 12);
    const q2 = qFor(s, { D: 2 });
    assert.ok(q2.warn && q2.target === 12);
    const heavy = mk();
    bank.filter(c => c.tier === 1).slice(0, 40).forEach((c, i) => clear(heavy, c.id, { now: NOW - 3 * DAY_MS, due: NOW - (i % 3) * DAY_MS }));
    const { queue, meta } = composePage(heavy, { now: NOW });
    const reviews = meta.counts.review + meta.counts.rematch;
    assert.equal(reviews, LIMITS.opener + LIMITS.dues, '2 opener + 12 dues');
    assert.ok(meta.counts.new >= LIMITS.qMin && meta.counts.new <= LIMITS.pageMax - reviews + LIMITS.firstPageNonM1, `new ${meta.counts.new}`);
    assert.ok(queue.length <= LIMITS.pageMax + LIMITS.firstPageNonM1 + LIMITS.weakMax + LIMITS.algebraFloor, `page length ${queue.length}`);
    heavy.counters.pages = 3;   // not the first page any more → exactly pageMax − reviews new cards
    assert.equal(composePage(heavy, { now: NOW }).meta.counts.new, LIMITS.pageMax - reviews);
    assert.equal(composePage(heavy, { now: NOW, q: 9 }).meta.counts.new, 9, 'an explicit q (the plan, T14) is honoured');
  });
  test('pageLabel names the parts', () => {
    assert.equal(pageLabel({ meta: { counts: { review: 5, rematch: 1, new: 8, weak: 0, floor: 0 } } }), 'RUN NEXT · 6 reviews + 8 new');
    assert.equal(pageLabel({ meta: { counts: { review: 0, rematch: 0, new: 12, weak: 2, floor: 1 } } }), 'RUN NEXT · 12 new + 3 variants');
    assert.equal(pageLabel({ meta: { counts: { review: 1, rematch: 0, new: 0, weak: 0, floor: 1 } } }), 'RUN NEXT · 1 review + 1 variant');
    assert.equal(pageLabel({ meta: { counts: {} } }), 'RUN NEXT');
  });
});

describe('inProgress: reload restores the queue at idx', () => {
  test('startPage writes inProgress; markItem advances; a JSON/pack round trip restores idx and the answered items', () => {
    const s = mk();
    const ip = startPage(s, { now: NOW });
    assert.equal(s.inProgress, ip); assert.equal(ip.kind, 'page'); assert.equal(ip.idx, 0);
    assert.ok(ip.queue.length >= 8);
    assert.equal(startPage(s, { now: NOW + HOUR_MS }), ip, 'a page in progress is kept');
    const first = currentItem(ip);
    markItem(s, { ok: true, attempt: 1, hints: 0, xp: 45 });
    markItem(s, { ok: false, attempt: 3, hints: 1, xp: 0 });
    markItem(s, { ok: true, attempt: 2, hints: 0, xp: 12 });
    assert.equal(ip.idx, 3);
    // reload: disk (packed) → JSON → unpack(migrate()) exactly like store.load()
    const disk = JSON.stringify(pack(s));
    const back = applyCaps(unpack(migrate(JSON.parse(disk), NOW)));
    const rip = resumePage(back);
    assert.ok(rip); assert.equal(rip.idx, 3);
    assert.equal(rip.queue.length, ip.queue.length);
    assert.deepEqual(rip.queue.map(it => it.id), ip.queue.map(it => it.id));
    assert.equal(rip.queue[0].id, first.id);
    assert.deepEqual(rip.queue.slice(0, 3).map(it => it.done), [true, true, true]);
    assert.deepEqual(rip.queue.slice(0, 3).map(it => it.result.xp), [45, 0, 12]);
    assert.ok(rip.queue.slice(3).every(it => !it.done && it.result === null));
    assert.equal(currentItem(rip).id, ip.queue[3].id);
    assert.equal(nextAction(back, { now: NOW }).kind, 'resume');
    assert.equal(nextAction(back, { now: NOW }).label, `Continue page · 4 of ${ip.queue.length}`);
    // the seed alone rebuilds the INITIAL composition, not the answered state
    const again = composePage(back, { now: NOW, pageIndex: 0 });
    assert.equal(again.seed, ip.seed);
    // finishing clears inProgress
    const done = finishPage(back);
    assert.equal(done.idx, 3); assert.equal(back.inProgress, null); assert.equal(back.counters.pages, 1);
    assert.equal(resumePage(back), null);
  });
  test('a missed review is re-queued to the end of the review block', () => {
    const s = mk();
    ['voc-01', 'voc-02', 'not-01', 'fac-01', 'asn-01', 'ang-wu-1'].forEach((id, i) => clear(s, id, { now: NOW - 3 * DAY_MS, due: NOW - (6 - i) * DAY_MS }));
    const ip = startPage(s, { now: NOW });
    const n = ip.queue.length;
    const copy = requeueReview(s, { idx: 0 });
    assert.ok(copy && copy.id === ip.queue[0].id && copy.requeued === 1);
    assert.equal(ip.queue.length, n + 1);
    const lastReview = Math.max(...ip.queue.map((it, i) => (it.isReview || it.isRematch ? i : -1)));
    assert.equal(ip.queue[lastReview], copy, 'after the last review item');
    assert.ok(ip.queue.every((it, i) => it.n === i + 1));
    ip.idx = ip.queue.findIndex(it => it.role === 'new');
    assert.equal(requeueReview(s), null, 'only review items re-queue');
  });
});

describe('nextAction — the primary button (S1)', () => {
  test('names the next correct action for each state', () => {
    const f = mk();
    assert.deepEqual([nextAction(f, { now: NOW }).kind, nextAction(f, { now: NOW }).label], ['warmup', 'Warm-up']);
    const s = mk(); s.placement = { done: true, at: NOW - DAY_MS };
    const a = nextAction(s, { now: NOW });
    assert.equal(a.kind, 'page'); assert.match(a.label, /^RUN NEXT · /); assert.equal(a.href, '#/run/page'); assert.ok(a.page.queue.length > 0);
    const night = mk({ testDate: addDays(TODAY, 1) }); night.placement.done = true;
    assert.deepEqual([nextAction(night, { now: NOW }).label, nextAction(night, { now: NOW }).href], ['Night Before', '#/run/night']);
    const morning = mk({ testDate: TODAY }); morning.placement.done = true;
    const dawn = new Date(2026, 8, 16, 6, 45).getTime();
    assert.deepEqual([nextAction(morning, { now: dawn }).label, nextAction(morning, { now: dawn }).href], ['Test Morning', '#/run/morning']);
    const post = mk({ testDate: addDays(TODAY, -1) }); post.placement.done = true;
    assert.equal(nextAction(post, { now: NOW }).kind, 'post');
    const later = mk({ testDate: TODAY }); later.settings.testTime = '08:00'; later.placement.done = true;
    assert.equal(nextAction(later, { now: new Date(2026, 8, 16, 9, 45).getTime() }).kind, 'post', '90 min after the test time');
    assert.equal(nextAction(later, { now: new Date(2026, 8, 16, 7, 0).getTime() }).kind, 'morning');
    const boss = mk(); boss.placement.done = true;
    for (const id of ['ang-wu-1', 'ang-wu-2', 'ang-wu-3', 'ang-wu-4', 'ang-wu-5', ...bank.filter(c => c.module === 'M9').map(c => c.id)]) clear(boss, id, { now: NOW - DAY_MS, due: NOW + 9 * DAY_MS });
    assert.deepEqual(bossReady(boss).map(b => b.id), ['B2']);
    assert.deepEqual([nextAction(boss, { now: NOW }).label, nextAction(boss, { now: NOW }).href], ['Boss: The Oracle', '#/boss/B2']);
    boss.trophies['boss:B2'] = { at: NOW };
    assert.equal(nextAction(boss, { now: NOW }).kind, 'page');
    const mock = mk({ testDate: addDays(TODAY, 4) }); mock.placement.done = true; mock.daily[TODAY] = { xp: 500, clears: 12, goalMet: true, mockDone: false };
    assert.deepEqual([nextAction(mock, { now: NOW }).label, nextAction(mock, { now: NOW }).href], ['Mock #1', '#/mock']);
    mock.runs.push({ kind: 'baseline', status: 'done', score: 70, startedAt: NOW - DAY_MS });
    assert.notEqual(nextAction(mock, { now: NOW }).kind, 'mock', 'a Baseline already gives A');
    const missed = mk(); missed.placement.done = true; missed.daily[TODAY] = { xp: 500, clears: 12, goalMet: true, mockDone: false };
    clear(missed, 'wp-07', { now: NOW - DAY_MS, outcome: 'wrong', due: NOW + DAY_MS });
    assert.deepEqual(missedOriginals(missed), ['wp-07']);
    assert.deepEqual([nextAction(missed, { now: NOW }).label, nextAction(missed, { now: NOW }).href], ['Drill what you missed', '#/run/missed']);
  });
  test('B3 needs M10 cleared AND every M11/M12 family tile ≥ Bronze', () => {
    const s = mk();
    for (const c of bank) if (c.module === 'M10' || c.module === 'M11') clear(s, c.id, { now: NOW - DAY_MS, due: NOW + 9 * DAY_MS });
    assert.ok(!bossReady(s).some(b => b.id === 'B3'), 'family tiles still blank');
    s.variants = { 'fam-quad-a1': { clearsGold: 1, goldDays: [TODAY] }, 'fam-quad-a2': { clearsGold: 1, goldDays: [TODAY] }, 'fam-quad-ctx': { clearsGold: 1, goldDays: [TODAY] }, 'fam-sys': { clearsGold: 1, goldDays: [TODAY] } };
    assert.ok(bossReady(s).some(b => b.id === 'B3'));
    assert.equal(composePage(s, { now: NOW }).meta.boss.id, 'B3', 'the Page carries the prompt');
  });
});

/* ---------------- r1: the review re-queue is bounded ---------------- */
describe('r1: a review that keeps failing is re-queued once, never forever', () => {
  test('a review missed twice appears at most twice in the queue; a voluntary reveal is not re-queued', () => {
    const s = mk();
    ['voc-01', 'voc-02', 'not-01', 'fac-01', 'asn-01', 'ang-wu-1'].forEach((id, i) => clear(s, id, { now: NOW - 3 * DAY_MS, due: NOW - (6 - i) * DAY_MS }));
    const ip = startPage(s, { now: NOW });
    const id = ip.queue[0].id;
    const n0 = ip.queue.length;
    assert.equal(MAX_REQUEUE, 1);
    const miss = { id, cleared: false, solutionShown: true, reason: 'third-wrong', xp: 0 };
    // miss #1 → one retry copy after the review block
    const copy = requeueReview(s, { idx: 0, result: miss });
    markItem(s, miss, { idx: 0 });
    assert.ok(copy && copy.requeued === 1);
    assert.equal(ip.queue.length, n0 + 1);
    // miss #2 on the copy → no third copy
    const at = ip.queue.indexOf(copy);
    assert.equal(requeueReview(s, { idx: at, result: miss }), null, 'the copy is not re-queued again');
    markItem(s, miss, { idx: at });
    assert.equal(ip.queue.filter(it => it.id === id).length, 2, 'at most twice');
    assert.equal(ip.queue.length, n0 + 1, 'the page does not keep growing');
    // a voluntary "Show solution" (reason 'revealed') on a fresh review is not retried in this Page
    const revealed = { id: ip.queue[1].id, cleared: false, solutionShown: true, reason: 'revealed', xp: 0 };
    assert.equal(requeueReview(s, { idx: 1, result: revealed }), null);
    // a stored result is read when none is passed
    ip.queue[2].result = revealed;
    assert.equal(requeueReview(s, { idx: 2 }), null);
    assert.equal(ip.queue.length, n0 + 1);
  });
});
