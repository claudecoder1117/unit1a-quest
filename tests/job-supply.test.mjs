// tests/job-supply.test.mjs — J5b: RECALL supply.
//
// COMPOSED-GAME G4 "Supply: what the packet can actually feed, per wing" and G8's J5b row:
//   • `T-asn-reason` generates from the 54 existing one-line reasons in `data/asn.js` with no new
//     authored content, no `orig`, no PNG (BUILD-POLICY §1)
//   • it registers through `templatesForSkill` for ASN-PLP and ASN-ANG and pays `scope 0.8`
//   • a 30-run simulated week never repeats a card inside its Leitner interval
//   • an untemplated `def-*`/`fact-*` repeat inside its interval pays `scope 0.5` and the envelope
//     prints `repeat · scope 0.5`
//   • per-wing supply is computed and printed on the board
//   • `site/data/templates.js` gains EXACTLY ONE entry and no other line changes
//
// The A/B in "the 30-run week" deletes the registry entry and rebuilds the same week from the same
// save, so the claim under test is that THIS TICKET removes the repeats — not that the composer
// happened to avoid them.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TEMPLATE_ID, VERSION, SCOPE, MODES, POOL, POOL_BY_SKILL, SKILLS, template as entry,
  build, gen, REPEAT_SCOPE, repeatFor, repeatNote, skillSupply, wingSupply,
} from '../site/js/gen/asn-reason.js';
import { REASONS, REASON_IDS, chipsFor } from '../site/data/asn.js';
import { byId as asnCardById, verdictWord } from '../site/data/cards/asn.js';
import { templates, templateIds, getTemplate, generate, templatesFor, templatesForSkill, tagFor } from '../site/data/templates.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { composePage } from '../site/js/page.js';
import { applyOutcome, isDue, DAY_MS, intervalDays } from '../site/js/schedule.js';
import { fresh } from '../site/js/store.js';
import { todayISO } from '../site/js/days.js';
import { rngFrom } from '../site/js/rng.js';
import { scopeFor } from '../site/js/xp.js';
import { grade, ready as gradersReady } from '../site/js/grader/index.js';
import { postedFor, scopeOf } from '../site/js/job/econ.js';
import { SCOPE_MIRROR, WINGS, WING_IDS, COPY } from '../site/data/job.js';
import { skills as SKILL_TABLE } from '../site/data/skills.js';
import { read, stripCommentsAndStrings } from './_helpers.mjs';

const SRC = read('site/js/gen/asn-reason.js');
const REGISTRY_SRC = read('site/data/templates.js');
const HOUR_MS = 3_600_000;
const NOW = Date.parse('2026-09-14T17:00:00');

/** every chip line the bank owns — nothing else may ever appear as an option */
const BANK_LINES = new Set(REASON_IDS.flatMap((id) => [REASONS[id].reason, ...(REASONS[id].distractors ?? [])]));

const sample = (n, tag = 's') => Array.from({ length: n }, (_, i) => `${tag}-${i}`);

/* ================================================================================================
   1. content provenance — the 54 reasons already in data/asn.js, and nothing else
   ================================================================================================ */

describe('J5b: T-asn-reason draws only from the 54 reasons in data/asn.js', () => {
  test('the pool IS the 54 in-scope reason sets (asn-01..36 + qz-01..18), never a bonus statement', () => {
    assert.equal(POOL.length, 54, `pool ${POOL.length}`);
    assert.equal(POOL.filter((id) => id.startsWith('asn-')).length, 36);
    assert.equal(POOL.filter((id) => id.startsWith('qz-')).length, 18);
    assert.equal(POOL.filter((id) => id.startsWith('bonus-')).length, 0);
    for (const id of POOL) {
      assert.ok(REASONS[id], `${id} is not in data/asn.js`);
      assert.equal(chipsFor(id).length, 3, `${id}: one reason + two distractors`);
      assert.ok(asnCardById[id] && !asnCardById[id].bonus, `${id} has no in-scope statement`);
    }
    // the two skills partition the pool exactly
    assert.deepEqual(SKILLS.slice().sort(), ['ASN-ANG', 'ASN-PLP']);
    assert.equal(POOL_BY_SKILL['ASN-PLP'].length + POOL_BY_SKILL['ASN-ANG'].length, 54);
    assert.equal(new Set([...POOL_BY_SKILL['ASN-PLP'], ...POOL_BY_SKILL['ASN-ANG']]).size, 54);
  });

  test('400 seeded items: every option is a line the bank already owns', () => {
    let reasonMode = 0;
    let verdictMode = 0;
    for (const seed of sample(400, 'prov')) {
      const item = generate(TEMPLATE_ID, seed);
      const ref = item.params.ref;
      assert.ok(POOL.includes(ref), `${seed}: ref ${ref} is outside the 54`);
      const bank = REASONS[ref];
      const part = item.parts[0];
      if (item.params.mode === 'reason') {
        reasonMode++;
        assert.equal(part.answer, bank.reason, `${seed}: the answer is not the bank's reason`);
        const texts = part.distractors.map((d) => d.text);
        assert.deepEqual(texts.slice().sort(), bank.distractors.slice().sort(), `${seed}: distractors are not the bank's`);
        for (const t of [part.answer, ...texts]) assert.ok(BANK_LINES.has(t), `${seed}: "${t.slice(0, 40)}…" is not a bank line`);
      } else {
        verdictMode++;
        assert.equal(part.reason, bank.reason, `${seed}: the reason shown is not the bank's`);
        assert.ok(item.stem.includes(bank.reason), `${seed}: the bank reason is not on the stem`);
      }
      // the statement is the committed transcription, verbatim — never re-typed here
      assert.ok(item.stem.includes(asnCardById[ref].stem), `${seed}: the statement is not the card's`);
    }
    assert.ok(reasonMode > 0 && verdictMode > 0, `both asks are drawn: reason ${reasonMode} / verdict ${verdictMode}`);
  });

  test('every one of the 54 is reachable, and `ref` / `skill` force a statement', () => {
    const seen = new Set();
    for (const seed of sample(2000, 'reach')) seen.add(generate(TEMPLATE_ID, seed).params.ref);
    assert.equal(seen.size, 54, `only ${seen.size} of the 54 statements were drawn in 2000 seeds`);
    for (const ref of ['asn-01', 'qz-18', 'asn-36']) {
      assert.equal(generate(TEMPLATE_ID, 'x', { ref }).params.ref, ref);
    }
    for (const skill of SKILLS) {
      for (const seed of sample(40, `sk-${skill}`)) {
        assert.equal(generate(TEMPLATE_ID, seed, { skill }).params.skill, skill);
      }
    }
  });

  test('BUILD-POLICY §1: no orig, no PNG, no site/content, no teacher key anywhere in the generator', () => {
    // the CODE (comments and strings stripped) may not name any of the forbidden objects…
    const code = stripCommentsAndStrings(SRC);
    for (const banned of [/\borig\b/, /\bteacherKey\b/, /\bcrop\b/, /content\//, /\.png/]) {
      assert.equal(banned.test(code), false, `js/gen/asn-reason.js names ${banned}`);
    }
    // …and every module it imports is a committed, served one: the reason bank, the statements it
    // justifies, the card index, the layer's constants and two study-layer modules. Nothing else.
    const imports = [...SRC.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(imports.slice().sort(), [
      '../../data/asn.js', '../../data/cards.js', '../../data/cards/asn.js', '../../data/job.js',
      '../rng.js', '../schedule.js',
    ]);
    for (const spec of imports) assert.equal(/content|source|orig/.test(spec), false, `imports ${spec}`);
    assert.equal(/\.(png|jpe?g|pdf|html?)\b/i.test(SRC), false, 'the generator names a source asset');
    // it authors no statement/reason of its own: nothing but frames lives in its string literals
    assert.equal(code.includes('°'), false, 'a degree sign in code means content was re-typed here');
  });

  test('DOM-free and node-importable (the gen/ discipline)', () => {
    const code = stripCommentsAndStrings(SRC);
    for (const dom of ['document', 'window.', 'localStorage', 'navigator', 'requestAnimationFrame']) {
      assert.equal(code.includes(dom), false, `asn-reason.js touches ${dom}`);
    }
    assert.equal(/from '\.\.\/screens\//.test(SRC), false, 'a generator never imports a screen');
  });

  test('seeded discipline: the same seed rebuilds the same item, and build() is the same stream', () => {
    for (const seed of sample(50, 'det')) {
      assert.deepEqual(generate(TEMPLATE_ID, seed), generate(TEMPLATE_ID, seed), `${seed} is not deterministic`);
      assert.deepEqual(gen(seed), build(rngFrom(TEMPLATE_ID, seed)), `${seed}: gen() is not rngFrom(template, seed)`);
    }
    const ids = sample(30, 'spread').map((s) => generate(TEMPLATE_ID, s).id);
    assert.ok(new Set(ids).size > 25, 'different seeds must give different items');
  });
});

/* ================================================================================================
   2. the registry — ONE entry, on ASN-PLP and ASN-ANG
   ================================================================================================ */

describe('J5b: it registers through templatesForSkill for ASN-PLP and ASN-ANG', () => {
  test('templatesForSkill returns it for both ASN skills, and for no other skill', () => {
    assert.deepEqual(templatesForSkill('ASN-PLP'), [TEMPLATE_ID]);
    assert.deepEqual(templatesForSkill('ASN-ANG'), [TEMPLATE_ID]);
    for (const s of SKILL_TABLE.map((x) => x.id)) {
      if (SKILLS.includes(s)) continue;
      assert.equal(templatesForSkill(s).includes(TEMPLATE_ID), false, `${s} must not draw the ASN reason drill`);
    }
  });

  test('the entry is well formed and carries the registry contract', () => {
    const e = getTemplate(TEMPLATE_ID);
    assert.ok(e, 'T-asn-reason is not registered');
    assert.equal(e, entry, 'the registry entry is the generator’s own frozen descriptor');
    assert.equal(typeof e.gen, 'function');
    assert.equal(e.version, VERSION);
    assert.equal(e.tier, 1);
    assert.equal(e.par, 20);
    assert.equal(e.module, 'M9');
    assert.deepEqual(e.skills.slice().sort(), ['ASN-ANG', 'ASN-PLP']);
    assert.deepEqual(e.partTypes.slice().sort(), ['asn', 'mc']);
    assert.deepEqual(e.modes, MODES.slice());
    assert.match(TEMPLATE_ID, /^T-[a-z0-9-]+$/);
    assert.equal(templateIds().filter((id) => id === TEMPLATE_ID).length, 1);
  });

  test('generate() stamps the S3 identity, exactly as it does for every other template', () => {
    const item = generate(TEMPLATE_ID, 'stamp-1');
    assert.equal(item.template, TEMPLATE_ID);
    assert.equal(item.templateVersion, VERSION);
    assert.equal(item.seed, 'stamp-1');
    assert.equal(item.seedKey, `${TEMPLATE_ID}|stamp-1`);
    assert.equal(item.seedTag, tagFor(TEMPLATE_ID, 'stamp-1'));
    assert.equal(item.id, `${TEMPLATE_ID}#${item.seedTag}`);
    assert.equal(item.tier, 1);
    assert.equal(item.figure, null);
    assert.equal(item.skills.length, 1);
    assert.ok(SKILLS.includes(item.skills[0]));
    assert.equal(item.hints.length, 3);
    assert.equal(item.solution.length, 1);
  });

  test('no asn-*/qz-* original changes its Infinite, review or rematch path (forCards is empty)', () => {
    assert.deepEqual(entry.forCards, []);
    assert.equal(entry.forCard, null);
    for (const id of POOL) assert.deepEqual(templatesFor(id), [], `${id} gained a per-card template`);
  });

  test('site/data/templates.js gains EXACTLY ONE entry and no other line changes', () => {
    const blocks = REGISTRY_SRC.match(/\/\* === J5b === \*\/[\s\S]*?\/\* === \/J5b === \*\//g) ?? [];
    assert.equal(blocks.length, 1, 'exactly one J5b block');
    const block = blocks[0];
    const assignments = block.match(/^\s*templates\[[^\]]+\]\s*=/gm) ?? [];
    assert.equal(assignments.length, 1, `the block registers ${assignments.length} entries, not 1`);
    assert.equal((block.match(/^import /gm) ?? []).length, 1, 'one import line');
    // nothing outside the block mentions this ticket's generator
    const outside = REGISTRY_SRC.replace(block, '');
    assert.equal(outside.includes('asn-reason'), false, 'templates.js names asn-reason outside the J5b block');
    assert.equal(outside.includes('J5b'), false, 'templates.js names J5b outside its own block');
    // and the block is appended: every earlier ticket's block is still closed before it
    assert.ok(REGISTRY_SRC.indexOf('/* === /T07c === */') < REGISTRY_SRC.indexOf('/* === J5b === */'));
  });
});

/* ================================================================================================
   3. it pays scope 0.8, and it grades through the existing graders
   ================================================================================================ */

describe('J5b: a reason drill is a Variant — scope 0.8', () => {
  test('SCOPE is xp.scopeFor({isVariant}) verbatim, and data/job.js mirrors it', () => {
    assert.equal(SCOPE, 0.8);
    assert.equal(scopeFor({ isVariant: true }), 0.8);
    assert.equal(SCOPE_MIRROR.variant, 0.8);
    assert.equal(scopeOf({ scopeFlags: { isVariant: true } }), 0.8);
  });

  test('the envelope prices a tier-1 reason drill at 0.8 of a drill', () => {
    assert.equal(postedFor({ tier: 1, scopeFlags: { isDrill: true } }), 6);
    assert.equal(postedFor({ tier: 1, scopeFlags: { isVariant: true } }), 5);   // round(6 × 0.8)
  });

  test('the composer serves it as a Variant on an ASN weak slot (isVariant → scope 0.8)', () => {
    const s = weekSave();
    const { queue } = composePage(s, { now: NOW, pageIndex: 0 });
    const asnWeak = queue.filter((it) => it.role === 'weak' && SKILLS.includes(it.skill));
    assert.ok(asnWeak.length > 0, 'the fixture must put an ASN weak slot on the page');
    for (const it of asnWeak) {
      assert.equal(it.kind, 'variant', `${it.id} is still an original`);
      assert.equal(it.isVariant, true);
      assert.equal(it.template, TEMPLATE_ID);
      assert.equal(scopeOf({ scopeFlags: { isVariant: it.isVariant } }), 0.8);
    }
  });

  test('grader wiring: mc grades the reason chip, asn grades the verdict, and both tag a miss', async () => {
    await gradersReady;
    const reason = generate(TEMPLATE_ID, 'g-1', { mode: 'reason', ref: 'asn-03' });
    const part = reason.parts[0];
    assert.equal(part.type, 'mc');
    const okR = grade(part, part.answer);
    assert.equal(okR.ok, true, okR.msg);
    const badR = grade(part, part.distractors[0].text);
    assert.equal(badR.ok, false);
    assert.deepEqual(badR.tags, ['wrong-reason']);

    const verdict = generate(TEMPLATE_ID, 'g-2', { mode: 'verdict', ref: 'asn-03' });   // asn-03 is N
    const vp = verdict.parts[0];
    assert.equal(vp.type, 'asn');
    assert.equal(vp.answer, asnCardById['asn-03'].parts[0].answer);
    const okV = grade(vp, 'N');
    assert.equal(okV.ok, true, okV.msg);
    const badV = grade(vp, 'S');
    assert.equal(badV.ok, false);
    assert.deepEqual(badV.tags, ['undergeneralised']);
    assert.equal(verdict.answer, verdictWord('N'));
  });
});

/* ================================================================================================
   4. the 30-run simulated week
   ================================================================================================ */

function weekSave() {
  const s = fresh(NOW - 3 * DAY_MS);
  s.profileId = 'j5b-week';
  s.settings.testDate = '2026-09-30';        // D ≈ 16 all week: no Final Sweep pulls a card early
  const at = NOW - DAY_MS;
  const rec = (m) => ({ m, n: 4, lastAt: at, lastDueCorrectAt: null, placedAt: null, misses: 2, decayDays: 0 });
  s.skills['ASN-PLP'] = rec(50);             // met (m ≥ 40) and weak (a recorded miss) — the J5b case
  s.skills['ASN-ANG'] = rec(50);
  s.skills['VOC'] = rec(55);
  return s;
}

/** 30 runs over a week. Every card is answered clean; Leitner is advanced by the real module. */
function runWeek(save, runs = 30) {
  let now = NOW;
  const early = [];
  const served = [];
  let weakCards = 0;
  let weakVariants = 0;
  for (let r = 0; r < runs; r++) {
    const { queue } = composePage(save, { now, today: todayISO(new Date(now)), pageIndex: r % 5 });
    for (const it of queue) {
      if (it.kind === 'card') {
        const rec = save.cards?.[it.id];
        const seen = !!rec && rec.lastAt != null;
        if (seen && !isDue(rec, now) && it.role !== 'rematch') {
          early.push({ id: it.id, role: it.role, skill: it.skill, earlyDays: (rec.due - now) / DAY_MS, interval: intervalDays(rec.bucket ?? 0) });
        }
        served.push(it.id);
        applyOutcome(save, it.id, 'clean', { now });
        save.cards[it.id].cleared = true;
        if (it.role === 'weak') weakCards++;
      } else if (it.role === 'weak') weakVariants++;
      now += 40_000;
    }
    now += 3 * HOUR_MS;
    if (r % 5 === 4) now += 12 * HOUR_MS;    // next day
  }
  return { early, served, weakCards, weakVariants };
}

describe('J5b: a 30-run simulated week never repeats a card inside its Leitner interval', () => {
  test('30 runs, every card answered: no card is served before it is due', () => {
    const { early, served, weakCards, weakVariants } = runWeek(weekSave());
    assert.ok(served.length >= 250, `only ${served.length} cards served in 30 runs`);
    assert.equal(early.length, 0, `served early: ${early.slice(0, 5).map((e) => `${e.id} (${e.role}, ${e.earlyDays.toFixed(2)} d early)`).join(', ')}`);
    assert.equal(weakCards, 0, 'every weak slot is a re-keyed Variant, never a re-served original');
    assert.ok(weakVariants >= 60, `weak Variants ${weakVariants}`);
  });

  test('A/B: without the J5b entry the same week DOES repeat ASN originals inside their interval', () => {
    const saved = templates[TEMPLATE_ID];
    let off;
    try {
      delete templates[TEMPLATE_ID];
      assert.deepEqual(templatesForSkill('ASN-PLP'), [], 'the A/B must actually unregister it');
      off = runWeek(weekSave());
    } finally {
      templates[TEMPLATE_ID] = saved;
    }
    assert.deepEqual(templatesForSkill('ASN-PLP'), [TEMPLATE_ID], 'the registry is restored');
    assert.ok(off.early.length > 0, 'the pre-J5b world is supposed to repeat cards early');
    for (const e of off.early) {
      assert.equal(e.role, 'weak', `an early repeat outside the weak slot: ${e.id} (${e.role})`);
      assert.ok(SKILLS.includes(e.skill), `an early repeat outside RECALL's ASN skills: ${e.id} (${e.skill})`);
    }
    assert.ok(off.weakCards > 0, 'without a generator the weak slot re-serves originals');
  });
});

/* ================================================================================================
   5. the blessed repeat: an untemplated def-* / fact-* inside its interval
   ================================================================================================ */

const DEF_FACT = ALL_CARDS.filter((c) => /^(def|fact)-/.test(c.id)).map((c) => c.id);

describe('J5b: an untemplated def-* / fact-* repeat pays scope 0.5 and says so', () => {
  test('def-* and fact-* really are untemplated (no template can re-key them)', () => {
    assert.ok(DEF_FACT.length >= 19, `def-*/fact-* ${DEF_FACT.length}`);
    for (const id of DEF_FACT) assert.deepEqual(templatesFor(id), [], `${id} has a template after all`);
  });

  test('a cleared, not-yet-due fact-* re-served inside its interval prices at 0.5', () => {
    const s = fresh(NOW - DAY_MS);
    applyOutcome(s, 'fact-01', 'clean', { now: NOW });                  // bucket 1 → due in 1 day
    s.cards['fact-01'].cleared = true;
    const r = repeatFor('fact-01', s, { now: NOW + HOUR_MS, templatesFor });
    assert.equal(r.repeat, true);
    assert.equal(r.scope, 0.5);
    assert.equal(r.reason, 'repeat');
    assert.ok(r.daysEarly > 0.9 && r.daysEarly < 1, `daysEarly ${r.daysEarly}`);
    assert.equal(r.note, 'repeat · scope 0.5');
  });

  test('the envelope line is data/job.js COPY.repeat(), derived from the constant', () => {
    assert.equal(repeatNote(), 'repeat · scope 0.5');
    assert.equal(repeatNote(), COPY.repeat());
    assert.equal(REPEAT_SCOPE, SCOPE_MIRROR.repeat);
    assert.equal(REPEAT_SCOPE, 0.5);
    // and it is visibly unprofitable: half of a drill, at every tier
    for (const tier of [1, 2, 3, 4]) {
      assert.equal(postedFor({ tier, scope: REPEAT_SCOPE }), Math.round(postedFor({ tier, scope: 1 }) * 0.5));
    }
  });

  test('a due card, an unseen card and a templated card are NOT repeats', () => {
    const s = fresh(NOW - DAY_MS);
    assert.equal(repeatFor('fact-02', s, { now: NOW, templatesFor }).reason, 'unseen');
    applyOutcome(s, 'fact-02', 'clean', { now: NOW });
    s.cards['fact-02'].cleared = true;
    assert.equal(repeatFor('fact-02', s, { now: NOW + 2 * DAY_MS, templatesFor }).reason, 'due');
    assert.equal(repeatFor('fact-02', s, { now: NOW + 2 * DAY_MS, templatesFor }).repeat, false);

    const templatedId = ALL_CARDS.map((c) => c.id).find((id) => templatesFor(id).length > 0);
    applyOutcome(s, templatedId, 'clean', { now: NOW });
    s.cards[templatedId].cleared = true;
    const t = repeatFor(templatedId, s, { now: NOW + HOUR_MS, templatesFor });
    assert.equal(t.repeat, false, `${templatedId} can be re-keyed, so it is never a repeat`);
    assert.equal(t.reason, 'templated');
    assert.equal(t.templated, true);
  });
});

/* ================================================================================================
   6. per-wing supply, for the board sheet
   ================================================================================================ */

describe('J5b: per-wing supply is computed and exported for the board', () => {
  const opts = () => ({ now: NOW, templatesForSkill, templatesFor });

  test('the four wings of G3.4 partition the 19 skills, and every one reports a supply row', () => {
    const s = weekSave();
    const { wings, order, total } = wingSupply(s, opts());
    assert.deepEqual(order, WING_IDS.slice());
    const all = order.flatMap((id) => wings[id].skills);
    assert.equal(all.length, 19);
    assert.equal(new Set(all).size, 19);
    assert.deepEqual(all.slice().sort(), SKILL_TABLE.map((x) => x.id).sort());
    assert.equal(order.reduce((t, id) => t + wings[id].w, 0), 100);
    assert.equal(total, order.reduce((t, id) => t + wings[id].locks, 0));
  });

  test('locks = due + fresh + renewable families, and the board line is G6 copy', () => {
    const s = weekSave();
    const { wings, order, lines } = wingSupply(s, opts());
    order.forEach((id, i) => {
      const w = wings[id];
      assert.equal(w.locks, w.due + w.fresh + w.families.length, `${id}: locks`);
      assert.equal(lines[i], COPY.supply({ wing: w.label, locks: w.locks }), `${id}: board line`);
      assert.equal(w.renewable, w.families.length > 0);
    });
    assert.match(lines[0], /^RECALL \d+ locks available today$/);
  });

  test('THE POINT: the J5b entry is what makes ASN-PLP and ASN-ANG renewable in RECALL', () => {
    const s = weekSave();
    const on = wingSupply(s, opts()).wings.RECALL;
    assert.ok(on.families.includes(TEMPLATE_ID), 'RECALL does not carry the reason drill');
    for (const k of SKILLS) assert.ok(on.renewableSkills.includes(k), `${k} is not renewable`);

    const saved = templates[TEMPLATE_ID];
    let off;
    try {
      delete templates[TEMPLATE_ID];
      off = wingSupply(s, opts()).wings.RECALL;
    } finally {
      templates[TEMPLATE_ID] = saved;
    }
    for (const k of SKILLS) assert.equal(off.renewableSkills.includes(k), false, `${k} was renewable before J5b`);
    assert.equal(off.families.length, on.families.length - 1, 'exactly one family is added');
    assert.equal(on.locks, off.locks + 1, 'RECALL gains exactly one always-available lock');
    // every wing but RECALL is untouched by this ticket
    for (const id of WING_IDS.filter((x) => x !== 'RECALL')) {
      assert.deepEqual(wingSupply(s, opts()).wings[id].families.includes(TEMPLATE_ID), false);
    }
  });

  test('skillSupply counts dues, fresh originals and the repeatable tail per skill', () => {
    const s = weekSave();
    applyOutcome(s, 'fact-01', 'clean', { now: NOW - HOUR_MS });          // cleared, not due → repeatable
    s.cards['fact-01'].cleared = true;
    applyOutcome(s, 'asn-01', 'clean', { now: NOW - 3 * DAY_MS });        // bucket 1 → due
    s.cards['asn-01'].cleared = true;
    const rows = skillSupply(s, opts());
    assert.ok(rows['ASN-PLP'].repeatable >= 1, 'fact-01 is a repeatable untemplated original');
    assert.ok(rows['ASN-ANG'].due >= 1 || rows['ASN-PLP'].due >= 1, 'a cleared card comes back due');
    for (const k of SKILLS) {
      assert.deepEqual(rows[k].families, [TEMPLATE_ID]);
      assert.equal(rows[k].renewable, true);
      assert.equal(rows[k].locks, rows[k].due + rows[k].fresh + 1);
      assert.ok(rows[k].originals > 0);
    }
    const bankTotal = Object.values(rows).reduce((t, r) => t + r.originals, 0);
    const plannable = ALL_CARDS.filter((c) => !c.bonus && (c.skills ?? []).length > 0).length;
    assert.equal(bankTotal, plannable, 'every plannable original lands in exactly one wing');
  });

  test('a wing with no cards and no generator reports thin (G4 response 1)', () => {
    const s = fresh(NOW);
    const empty = wingSupply(s, { now: NOW, cards: [], templatesForSkill: () => [], templatesFor: () => [] });
    assert.deepEqual(empty.thin.slice().sort(), WING_IDS.slice().sort());
    assert.equal(empty.total, 0);
    // with the generator registered, RECALL is never thin — that is what the ticket buys
    const withGen = wingSupply(s, { now: NOW, cards: [], templatesForSkill, templatesFor });
    assert.equal(withGen.thin.includes('RECALL'), false);
    assert.equal(withGen.wings.RECALL.renewable, true);
  });

  test('wingSupply is pure: it writes nothing to the save', () => {
    const s = weekSave();
    const before = JSON.stringify(s);
    wingSupply(s, opts());
    skillSupply(s, opts());
    repeatFor('fact-01', s, { now: NOW, templatesFor });
    assert.equal(JSON.stringify(s), before, 'the supply arithmetic mutated the save');
  });
});
