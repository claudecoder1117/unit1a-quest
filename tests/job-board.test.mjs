// tests/job-board.test.mjs — J5: the board, the bundles and the draft.
//
// The acceptance list of COMPOSED-GAME G8's J5 row, in order:
//   • all 10 drafts × 50 seeded saves contain 100 % of critical dues
//   • composePage is untouched by the layer: pinned by 400 digests, and byte-identical to pre-ticket
//     wherever J5b's own new template is not drawn (one save in 400 — see §1)
//   • draftUnion dedupes (Σ targets(drafted) == |union|, no card twice) and the board's printed NET
//     posted equals the post-dedupe value for all C(5,3) = 10 drafts
//   • the drafted queue satisfies LIMITS.sameSkillRun ≤ 2 and a monotone 1→4 tier ramp
//   • the 5 posted contracts span ≥ 3 wings and every legal 3-of-5 draft spans ≥ 2
//   • a thin queue posts min(5, available) contracts and narrows the draft
//   • vaultFor returns the most-overdue CLEARED tier-3/4 original and is seed-independent (10 seeds)
//   • declines re-price at +0.15
//   • the ×2 lands independently at p = 1/6 per target (1/6 ± 0.01 over 10⁴ day seeds), seeded per
//     dateISO|jobIndex|targetIndex, and is marked BEFORE the call
//   • COMPOSED Global rule 5: no item is ever removed from the schedule by a game decision
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, composePage, composeBundles, draftUnion, jobBudget, jobTargetOf, isCriticalTarget, bossReady,
  postedCountFor, draftCountFor, criticalReplicationFor, coverageOf, JOB_BUNDLE_IDS, runCapFor,
  JOB_MIN_LOCKS, estimateMinutes, spreadSkills, markItem, finishPage,
} from '../site/js/page.js';
import * as state from '../site/js/job/state.js';
import { startJob, walk } from '../site/js/job/state.js';
import { composeOpts } from '../site/js/plan.js';
import {
  postBoard, buildJob, draftFrom, declinePrice, vaultFor, legalDrafts, jobIndexFor, jobSeedFor,
  shapeFor, jobQueueOf, jobBoardOf, VAULT_TIERS, x2Marks,
} from '../site/js/job/board.js';
import { postedFor, shapeTable, decisionCount, answerSeconds, decisionSeconds } from '../site/js/job/econ.js';
import { wingOf } from '../site/js/job/guard.js';
import {
  SHAPES, SHAPE_IDS, BOARD, X2, DECLINE_PRICE, CAPS, IN_PROGRESS_KEYS, WING_IDS, WING_OF_SKILL,
  PHASE_MEANS_DEFAULT, ANSWER_MINUTES_PER_TIER, DECISION_SECONDS, SPLIT, COPY,
} from '../site/data/job.js';
import { templates, templatesForSkill } from '../site/data/templates.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, recordRematch, overdueDays, DAY_MS, HOUR_MS } from '../site/js/schedule.js';
import { cyrb53, mulberry32, rngFrom } from '../site/js/rng.js';
import { addDays, todayISO } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { isCleared } from '../site/js/readiness.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter(c => !isBonus(c.id));

/* ------------------------------------------------------------------ the 50-save corpus */

/**
 * 50 deterministic saves, built through `rng.js` (never `Math.random`) so the corpus is byte-stable:
 * different ages, test dates, clear/miss histories, due spreads, skill mastery and rematch state.
 */
function seededSave(i) {
  const rng = rngFrom('job-board-corpus', i);
  const ageDays = 2 + rng.int(0, 30);
  const s = fresh(NOW - ageDays * DAY_MS);
  s.profileId = `corpus-${i}`;
  s.settings.testDate = rng.chance(0.15) ? null : addDays('2026-09-16', 1 + rng.int(0, 20));
  const n = rng.int(0, 40);
  for (let k = 0; k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    const reps = 1 + rng.int(0, 4);
    let rec = null;
    for (let r = 0; r < reps; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = rng.chance(0.8); rec.attempts = 1; rec.rarity = rec.cleared ? 'gold' : null;
    rec.due = NOW + (rng.chance(0.6) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
  }
  const skills = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
  for (const k of skills) {
    if (!rng.chance(0.7)) continue;
    s.skills[k] = { m: rng.int(0, 100), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: rng.chance(0.4) ? NOW - DAY_MS : null };
  }
  if (rng.chance(0.5)) { const c = BANK[rng.int(0, BANK.length - 1)]; recordRematch(s, { item: c.id, got: '7', now: NOW - HOUR_MS }); }
  return s;
}

const CORPUS = Array.from({ length: 50 }, (_, i) => seededSave(i));

/**
 * THE WIDE CORPUS — the same generator, the same tag, saves 0…399 (the first fifty ARE `CORPUS`, byte
 * for byte). The fifty are what the digest pin and the per-board assertions use; the two ORDER laws —
 * the run cap and the 1→4 ramp — are asserted over all four hundred, because round 1 found a ramp
 * break at save 211 that fifty samples cannot see and the old assertion therefore proved only that
 * those fifty were clean. 400 boards × 10 drafts ≈ 0.3 s, so the width is free.
 */
const WIDE_N = 400;
const wideSave = (i) => (i < CORPUS.length ? CORPUS[i] : seededSave(i));

/** A board for corpus save `i`, with everything pinned. */
const boardFor = (i, opts = {}) => postBoard(CORPUS[i], '2026-09-16', { now: NOW, ...opts });

/* ------------------------------------------------------------------ synthetic queues */

let synth = 0;
const item = (skill, tier, role = 'new', extra = {}) => ({
  n: ++synth, id: `syn-${synth}`, kind: 'card', role, skill, skills: [skill], tier,
  module: 'M1', sheet: 'M1', isReview: role === 'review', isRematch: role === 'rematch',
  isVariant: false, done: false, result: null, ...extra,
});
const review = (skill, tier, bucket, overdue) => item(skill, tier, 'review', { bucket, overdue });
const fakePage = (queue) => ({
  seed: 1234, seedTag: 'abc123', queue: queue.map((it, i) => ({ ...it, n: i + 1 })),
  meta: { day: '2026-09-16', counts: {}, minutes: estimateMinutes(queue) },
});

/* ------------------------------------------------------------------ helpers */

const idsOf = (xs) => xs.map(x => (typeof x === 'string' ? x : x.id));
const setOf = (xs) => new Set(idsOf(xs));
const worstRun = (queue) => {
  let worst = 0, run = 0, last = null;
  for (const it of queue) { run = it.skill === last ? run + 1 : 1; last = it.skill; worst = Math.max(worst, run); }
  return worst;
};
const isMonotone = (queue) => queue.every((it, i) => i === 0 || it.tier >= queue[i - 1].tier);

/**
 * EXACT oracle: does an arrangement exist that is BOTH monotone non-decreasing in tier AND holds
 * `run ≤ k`? Monotone fixes the tier bands in ascending order, so this is a per-band arrangement
 * problem with a carried (last skill, run) — a memoised DFS over (band, remaining counts, last, run).
 */
function existsMonotone(queue, k = LIMITS.sameSkillRun) {
  const tiers = [...new Set(queue.map(it => it.tier))].sort((a, b) => a - b);
  const bands = tiers.map(t => {
    const m = new Map();
    for (const it of queue) if (it.tier === t) m.set(it.skill, (m.get(it.skill) ?? 0) + 1);
    return m;
  });
  const seen = new Set();
  const key = (b, counts, last, run) =>
    `${b}|${[...counts.entries()].sort().map(e => e.join(':')).join(',')}|${last}|${run}`;
  const go = (b, counts, last, run) => {
    if (counts.size === 0) {
      if (b + 1 >= bands.length) return true;
      return go(b + 1, new Map(bands[b + 1]), last, run);
    }
    const kk = key(b, counts, last, run);
    if (seen.has(kk)) return false;
    seen.add(kk);
    for (const [skill, c] of counts) {
      if (skill === last && run >= k) continue;
      const next = new Map(counts);
      if (c > 1) next.set(skill, c - 1); else next.delete(skill);
      if (go(b, next, skill, skill === last ? run + 1 : 1)) return true;
    }
    return false;
  };
  if (!bands.length) return true;
  return go(0, new Map(bands[0]), null, 0);
}

/* ================================================================= 1. composePage is untouched */

describe('J5 / composePage is untouched by the game layer', () => {
  /**
   * THE PIN, AND WHAT IT IS A PIN ON (round 3).
   *
   * The four hundred digests below are `cyrb53(JSON.stringify(composePage(save, {now: NOW})))` over
   * the WIDE corpus — the same generator, the same tag, saves 0…399. They are the permanent pin: a
   * change to `composePage`'s output, from this ticket or any later one, moves one of these numbers.
   *
   * They used to be FIFTY, under the heading "byte-identical to pre-ticket", and that heading was
   * false by the time round 3 read it. The layer's one content-adjacent edit — J5b's
   * `data/templates.js` entry for `T-asn-reason` — reaches `composePage` through
   * `templateForSkill` → `templatesForSkill`, so a save whose weak-skill draw lands on ASN-PLP or
   * ASN-ANG composes a different Page than it did before the ticket. Measured against
   * `git archive HEAD`, over 400 saves: ONE divergence, at save 102 — and the fifty stopped at 50,
   * so the pin could not see the change this very build had made. (The same file's own wide order-law
   * test already argued "400 saves, not 50 … fifty samples cannot see it".)
   *
   * So the claim is split in two, and both halves are asserted below:
   *   · `composePage` ITSELF is byte-identical to pre-ticket — proved by unregistering J5b's template
   *     and reproducing HEAD's output on all 400 saves, mismatches 0;
   *   · the composed PAGE differs from pre-ticket exactly where that new template is drawn — one save
   *     in four hundred, named in `J5B_DIVERGENCE` with the digest it had before the ticket.
   * COMPOSED-GAME G8's J5 row and the header of this file say the same thing in the same words.
   */
  const DIGESTS = [
    1040168339375079, 1346070970012930, 4019843015787579, 5370774218826881, 5102099929127263,
    3520159799292369, 3153372392975210, 1311280632733721, 1029277390940134, 2352521916948957,
    8985206205785027, 6906362488545190, 3802267643972313, 2153912795303023, 3740770778702567,
    4132761189281002, 5362987918523836, 1005734291424501, 1788612456513225, 3164495268336116,
    5340415874743553, 84604034900120, 7228057796782744, 1426053408543469, 3488617803821030,
    4482233122206809, 9003461923691408, 6175305789635036, 66344438936769, 6002103634247417,
    3184711296261103, 8520949423634483, 8452482676411534, 7560064738539770, 8201348693203821,
    5815125207507024, 6571785394962445, 3930421000828457, 6181544031986004, 2365678176561578,
    6197437255994463, 4744671990914457, 8822114303612469, 5481187513065241, 3958089839235379,
    1404939863414372, 2575057274953851, 8983134442288974, 2449190324497260, 4395787994254104,
    8215766334692875, 5615894569858557, 5675132458713335, 336918514154851, 548761519578514,
    5225907285613816, 2322538708771631, 8949847976815742, 3783092630028263, 2991255861657534,
    3851515966812726, 7368810668080608, 8731699034952573, 5970024704391874, 3474027930331929,
    1751526209693350, 8048789323743868, 6491456602538858, 8899470952823588, 7628489769993926,
    6616939148588604, 6273589200961396, 8587235670286386, 227355303059171, 8969866856529477,
    2092890268478421, 6845687202070981, 7869822846244149, 1319735022344320, 2139142961355505,
    6225859886959897, 2300725101489451, 8266289550593650, 4523552110910194, 6614386749099821,
    5515551023935656, 8745060226901956, 3628817661956552, 2617851808720998, 8420829595511408,
    5122044779419917, 232622694130319, 3855682757547449, 8711390103077055, 4641153111486945,
    4991925395808846, 2107293659902671, 5396151015217191, 8329851566612832, 2224467113841452,
    8195070664758050, 4058916623027711, 4609084413796203, 6531847772043047, 3219430883114120,
    5408432335450436, 4568915740535162, 266748032520297, 1326763476047168, 2996364322264635,
    8032895507558483, 6325791690449707, 8674255218168961, 3455164947807589, 4886322752778253,
    1572661262689842, 6290022882639856, 1291447175103341, 6634615882926422, 6869938297576170,
    4052989369035046, 8139918274457097, 3587322893074695, 7103135800568920, 369433292066423,
    4095501395556341, 6170031291826545, 2079376362967749, 160308873061605, 5182139170853099,
    1361869956340257, 8971949368817942, 4702033034444455, 3971821601758230, 1930820850771279,
    5805994763349518, 837178424533191, 5628889687381554, 1958764506489666, 3137327589478302,
    5477901307141155, 3301194915465363, 324113622581851, 3492134338262035, 6449357735978013,
    4698617917676873, 3491753951668983, 7812421747140360, 7841822553926639, 1114666126966972,
    1444569990160713, 4680011834424312, 3511957343901803, 3346343519941447, 8217991486906626,
    5143593583603014, 8498392328925597, 1726996111206007, 7973072360095249, 3474960536525863,
    4428492062513995, 321401566511167, 5357048385382589, 766998193880653, 1734934527797195,
    6008048562552641, 2786239036961780, 2869103143626670, 6410826969154119, 2278295262322114,
    4949610195080535, 2888772941052888, 5582739232924399, 1340927512051180, 5642913951926504,
    8502459181856632, 3879541198733807, 3178879822930894, 5045540583574668, 8123425566000551,
    4373669205973170, 3784178470839357, 4898267481685634, 7132900828107224, 8722886604481796,
    2181362007857656, 7216301530133083, 4794665420983541, 1161148090078481, 5432248402219345,
    1148583406104879, 5406855272569152, 2453962654619265, 4137016137841853, 2653515732795126,
    1501058468867627, 1859046767306067, 3143097953169137, 985226396200293, 4343029729864018,
    4645958626861045, 2491711996290762, 4540564521618543, 2309895012249430, 8249186301134160,
    4832911811911966, 7961021752188172, 2283489050356115, 1656875125501135, 8631713750430668,
    6881917568007925, 5081687338000043, 1218524457527014, 7592286106507251, 5427884050187104,
    4602708786117162, 5221211410350205, 1870073710946044, 4832817606778111, 6338339533364566,
    479226291975507, 7465184192253951, 8759894177525406, 1624494495174825, 478394580349391,
    7239944973564497, 4100763861651782, 7947814747066667, 2812342988440679, 486380731473415,
    5882343195542877, 1892195185868989, 4130549444223027, 2283964928154265, 2520599540970021,
    2481213886077904, 8602200368763650, 8965054105262320, 7934643649583376, 8518550356285285,
    6700684581614132, 227210981447777, 8102514234948791, 251722469524418, 6648726890891732,
    1889225088856233, 75204044379091, 6657767126365952, 6731465643643621, 6096467667612889,
    8603167730085084, 8733023026215272, 4606824862430808, 2934888720666877, 8024762584461420,
    5750061320445141, 1874063662594600, 3361747475405726, 6079307464054636, 720471483305804,
    6233317675216391, 6175009050564846, 7006452368864555, 2452485093301468, 7733846077448186,
    5485072927228804, 5008543409721380, 790763258576779, 2447851867923469, 8388290222449536,
    7977675072395393, 6689386481947395, 5994252305930237, 7147742023048952, 1703869558183714,
    6240423254586625, 5823078457622613, 5191095952620127, 7983162979861812, 3975280490797133,
    4407642530394280, 575962597212989, 8788437036385039, 3814284617997104, 3666197491762080,
    5813979319326634, 2703614165503492, 1569313553695255, 7299150435321578, 34293833847841,
    4099549105773429, 1493706841721048, 1943737681662859, 3063066460886, 3234188338488245,
    4819672865222415, 5784019779749355, 1432166530078534, 6658803617520024, 776298132347581,
    6585924791781369, 3812751645299636, 8815401292774739, 4466408657932320, 4893065137204527,
    539353645891219, 2906271910418276, 5488616502491629, 4769459781515813, 3499899083454945,
    4196464897063050, 3197991212238184, 8176273373738810, 6236238577297, 746189377462356,
    5367843687671819, 8193746259005751, 5678496198740342, 1247774579585882, 2378359422327035,
    4278364339366418, 8184997588529915, 6983841008881266, 1736536649827962, 2922239054617187,
    1462411250355219, 5329913288630545, 1580848484626076, 3482539350521612, 7640284843460924,
    797845476661797, 6588335109603509, 8705156080884396, 4047472760387510, 3489532391650241,
    3517270794810736, 3699441725445500, 2659388869305791, 2216413050602422, 6791719531722487,
    2608237248966811, 6865293354634367, 7783273195256630, 8386356437628741, 1214573726435037,
    8955997034403088, 984122039285299, 3737640152495464, 5446433071102949, 3262903061658754,
    6015711120936985, 3911151446872138, 6918336640179899, 2723957975219581, 6333566412333824,
    7596361349911087, 6221386265492969, 3076159413767436, 6617360539879566, 4814105179993596,
    1265121642846764, 1696046138922182, 492750398680363, 6618344781868598, 118080981080264,
    821489979006405, 7808380844595014, 6756586755648055, 3990489327347207, 1649923047432434,
    1220443199262670, 6190171396318542, 753261008082763, 5558201194632288, 6812987911760014,
    3863824107534412, 8750685704379281, 7425699384591532, 1508093388308181, 344267478039073,
    4179704934351236, 5095784516234109, 2840100249474837, 8448349644329837, 1444791441427514,
    2146309974652263, 3668173049258716, 2124238143981326, 5605473702381944, 7103860946408450,
    7202332519148295, 2724262395159457, 1538087622532651, 8908225349545320, 3984053125811397,
    5818737890522500, 268800197852351, 4082067490633145, 8028763128926342, 935247714147983,
  ];

  /**
   * The saves whose composed Page is NOT what it was before the game layer, with the pre-ticket
   * digest each one had (`node scratchpad/board3/digest.mjs /tmp/critic_head 400`, a read-only
   * `git archive HEAD` export). Every one of them is a Page on which J5b's `T-asn-reason` was
   * drawn; the test below proves that by taking the template back out of the registry.
   */
  const J5B_DIVERGENCE = Object.freeze({ 102: 7205490269157262 });

  test('400 seeded saves compose to the same 400 digests — the permanent pin', () => {
    assert.equal(DIGESTS.length, WIDE_N);
    for (let i = 0; i < WIDE_N; i++) {
      const got = cyrb53(JSON.stringify(composePage(structuredClone(wideSave(i)), { now: NOW })));
      assert.equal(got, DIGESTS[i], `composePage changed for corpus save ${i}`);
    }
    /* the fifty the pin used to be are still the first fifty of it, byte for byte */
    assert.equal(DIGESTS[0], 1040168339375079);
    assert.equal(DIGESTS[49], 4395787994254104);
  });

  test('composePage itself is byte-identical to pre-ticket: unregister J5b and all 400 come back', () => {
    /* The registry is a plain object read live by `allTemplates()` — no cache — so taking the one
       J5b entry out of it IS the pre-ticket registry, and `composePage` is otherwise the pre-ticket
       function. If this test ever fails, something OTHER than J5b's template has changed what the
       composer draws, which is the thing "the study layer is untouched" actually promises. */
    const entry = templates['T-asn-reason'];
    assert.ok(entry, 'J5b registered no T-asn-reason entry');
    delete templates['T-asn-reason'];
    try {
      assert.ok(!templatesForSkill('ASN-PLP').includes('T-asn-reason'), 'the registry still serves it');
      for (let i = 0; i < WIDE_N; i++) {
        const got = cyrb53(JSON.stringify(composePage(structuredClone(wideSave(i)), { now: NOW })));
        const want = Object.prototype.hasOwnProperty.call(J5B_DIVERGENCE, i) ? J5B_DIVERGENCE[i] : DIGESTS[i];
        assert.equal(got, want, `save ${i}: composePage moved for a reason that is not J5b's template`);
      }
    } finally {
      templates['T-asn-reason'] = entry;
    }
    /* …and with it registered again, the live pin is back */
    assert.equal(cyrb53(JSON.stringify(composePage(structuredClone(wideSave(102)), { now: NOW }))), DIGESTS[102]);
  });

  test('the divergence is REAL and is J5b\'s: save 102 draws T-asn-reason and nothing else moved', () => {
    const ids = Object.keys(J5B_DIVERGENCE).map(Number);
    assert.ok(ids.length > 0);
    for (const i of ids) {
      const q = composePage(structuredClone(wideSave(i)), { now: NOW }).queue;
      assert.ok(q.some(it => it.template === 'T-asn-reason'),
        `save ${i} is listed as a J5b divergence but its Page draws no T-asn-reason`);
      assert.notEqual(J5B_DIVERGENCE[i], DIGESTS[i], `save ${i} is listed as diverging and does not`);
    }
    /* one save in four hundred: the study layer really is nearly untouched, and this is the number */
    assert.ok(ids.length <= 5, `${ids.length} of ${WIDE_N} saves compose differently than pre-ticket`);
  });

  test('composePage is still reproducible for the same seed and still writes nothing to the save', () => {
    for (let i = 0; i < 12; i++) {
      const before = JSON.stringify(CORPUS[i]);
      const a = composePage(CORPUS[i], { now: NOW });
      const b = composePage(CORPUS[i], { now: NOW });
      assert.deepEqual(a, b);
      assert.equal(JSON.stringify(CORPUS[i]), before, 'composePage mutated the save');
    }
  });

  test('the three new exports sit BESIDE composePage and are never called by it', () => {
    const src = composePage.toString();
    for (const name of ['composeBundles', 'draftUnion', 'jobBudget', 'x2Marks']) {
      assert.ok(!src.includes(name), `composePage calls ${name}`);
    }
    assert.equal(typeof composeBundles, 'function');
    assert.equal(typeof draftUnion, 'function');
    assert.equal(typeof jobBudget, 'function');
  });
});

/* ================================================================= 2. jobBudget */

describe('J5 / jobBudget', () => {
  test('every shape reproduces econ.shapeTable and econ.decisionCount, and JOB-10 is the default', () => {
    for (const id of Object.keys(SHAPES)) {
      const b = jobBudget(id);
      const t = shapeTable(id);
      assert.equal(b.id, id);
      assert.equal(b.targets, SHAPES[id].targets);
      assert.equal(b.answerS, t.answerS);
      assert.equal(b.decisionS, t.decisionS);
      assert.deepEqual({ ...b.gameS }, t.gameS);
      assert.deepEqual({ ...b.wallS }, t.wallS);
      assert.deepEqual({ ...b.split }, t.split);
      assert.equal(b.lootMean, t.lootMean);
      assert.equal(b.decisions.mandatory, decisionCount(id).mandatory);
      assert.equal(b.decisions.full, decisionCount(id).full);
      let mins = 0;
      for (const [tier, n] of Object.entries(SHAPES[id].tierMix)) mins += n * LIMITS.minutesPerTier[tier];
      assert.equal(b.minutes, Math.round(mins * 10) / 10, `${id} answer minutes`);
    }
    assert.equal(jobBudget().id, 'JOB');
    assert.equal(jobBudget('nonsense').id, 'JOB');
    assert.equal(jobBudget('JOB').targets, 10);
    assert.equal(jobBudget('JOB').decisions.mandatory, 24);
    assert.equal(jobBudget('JOB').decisions.full, 35);
  });

  test('the posted/draft ladder is BOARD.draftFor and the budget is frozen', () => {
    assert.equal(jobBudget('JOB').posted, BOARD.postedMax);
    assert.equal(jobBudget('JOB').draft, BOARD.draftFor[5]);
    assert.equal(draftCountFor(5), 3);
    assert.equal(draftCountFor(4), 2);
    assert.equal(draftCountFor(3), 2);
    assert.equal(draftCountFor(2), 0);
    assert.equal(draftCountFor(1), 0);
    assert.equal(draftCountFor(0), 0);
    assert.ok(Object.isFrozen(jobBudget('JOB')));
    assert.ok(Object.isFrozen(jobBudget('JOB').tierMix));
  });
});

/* ================================================================= 3. critical coverage */

describe('J5 / G3.7 proof 7 — every legal draft contains the whole critical CORE', () => {
  test('all 10 drafts × 50 seeded saves: 100 % coverage of the core (500 cases)', () => {
    let cases = 0, boards = 0, criticalsSeen = 0, replicationChecks = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      boards++;
      criticalsSeen += b.critical.length;
      /* every critical is posted in at least `r` of the `n` contracts */
      for (const id of b.critical) {
        const inN = b.bundles.filter(x => x.locks.includes(id)).length;
        assert.ok(inN >= b.replication,
          `save ${i}: critical ${id} is in ${inN} of ${b.posted} contracts, needs ${b.replication}`);
        replicationChecks++;
      }
      for (const d of b.drafts) {
        cases++;
        const have = new Set(d.union);
        const missing = b.critical.filter(id => !have.has(id));
        assert.deepEqual(missing, [], `save ${i} draft ${d.picks.join('')} dropped a critical due`);
      }
    }
    assert.equal(boards, 50);
    assert.ok(cases >= 500, `only ${cases} draft cases`);
    assert.ok(criticalsSeen > 0, 'the corpus produced no critical dues at all');
    assert.ok(replicationChecks > 0);
  });

  test('the replication factor is the intersection bound r = max(3, n − d + 1), capped at n', () => {
    assert.equal(criticalReplicationFor(5, 3), 3);
    assert.equal(criticalReplicationFor(4, 2), 3);
    assert.equal(criticalReplicationFor(3, 2), 3);
    assert.equal(criticalReplicationFor(2, 0), 2);
    assert.equal(criticalReplicationFor(1, 0), 1);
    assert.equal(criticalReplicationFor(0, 0), 0);
    assert.equal(BOARD.criticalReplicationMin, 3);
    /* the bound itself: an r-subset and a d-subset of an n-set always meet */
    for (const n of [3, 4, 5]) {
      for (const d of [0, 2, 3]) {
        if (d > n) continue;
        const r = criticalReplicationFor(n, d);
        if (d > 0) assert.ok(r + d - n >= 1, `n=${n} d=${d} r=${r} does not force an intersection`);
      }
    }
  });

  test('critical = a due review with bucket ≤ 2, or ≥ 1 day overdue, or test-clamped — nothing else', () => {
    assert.equal(isCriticalTarget({ role: 'review', bucket: 2, overdueDays: 0 }), true);
    assert.equal(isCriticalTarget({ role: 'review', bucket: 3, overdueDays: 0 }), false);
    assert.equal(isCriticalTarget({ role: 'review', bucket: 5, overdueDays: 1 }), true);
    assert.equal(isCriticalTarget({ role: 'review', bucket: 5, overdueDays: 0.9 }), false);
    assert.equal(isCriticalTarget({ role: 'review', bucket: 5, overdueDays: 0, sweep: true }), true);
    assert.equal(isCriticalTarget({ role: 'new', bucket: 0, overdueDays: 9 }), false);
    assert.equal(isCriticalTarget({ role: 'weak', bucket: 1 }), false);
    assert.equal(isCriticalTarget({ role: 'review' }), false, 'no Leitner record → not critical');
    assert.equal(isCriticalTarget(null), false);
    assert.equal(BOARD.criticalBucketMax, 2);
    assert.equal(BOARD.criticalOverdueDays, 1);
  });

  test('criticals beyond the shape budget are named, never silently dropped: core + optional + deferred', () => {
    const queue = [];
    for (let i = 0; i < 16; i++) queue.push(review(['VOC', 'NOTE', 'PAIRS', 'FAC2'][i % 4], 1, 1, 3 + i));
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(queue) });
    /* the CORE is what the shape has room for after the draft's own choice locks (G3.7 proof 7 as
       amended): `targets − draft·choicePer`, which is 10 − 3 = 7 on a JOB-10 board. */
    assert.equal(b.choicePer, 1);
    assert.equal(b.critical.length, b.budget.targets - b.draft * b.choicePer, 'the core is targets − d·u');
    assert.ok(b.critical.length < 16, 'a 10-target job cannot hold 16 criticals');
    /* and every one of the sixteen is in exactly one of the three named parts */
    const parts = [...b.critical, ...b.criticalOptional, ...b.deferred];
    assert.equal(parts.length, 16, 'a critical went missing between the three parts');
    assert.equal(new Set(parts).size, 16, 'a critical is named in two parts at once');
    assert.deepEqual(new Set(parts), new Set(queue.map(it => it.id)));
    /* the optional ones are POSTED (one contract each), so they are on the board, not deferred */
    assert.equal(b.criticalOptional.length, b.posted * b.choicePer);
    for (const id of b.criticalOptional) {
      assert.equal(b.bundles.filter(x => x.locks.includes(id)).length, 1,
        `${id} is a choice lock and must be posted in exactly one contract`);
    }
    for (const id of b.deferred) {
      assert.equal(b.bundles.filter(x => x.locks.includes(id)).length, 0, `${id} is deferred, not posted`);
    }
  });

  /**
   * THE TWO-PART CLAIM, measured on the COMPOSED PAGE rather than on the board's own capped list —
   * which is the hole the round-1 critic found: iterating `b.critical` cannot see a critical the cap
   * removed, so the old test could not have failed however many dues the board dropped.
   */
  test('every critical ON THE COMPOSED PAGE is core (in every draft), optional (posted), or deferred', () => {
    let boards = 0, core = 0, optional = 0, deferred = 0, worstDeferred = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      boards++;
      /* recomputed from `b.page.queue`, the composer's own output — NOT from `b.critical` */
      const onPage = b.page.queue
        .map((it, k) => jobTargetOf(it, CORPUS[i], { now: NOW, order: k }))
        .filter(t => t.critical)
        .map(t => t.id);
      const parts = [...b.critical, ...b.criticalOptional, ...b.deferred];
      assert.equal(new Set(parts).size, parts.length, `save ${i}: a critical is named twice`);
      assert.deepEqual(new Set(parts), new Set(onPage),
        `save ${i}: the three parts are not the Page's criticals`);
      /* part 1 — the core is in EVERY legal draft */
      for (const d of b.drafts) {
        const have = new Set(d.union);
        assert.deepEqual(b.critical.filter(id => !have.has(id)), [],
          `save ${i} draft ${d.picks.join('')} dropped a CORE critical`);
      }
      /* part 2 — every critical the core did not take is either a posted choice lock or deferred */
      const posted = new Set(b.bundles.flatMap(x => x.locks));
      for (const id of b.criticalOptional) assert.ok(posted.has(id), `save ${i}: optional ${id} is not posted`);
      for (const id of b.deferred) {
        assert.ok(!posted.has(id), `save ${i}: ${id} is named deferred but posted`);
        assert.ok(b.page.queue.some(it => it.id === id), `save ${i}: ${id} was deferred off the Page`);
      }
      core += b.critical.length; optional += b.criticalOptional.length; deferred += b.deferred.length;
      worstDeferred = Math.max(worstDeferred, b.deferred.length);
      /* the shape is the only reason a critical is not core: a job of `targets` locks cannot hold more */
      if (b.deferred.length) {
        assert.equal(b.critical.length, Math.max(0, b.budget.targets - b.draft * b.choicePer),
          `save ${i}: dues were deferred on a board whose core was not full`);
      }
    }
    assert.equal(boards, 50);
    assert.ok(core > 0 && deferred > 0, `the corpus produced core ${core} / deferred ${deferred}`);
    assert.ok(optional > 0, 'the corpus never posted a critical as a choice lock');
  });
});

/* ================================================================= 4. draftUnion dedupes */

describe('J5 / draftUnion dedupes and the printed net is the post-dedupe value', () => {
  test('Σ targets(drafted) == |union|, no card twice, on all 10 drafts × 50 saves', () => {
    let n = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const d of b.drafts) {
        n++;
        const ids = d.queue.map(it => it.id);
        assert.equal(ids.length, new Set(ids).size, `save ${i} ${d.picks.join('')}: a card twice in one job`);
        const union = new Set();
        for (const p of d.picks) for (const id of b.bundles.find(x => x.id === p).locks) union.add(id);
        assert.equal(ids.length, union.size,
          `save ${i} ${d.picks.join('')}: ${ids.length} targets against a union of ${union.size}`);
        assert.deepEqual(new Set(ids), union, 'the drafted queue is not the union of the drafted contracts');
      }
    }
    assert.ok(n >= 500, `only ${n} cases`);
  });

  test('the board\'s printed NET posted equals the post-dedupe value for all C(5,3) = 10 drafts', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const d of b.drafts) {
        const gross = d.picks.reduce((s, p) => s + b.bundles.find(x => x.id === p).posted, 0);
        const byId = new Map();
        for (const t of b.pool) byId.set(t.id, t.posted);
        const net = [...new Set(d.union)].reduce((s, id) => s + byId.get(id), 0);
        assert.equal(d.postedGross, gross, `save ${i} ${d.picks.join('')} gross`);
        assert.equal(d.postedNet, net, `save ${i} ${d.picks.join('')} net`);
        assert.equal(d.shared, gross - net, `save ${i} ${d.picks.join('')} shared`);
        assert.ok(d.shared >= 0, 'shared went negative');
        if (d.shared > 0) assert.equal(d.line, `posted ${gross} (−${gross - net} shared)`);
        else assert.equal(d.line, `posted ${net}`);
      }
    }
  });

  test('a replicated critical carries every contract that posted it as its source list', () => {
    const b = boardFor(0);
    const d = b.recommend;
    for (const it of d.queue) {
      assert.ok(JOB_BUNDLE_IDS.includes(it.from), 'every envelope carries a source contract');
      assert.ok(it.sources.includes(it.from));
      const posted = d.picks.filter(p => b.bundles.find(x => x.id === p).locks.includes(it.id));
      assert.deepEqual(it.sources.slice().sort(), posted.slice().sort(),
        `${it.id}: sources do not match the contracts that posted it`);
    }
  });

  test('picks may be ids or indices, duplicates collapse, and an unknown pick is ignored', () => {
    const b = boardFor(1);
    const byId = draftUnion(b.bundles, ['A', 'B']);
    const byIx = draftUnion(b.bundles, [0, 1]);
    assert.deepEqual(byId.union, byIx.union);
    assert.deepEqual(draftUnion(b.bundles, ['A', 'A', 'B']).picks, ['A', 'B']);
    assert.deepEqual(draftUnion(b.bundles, ['A', 'ZZ']).picks, ['A']);
    assert.deepEqual(draftUnion(b.bundles, []).queue, []);
    assert.deepEqual(draftUnion([], ['A']).queue, []);
  });
});

/* ================================================================= 5. the interleave */

describe('J5 / the drafted queue keeps LIMITS.sameSkillRun and the 1→4 tier ramp', () => {
  test('sameSkillRun ≤ 2 on every legal draft of every corpus save', () => {
    let worst = 0, cases = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const d of b.drafts) {
        cases++;
        const run = worstRun(d.queue);
        worst = Math.max(worst, run);
        assert.ok(run <= LIMITS.sameSkillRun,
          `save ${i} ${d.picks.join('')}: a run of ${run} ${d.queue.map(x => x.skill).join(',')}`);
        assert.equal(d.sameSkillRun, run, 'the reported run disagrees with the queue');
      }
    }
    assert.equal(worst <= LIMITS.sameSkillRun, true);
    assert.ok(cases >= 500, `only ${cases} cases`);
  });

  test('the tier ramp is monotone 1→4 on every draft where a monotone run-safe order EXISTS', () => {
    let mono = 0, total = 0, impossible = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const d of b.drafts) {
        total++;
        const can = existsMonotone(d.queue);
        if (!can) { impossible++; continue; }
        assert.ok(isMonotone(d.queue),
          `save ${i} ${d.picks.join('')}: tiers ${d.queue.map(x => x.tier).join('')} are not monotone, but a monotone run-safe order exists`);
        assert.equal(d.monotone, true);
        mono++;
      }
    }
    assert.ok(total >= 500);
    assert.ok(mono > 0);
    /* the cases where monotone is IMPOSSIBLE are the run cap winning, which is COMPOSED's rule
       (G10 #19) — never more than a small minority of the corpus */
    assert.ok(impossible / total < 0.5, `monotone was impossible in ${impossible}/${total} drafts`);
  });

  test('BOTH order laws hold on 400 saves × EVERY shape — the RUN break round 3 found at save 69', () => {
    /**
     * `arrangeJob`'s greedy pass is myopic: its feasibility filter asks only whether the rest stays
     * arrangeable under the run cap, never whether taking a higher-tier lock now forfeits
     * monotonicity. Save 211's draft ACD came out `… VOC/1 NOTE/2 VOC/1 …` — a tier-2 at index 3
     * followed by a tier-1 at index 4 — while `VOC VOC NOTE VOC` then the T2 band was available all
     * along. `page.js arrangeBands` is the second pass that closes it; this is the width that catches
     * the next one.
     *
     * ROUND 3 — THE SHAPE IS PART OF THE WIDTH. This loop used to call `postBoard(save, day, {now})`
     * with no shape, and `shapeFor` then never returns RUN (it needs `opts.short` or
     * `opts.minutes <= 8`) and never returns JOB12 on this corpus: the shapes actually exercised were
     * `[["VAULT",44],["JOB",356]]`. Two of the four were unasserted — and RUN, the shape the school
     * window posts every weekday (`plan.js` → `shapeOpts:{shape:'RUN'}` → `screens/job.js postBoard`),
     * was one of them. On corpus save 69 a RUN drafted `VOC VOC PAIRS VOC VOC VOC`: a run of 3, and
     * NOT the arranger's fault — 5 locks of one make in a 6-target job admits no order under the cap
     * at all. `page.js runCapFor` is the composition rule that closes it (one board of 1600 moved).
     * So the assertion is now three: the run cap holds, the ramp holds wherever an order exists, AND
     * the posted board is never a queue that no arranger could have ordered.
     */
    let cases = 0, mono = 0, impossible = 0, boards = 0, worstSlack = Infinity;
    const shapesSeen = new Map();
    for (const shape of Object.keys(SHAPES)) {
      for (let i = 0; i < WIDE_N; i++) {
        const save = wideSave(i);
        const b = postBoard(save, '2026-09-16', { now: NOW, shape });
        boards++;
        shapesSeen.set(b.shape, (shapesSeen.get(b.shape) ?? 0) + 1);
        for (const d of b.drafts) {
          cases++;
          const run = worstRun(d.queue);
          assert.ok(run <= LIMITS.sameSkillRun,
            `${shape} save ${i} ${d.picks.join('')}: a run of ${run} — ${d.queue.map(x => x.skill).join(',')}`);
          /* the COMPOSITION, not the order: no make may own more of the drafted queue than the run
             cap can spread, or the board has posted a job with no legal order in it */
          const counts = new Map();
          for (const it of d.queue) counts.set(it.skill, (counts.get(it.skill) ?? 0) + 1);
          const top = Math.max(0, ...counts.values());
          worstSlack = Math.min(worstSlack, runCapFor(d.queue.length) - top);
          assert.ok(top <= runCapFor(d.queue.length),
            `${shape} save ${i} ${d.picks.join('')}: ${top} locks of one make in ${d.queue.length} targets — no order under the cap exists`);
          if (!existsMonotone(d.queue)) { impossible++; continue; }
          assert.ok(isMonotone(d.queue),
            `${shape} save ${i} ${d.picks.join('')}: tiers ${d.queue.map(x => x.tier).join('')} are not monotone, but a monotone run-safe order exists`);
          assert.equal(d.monotone, true, `${shape} save ${i} ${d.picks.join('')}: the draft reports the wrong ramp`);
          mono++;
        }
      }
    }
    assert.equal(boards, WIDE_N * Object.keys(SHAPES).length);
    /* every shape really was posted — the hole this test had for three rounds */
    assert.deepEqual([...shapesSeen.keys()].sort(), Object.keys(SHAPES).slice().sort(),
      `the loop only posted ${JSON.stringify([...shapesSeen])}`);
    for (const [id, n] of shapesSeen) assert.equal(n, WIDE_N, `${id} was posted ${n} times, not ${WIDE_N}`);
    assert.ok(cases >= 15000, `only ${cases} draft cases`);
    assert.ok(mono > 12000, `only ${mono} drafts could be monotone`);
    assert.ok(impossible / cases < 0.5, `monotone was impossible in ${impossible}/${cases} drafts`);
    /* the cap is not vacuous: some draft really does come within a lock of it */
    assert.ok(worstSlack <= 1, `the closest any draft came to the run cap was ${worstSlack} locks — the rule never binds`);
  });

  test('the RUN the school window posts is the shape that broke: save 69, driven through plan.js\'s own call', () => {
    /* The exact public path: `plan.js` hands the job screen `shape:'RUN', shapeOpts:{shape:'RUN'}`
       and `screens/job.js` spreads that into `postBoard`. Before round 3 this board drafted
       `VOC VOC PAIRS VOC VOC VOC` on draft ADE — `d.sameSkillRun = 3` against `LIMITS.sameSkillRun`,
       and `dropped = 1` showing `draftUnion` had correctly refused to let `spreadSkills` drop the
       overflow (Global rule 5). It is the whole reason `runCapFor` exists. */
    const b = postBoard(wideSave(69), '2026-09-16', { now: NOW, shape: 'RUN', shapeOpts: { shape: 'RUN' } });
    assert.equal(b.shape, 'RUN');
    for (const d of b.drafts) {
      /* the shape's own count, ±1 — the wing-purity repair may add one cross-wing lock (G3.4) */
      assert.ok(Math.abs(d.queue.length - SHAPES.RUN.targets) <= 1, `${d.picks.join('')}: ${d.queue.length} targets`);
      assert.ok(worstRun(d.queue) <= LIMITS.sameSkillRun,
        `${d.picks.join('')}: ${d.queue.map(x => x.skill).join(' ')}`);
      assert.deepEqual(d.dropped, [], `${d.picks.join('')}: spreadSkills dropped a target`);
    }
    /* and the cap is the exact feasibility bound, not a round number: 4 of 6, 5 of 7, 7 of 10, 8 of 12 */
    assert.deepEqual([6, 7, 10, 12].map(n => runCapFor(n)), [4, 5, 7, 8]);
    assert.equal(runCapFor(SHAPES.RUN.targets), 4);
  });

  test('a hard lock is never first and a Rematch is never item 1 (composePage\'s own two laws)', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const d of b.drafts) {
        if (!d.queue.length) continue;
        assert.ok(d.queue[0].tier < 4, `save ${i} ${d.picks.join('')}: tier-4 lock first`);
        assert.ok(!d.queue[0].isRematch, `save ${i} ${d.picks.join('')}: a Rematch is item 1`);
      }
    }
  });

  test('the union is re-run through the composer\'s OWN spreadSkills and it drops nothing', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const d of b.drafts) {
        assert.deepEqual(d.dropped, [], `save ${i} ${d.picks.join('')}: spreadSkills dropped a target`);
        const again = spreadSkills(d.queue);
        assert.equal(again.dropped.length, 0);
        assert.deepEqual(again.queue.map(x => x.id), d.queue.map(x => x.id),
          'spreadSkills would still move the drafted queue — it is not a fixed point');
      }
    }
  });

  test('contracts do NOT survive as consecutive blocks (G10 #19)', () => {
    let blocky = 0, checked = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const d of b.drafts) {
        if (d.picks.length < 2 || d.queue.length < 4 || d.skills.length < 2) continue;
        checked++;
        /* the naive layout — contract A's locks, then D's, then E's — is never what is served
           whenever that layout would itself break the same-skill rule the composer keeps */
        const blocks = [];
        const seen = new Set();
        for (const p of d.picks) {
          for (const id of b.bundles.find(x => x.id === p).locks) {
            if (seen.has(id)) continue;
            seen.add(id);
            blocks.push(d.queue.find(x => x.id === id));
          }
        }
        if (worstRun(blocks) > LIMITS.sameSkillRun) {
          assert.notDeepEqual(d.queue.map(x => x.id), blocks.map(x => x.id),
            `save ${i} ${d.picks.join('')}: the job is the contracts concatenated`);
          blocky++;
        }
      }
    }
    assert.ok(checked > 100, `only ${checked} multi-contract drafts`);
    assert.ok(blocky > 0, 'the corpus never produced a block layout that would break the run rule');
  });

  test('the ramp yields to the run cap, never the other way round (a worked 4-of-one-make union)', () => {
    const queue = [item('VOC', 1), item('VOC', 1), item('VOC', 1), item('VOC', 1),
      item('PAIRS', 2), item('FAC2', 2), item('SYS', 3)];
    const d = draftUnion([{ id: 'A', posted: 0, targets: queue.map((it, i) => jobTargetOf(it, fresh(NOW), { now: NOW, order: i })), locks: idsOf(queue) }], ['A']);
    assert.equal(worstRun(d.queue), LIMITS.sameSkillRun, 'the run cap held');
    assert.equal(existsMonotone(d.queue), false, 'a monotone run-safe order does not exist here');
    assert.equal(d.monotone, false, 'and the result honestly says the ramp broke');
    assert.equal(d.queue.length, 7);
  });
});

/* ================================================================= 6. wings */

describe('J5 / G3.4 — the board spans ≥ 3 wings and every legal 3-of-5 draft spans ≥ 2', () => {
  /**
   * MEASURED FROM THE COMPOSED PAGE, not from the board's own pool. Round 1: `available` was read off
   * `b.pool` — the board's OWN selection — so `spanned >= min(3, available)` was near-circular and
   * could not see the board collapsing a four-wing Page to one wing. It was collapsing: 7 of the 50
   * shipped saves spanned fewer wings than the Page carried, and on save 29 a four-wing Page posted a
   * one-wing board, where `guardDist` prints a 1.00 bar on RECALL — against G3.4's "the 0.75 cap
   * guarantees the guard is never a certainty", and against page.js's own step-5 note that a one-wing
   * board collapses the guard's fixed point. `composeBundles` now reserves the choice locks wing-first
   * (page.js `choiceLocks`), and the assertion below is what proves it.
   */
  test('the posted contracts span ≥ 3 wings whenever the COMPOSED PAGE carries 3', () => {
    let full = 0, wide = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      const onPage = new Set(b.page.queue.map(it => WING_OF_SKILL[it.skill]).filter(Boolean));
      const inPool = new Set(b.pool.map(t => t.wing).filter(Boolean));
      const spanned = new Set(b.bundles.flatMap(x => x.wings)).size;
      for (const w of inPool) assert.ok(onPage.has(w), `save ${i}: ${w} is in the pool but not on the Page`);
      assert.ok(spanned >= Math.min(3, onPage.size),
        `save ${i}: the board spans ${spanned} wings with ${onPage.size} on the composed Page`);
      assert.deepEqual(new Set(b.wings), new Set(b.bundles.flatMap(x => x.wings)));
      if (onPage.size >= 3) { assert.ok(spanned >= 3); full++; }
      if (onPage.size > inPool.size) wide++;
      for (const w of b.wings) assert.ok(WING_IDS.includes(w), `${w} is not a wing`);
    }
    assert.ok(full >= 25, `only ${full} of 50 saves had 3 wings on the Page`);
  });

  test('a four-wing Page whose coldest dues are all one wing still posts three wings (save 29)', () => {
    /* the exact board round 1 measured: `pageWings RECALL+ALGEBRA+WORDS+FIGURES`, `boardWings RECALL`,
       `guardSupportN 1`, a 1.00 guard bar and every draft one-winged. */
    const b = boardFor(29);
    const onPage = new Set(b.page.queue.map(it => WING_OF_SKILL[it.skill]).filter(Boolean));
    assert.ok(onPage.size >= 3, `save 29 now carries only ${onPage.size} wings on the Page`);
    assert.ok(b.wings.length >= 3, `save 29 posts ${b.wings.join('+')}`);
    assert.ok(b.guard.n >= 3, `the guard's support is ${b.guard.n} wings`);
    for (const bar of b.guardBars) {
      assert.ok(bar.p < 1, `the guard is a certainty on ${bar.wing} (p = ${bar.p})`);
      assert.ok(bar.p <= 0.75 + 1e-9, `the 0.75 cap is broken on ${bar.wing} (p = ${bar.p})`);
    }
    for (const d of b.drafts) assert.ok(d.wings.length >= 2, `draft ${d.picks.join('')} is ${d.wings.length}-winged`);
  });

  test('every legal draft spans ≥ 2 wings whenever the board carries 2', () => {
    let cases = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      const available = new Set(b.bundles.flatMap(x => x.wings)).size;
      for (const d of b.drafts) {
        cases++;
        assert.ok(d.wings.length >= Math.min(2, available),
          `save ${i} ${d.picks.join('')}: a ${d.wings.length}-wing draft on a ${available}-wing board`);
      }
    }
    assert.ok(cases >= 500);
  });

  test('a one-wing draft is impossible because no wing owns `draft` pure contracts', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      if (b.draft <= 0) continue;
      const pure = new Map();
      for (const x of b.bundles) if (x.wings.length === 1) pure.set(x.wings[0], (pure.get(x.wings[0]) ?? 0) + 1);
      const available = new Set(b.bundles.flatMap(x => x.wings)).size;
      if (available < 2) continue;
      for (const [w, n] of pure) {
        assert.ok(n < b.draft, `save ${i}: ${n} contracts are pure ${w} and a draft takes ${b.draft}`);
      }
    }
  });

  test('every bundle\'s label is a make it holds, and overflow counts from THAT make', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      for (const x of boardFor(i).bundles) {
        const counts = new Map();
        for (const t of x.targets) counts.set(t.skill, (counts.get(t.skill) ?? 0) + 1);
        const held = counts.get(x.label);
        assert.ok(held > 0, `save ${i} contract ${x.id}: ${x.label} is not a make this contract holds`);
        assert.equal(x.overflow, x.targets.length - held, `save ${i} contract ${x.id}: overflow`);
        assert.equal(x.wing, wingOf(x.label) ?? x.wings[0] ?? null);
        assert.equal(x.posted, x.targets.reduce((s, t) => s + t.posted, 0));
        assert.deepEqual(x.locks, x.targets.map(t => t.id));
        assert.equal(x.locks.length, new Set(x.locks).size, 'a contract posted a lock twice');
        assert.ok(x.grade <= x.gradeHi);
        assert.equal(x.gradeLabel, x.grade === x.gradeHi ? `grade ${x.grade}` : `grade ${x.grade}–${x.gradeHi}`);
      }
    }
  });

  /**
   * ROUND 2, player-feel: "the draft and the press are both no-ops on a recall-heavy board." The
   * evidence was five rows that read the same word five times —
   *
   *     1 A ASN-ANG +2 · 5 locks · RECALL     4 D ASN-ANG +2 · 5 locks · RECALL
   *     2 B ASN-ANG +3 · 6 locks · RECALL     5 E ASN-ANG +2 · 5 locks · RECALL
   *     3 C ASN-ANG +3 · 6 locks · RECALL
   *
   * on a save whose whole due list is one sheet. The locks underneath differed and spanned three
   * wings; the NAMES did not, and the name is the only part of a contract a student reads before
   * pressing DRAFT. `page.js finishBundle` now names a contract after the highest-count make no
   * earlier contract took, so the five rows are five rows.
   */
  test('THE DRAFT IS LEGIBLE: no two posted contracts carry the same name, on any corpus board', () => {
    let boards = 0;
    for (let i = 0; i < WIDE_N; i++) {
      const b = postBoard(wideSave(i), '2026-09-16', { now: NOW });
      if (b.bundles.length < 2) continue;
      boards++;
      const labels = b.bundles.map(x => x.label);
      const distinct = new Set(labels).size;
      /* a contract can only be named after a make it holds, so the ceiling is the makes on the board */
      const makesOnBoard = new Set(b.bundles.flatMap(x => x.targets.map(t => t.skill))).size;
      assert.equal(distinct, Math.min(labels.length, makesOnBoard),
        `save ${i}: ${labels.length} contracts, ${makesOnBoard} makes posted, ${distinct} distinct names — ${labels.join(' ')}`);
    }
    assert.ok(boards > 300, `only ${boards} boards had more than one contract`);
  });

  test('a one-sheet save still gets five different contracts, and the board says it is one make', () => {
    /* the fixture the critic drove: a due list that is nothing but one ASN sheet */
    const queue = Array.from({ length: 14 }, (_, k) => item('ASN-ANG', 1 + (k % 2)));
    const b = postBoard(fresh(NOW), '2026-09-16', { now: NOW, pageOverride: fakePage(queue) });
    assert.equal(b.bundles.length, 5);
    /* every lock really is one make, so the board may not pretend otherwise — it says so instead */
    assert.equal(new Set(b.bundles.flatMap(x => x.targets.map(t => t.skill))).size, 1);
    assert.equal(b.oneMake, true);
    assert.match(b.oneMakeLine, /^one make tonight · ASN-ANG · /);
    assert.equal(b.wingsPosted, 1);
    assert.equal(b.wingsShort, true);
    assert.equal(b.guardSupport, 'guard: 1 wing on the board');
    /* …and the 3-token press is recommended at ZERO, because the one wing is certain to be guarded */
    assert.equal(b.pressMatters, false);
    assert.equal(Object.values(b.press.tokens).reduce((s, n) => s + n, 0), 0);
    assert.match(b.pressLine, /^one wing tonight · RECALL · no press/);
  });

  test('…and on a board that spans its wings the press is still a real 3-token allocation', () => {
    let matters = 0;
    let total = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      if (b.wingsPosted < 2) continue;
      total++;
      if (b.pressMatters) {
        matters++;
        assert.equal(Object.values(b.press.tokens).reduce((s, n) => s + n, 0), 3, `save ${i}`);
        assert.equal(b.pressLine, null, `save ${i}`);
      }
    }
    assert.ok(total >= 40, `only ${total} of the fifty boards span 2+ wings`);
    assert.ok(matters / total > 0.8, `the press mattered on only ${matters} of ${total} multi-wing boards`);
  });
});

/* ================================================================= 6b. one board, composed once */

/**
 * ROUND 2, player-feel BLOCKER: "the board on Home is not the board you get when you tap it."
 * `screens/home.js:417` posted the board with `{...plan.composeOpts(save), page: act.page}` and
 * `screens/job.js:243` with `{now, seed, tellFor}` — the same save, the same day, the same pinned
 * seed `job|…|0`, and two different queues, because `postBoard` composed with whatever its caller
 * handed it. `postBoard` now takes NO composition options from anybody: it asks the plan itself.
 */
describe('J5 / Global law 4 — the board is a projection of the SAVE, not of its caller', () => {
  const row = (c) => `${c.id}:${c.label}:${c.wing}:${c.locks.length}:${c.posted}:${c.gradeLabel}`;
  const sheet = (b) => b.contracts.map(row).join(' | ');

  test('Home\'s call and the job screen\'s call post the byte-identical board, on every corpus save', () => {
    let lowered = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const save = CORPUS[i];
      const compose = composeOpts(save);
      if (compose.tier4 !== 2 || compose.microFlashOnly) lowered++;
      /* exactly what screens/home.js:417 passes: the plan's compose opts (minus q, as Home holds
         it), a pre-composed page, and a tell hook */
      const { q, ...pageOpts } = compose;
      const home = postBoard(save, '2026-09-16', {
        ...pageOpts, now: NOW, page: composePage(save, { ...compose, now: NOW, today: '2026-09-16' }),
        tellFor: () => null,
      });
      /* exactly what screens/job.js:243 passes */
      const job = postBoard(save, '2026-09-16', { now: NOW, tellFor: () => null });
      assert.equal(home.seed, job.seed, `save ${i}: the seeds differ`);
      assert.equal(sheet(home), sheet(job), `save ${i}:\n  HOME ${sheet(home)}\n  JOB  ${sheet(job)}`);
      assert.deepEqual(home.recommend.picks, job.recommend.picks, `save ${i}: different recommendation`);
      assert.equal(home.posted, job.posted);
      assert.equal(home.split, job.split);
    }
    /* the corpus really does contain saves where the plan lowers — otherwise this proves nothing */
    assert.ok(lowered >= 5, `only ${lowered} of the fifty corpus saves have the plan lowering`);
  });

  test('the board honours the plan\'s LOWERING, which is what Home prints above it', () => {
    /* Home prints "13 new a day is more than a day holds — the target is 12" and then a board; the
       board it prints has to be the board that sentence describes. `plan.composeOpts` is the only
       place that answer lives, and `postBoard` now reads it rather than being told. */
    const lowering = [];
    for (let i = 0; i < CORPUS.length && lowering.length < 3; i++) {
      const c = composeOpts(CORPUS[i]);
      if (c.tier4 !== 2 || c.microFlashOnly) lowering.push(i);
    }
    assert.ok(lowering.length, 'no corpus save has the plan lowering');
    for (const i of lowering) {
      const save = CORPUS[i];
      const planned = postBoard(save, '2026-09-16', { now: NOW });
      const unlowered = composeBundles(save, {
        now: NOW, today: '2026-09-16', shape: planned.shape, seed: planned.seed, jobIndex: planned.jobIndex,
      });
      /* what the board composed IS the plan's page, not the S1-default one composePage falls back to */
      const planPage = composePage(save, { ...composeOpts(save), now: NOW, today: '2026-09-16' });
      assert.deepEqual(planned.page.queue.map(it => it.id), planPage.queue.map(it => it.id),
        `save ${i}: the board did not compose the plan's page`);
      assert.ok(unlowered.page.queue.length >= 0);            // the comparison page exists; it may coincide
    }
  });
});

/* ================================================================= 6c. the flow shape */

/**
 * ROUND 2, board-schedule: G4 claimed "the two brief windows land after targets 4 and 8, which is
 * where the composer's role transitions land (reviews → new → weak), so the game's beats and the
 * study structure's beats coincide". They do not. `draftUnion` re-sorts the drafted union by TIER
 * (`arrangeJob`) — which is the ramp the sentence before it is about — so the composer's role
 * blocks do not survive into the job at all. This test is what stops the claim coming back.
 */
describe('J5 / G4 — the interleave sorts by TIER, so the role blocks do not survive it', () => {
  const ROLE_RANK = { review: 0, rematch: 0, new: 1, weak: 2, floor: 2 };
  const rankOfItem = (t) => ROLE_RANK[t.item?.role ?? t.role] ?? 0;

  test('the brief windows do NOT coincide with a role transition, measured over 400 boards', () => {
    let drafts = 0, both = 0, neither = 0, blocked = 0, reviewAfterNew = 0;
    for (let i = 0; i < WIDE_N; i++) {
      const b = postBoard(wideSave(i), '2026-09-16', { now: NOW });
      for (const picks of legalDrafts(b.posted, b.draft)) {
        const q = draftFrom(b.bundles, picks, { x2: b.x2.marks }).queue;
        if (q.length < 9) continue;                       // both windows have to be reachable
        drafts++;
        const r = q.map(rankOfItem);
        const a = r[3] < r[4];
        const c = r[7] < r[8];
        if (a && c) both++;
        if (!a && !c) neither++;
        if (r.every((x, k) => k === 0 || x >= r[k - 1])) blocked++;
        const isReview = (t) => (t.item?.isReview ?? t.isReview) || (t.item?.role ?? t.role) === 'rematch';
        const isNew = (t) => (t.item?.role ?? t.role) === 'new';
        const lastReview = q.reduce((m, t, k) => (isReview(t) ? k : m), -1);
        const firstNew = q.findIndex(isNew);
        if (lastReview >= 0 && firstNew >= 0 && lastReview > firstNew) reviewAfterNew++;
      }
    }
    assert.ok(drafts > 3000, `only ${drafts} drafts were long enough to reach both windows`);
    /* the claim G4 used to make would need `both` near 1 and `blocked` near 1. Measured: .076 / .180 */
    assert.ok(both / drafts < 0.25,
      `a role transition sits at BOTH brief boundaries in ${(100 * both / drafts).toFixed(1)} % of drafts — `
      + 'if this is now true by construction, say so in G4 and tighten this test');
    assert.ok(neither / drafts > 0.25,
      `only ${(100 * neither / drafts).toFixed(1)} % of drafts have a role transition at NEITHER boundary`);
    assert.ok(blocked / drafts < 0.35,
      `the roles are in blocked reviews → new → weak order in ${(100 * blocked / drafts).toFixed(1)} % of drafts`);
    assert.ok(reviewAfterNew / drafts > 0.5,
      `a review follows a new card in only ${(100 * reviewAfterNew / drafts).toFixed(1)} % of drafts`);
  });

  test('…and what IS true is the ramp and the fixed window indices', () => {
    assert.deepEqual([...BOARD.briefAfterTargets], [4, 8], 'the windows are fixed indices');
    /* The ramp is what the interleave sorts ON — `job-monotone.test.mjs` owns the exact statement
       (monotone whenever the run cap leaves an order that is). What this asserts is the shape G4
       claims: the job gets cheaper-first, every draft, by a clear margin. */
    let drafts = 0;
    let rising = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      for (const picks of legalDrafts(b.posted, b.draft)) {
        const q = draftFrom(b.bundles, picks, { x2: b.x2.marks }).queue;
        if (q.length < 4) continue;
        drafts++;
        const half = Math.floor(q.length / 2);
        const mean = (xs) => xs.reduce((a, t) => a + t.tier, 0) / xs.length;
        if (mean(q.slice(0, half)) <= mean(q.slice(half))) rising++;
      }
    }
    assert.ok(drafts > 200, `only ${drafts} drafts`);
    assert.equal(rising, drafts, `${drafts - rising} of ${drafts} drafts do not get harder as they go`);
  });
});

/* ================================================================= 7. thin boards */

describe('J5 / G4 — a thin queue posts min(5, available) contracts and narrows the draft', () => {
  test('postedCountFor walks 0 → 5 as the queue grows, two locks to a contract', () => {
    assert.equal(postedCountFor(0), 0);
    assert.equal(postedCountFor(1), 1);
    assert.equal(postedCountFor(2), 1);
    assert.equal(postedCountFor(3), 1);
    assert.equal(postedCountFor(4), 2);
    assert.equal(postedCountFor(6), 3);
    assert.equal(postedCountFor(8), 4);
    assert.equal(postedCountFor(10), 5);
    assert.equal(postedCountFor(40), 5);
    assert.equal(JOB_MIN_LOCKS, 2);
    // and the value has ONE home: `data/job.js` (notes/J5.md §7, moved at integration)
    assert.equal(JOB_MIN_LOCKS, BOARD.minLocks, 'js/page.js must re-export data/job.js BOARD.minLocks, not declare its own');
    for (let n = 0; n <= 40; n++) assert.ok(postedCountFor(n) <= BOARD.postedMax);
  });

  test('synthetic queues of 1…12 locks post min(5, available) and narrow the draft to 3 / 2 / 0', () => {
    const rows = [];
    for (let n = 1; n <= 12; n++) {
      const queue = Array.from({ length: n }, (_, k) => item(['VOC', 'PAIRS', 'FAC2', 'CS-LIN'][k % 4], 1 + (k % 2)));
      const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(queue) });
      assert.equal(b.bundles.length, b.posted);
      assert.equal(b.posted, postedCountFor(n), `queue ${n}`);
      assert.equal(b.draft, BOARD.draftFor[b.posted] ?? 0, `queue ${n} draft`);
      assert.equal(b.thin, b.posted < BOARD.postedMax);
      rows.push([n, b.posted, b.draft]);
      /* nothing is invented: every posted lock came out of the composed queue */
      const src = new Set(queue.map(it => it.id));
      for (const x of b.bundles) for (const id of x.locks) assert.ok(src.has(id), 'a lock the composer never composed');
    }
    assert.deepEqual(rows, [
      [1, 1, 0], [2, 1, 0], [3, 1, 0], [4, 2, 0], [5, 2, 0], [6, 3, 2],
      [7, 3, 2], [8, 4, 2], [9, 4, 2], [10, 5, 3], [11, 5, 3], [12, 5, 3],
    ]);
  });

  test('with ≤ 2 contracts there is no draft and the whole board is the job', () => {
    const queue = Array.from({ length: 4 }, (_, k) => item(['VOC', 'PAIRS'][k % 2], 1));
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(queue) });
    assert.equal(b.posted, 2);
    assert.equal(b.draft, 0);
    const drafts = legalDrafts(b.posted, b.draft);
    assert.deepEqual(drafts, [['A', 'B']]);
    const d = draftFrom(b.bundles, drafts[0]);
    assert.equal(new Set(d.union).size, 4, 'a no-draft board still serves every composed lock');
  });

  test('the board prints the thin line and the per-wing supply', () => {
    const queue = Array.from({ length: 6 }, (_, k) => item(['VOC', 'PAIRS'][k % 2], 1));
    const save = fresh(NOW);
    const b = postBoard(save, '2026-09-16', { now: NOW, pageOverride: fakePage(queue) });
    assert.equal(b.thin, true);
    assert.match(b.thinLine, /^thin board · 3 contracts · draft 2 · /);
    assert.equal(b.supplyLines.length, WING_IDS.length);
    for (const w of WING_IDS) assert.ok(b.supplyLines.some(l => l.startsWith(`${w} `)), `${w} supply line`);
    for (const l of b.supplyLines) assert.match(l, /^[A-Z]+ \d+ locks available today$/);
  });

  test('an empty queue posts no contracts and does not throw', () => {
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage([]) });
    assert.equal(b.posted, 0);
    assert.deepEqual(b.bundles, []);
    assert.deepEqual(b.critical, []);
    assert.deepEqual(draftUnion(b.bundles, []).queue, []);
  });

  test('a thin queue is served WHOLE rather than two thirds of it: every lock is core', () => {
    const queue = Array.from({ length: 10 }, (_, k) => item(['VOC', 'PAIRS', 'FAC2', 'CS-LIN', 'NOTE'][k % 5], 1 + (k % 3)));
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(queue) });
    assert.equal(b.posted, 5);
    assert.equal(b.draft, 3);
    /* a queue too thin to feed `core + n` posts no choice locks at all: everything is core, so every
       lock is replicated into `r` of the 5 and every draft serves the whole composed queue */
    assert.equal(b.choicePer, 0, 'a 10-lock queue cannot afford a choice lock per contract');
    assert.equal(b.core.length, 10);
    assert.deepEqual(b.choice, []);
    for (const p of legalDrafts(5, 3)) {
      const d = draftFrom(b.bundles, p);
      assert.equal(d.queue.length, 10, `draft ${p.join('')} served ${d.queue.length} of 10 composed locks`);
    }
    /* …and the arithmetic of the cheapest replication is the coverage formula */
    assert.equal(coverageOf(5, 3, 1), 0.6);
    assert.equal(coverageOf(5, 3, 2), 0.9);
    assert.equal(coverageOf(5, 3, 3), 1);
    assert.equal(coverageOf(4, 2, 3), 1);
  });
});

/* ================================================================= 8. the vault */

describe('J5 / G3.8 #6 — vaultFor', () => {
  const vaultSave = () => {
    const s = fresh(NOW - 30 * DAY_MS);
    s.profileId = 'vault';
    const hard = BANK.filter(c => VAULT_TIERS.includes(c.tier ?? 2));
    assert.ok(hard.length >= 6, 'the bank has tier-3/4 originals');
    hard.slice(0, 6).forEach((c, i) => {
      const rec = applyOutcome(s, c.id, 'clean', { now: NOW - (10 + i) * DAY_MS });
      rec.cleared = true; rec.rarity = 'gold';
      rec.due = NOW - (i + 1) * DAY_MS;              // the LAST one is the most overdue
    });
    return { s, hard: hard.slice(0, 6) };
  };

  test('returns the most-overdue cleared tier-3/4 original', () => {
    const { s, hard } = vaultSave();
    const v = vaultFor(s, { now: NOW });
    assert.ok(v, 'a vault was found');
    assert.equal(v.id, hard[5].id);
    assert.ok(VAULT_TIERS.includes(v.tier));
    assert.equal(Math.round(v.overdueDays), 6);
    /* brute force: it really is the argmax */
    let best = null;
    for (const c of BANK) {
      if (!VAULT_TIERS.includes(c.tier ?? 2)) continue;
      const rec = s.cards[c.id];
      if (!isCleared(rec)) continue;
      const od = rec.due != null ? overdueDays(rec, NOW) : 0;
      if (!best || od > best.od || (od === best.od && c.id < best.id)) best = { id: c.id, od };
    }
    assert.equal(v.id, best.id);
  });

  test('seed-independent across 10 seeds, and unaffected by the board\'s own seed', () => {
    const { s } = vaultSave();
    const first = vaultFor(s, { now: NOW });
    for (let k = 0; k < 10; k++) {
      s.profileId = `vault-seed-${k}`;
      assert.deepEqual(vaultFor(s, { now: NOW }), first, `seed ${k} moved the vault`);
      const b = postBoard(s, '2026-09-16', { now: NOW, shape: 'VAULT', seed: `seed-${k}` });
      assert.equal(b.vault?.id, first.id, `board seed ${k} moved the vault`);
    }
  });

  test('an uncleared or non-tier-3/4 card is never the vault; no candidate → null', () => {
    const s = fresh(NOW);
    assert.equal(vaultFor(s, { now: NOW }), null);
    const t1 = BANK.find(c => (c.tier ?? 2) === 1);
    const r1 = applyOutcome(s, t1.id, 'clean', { now: NOW - 9 * DAY_MS });
    r1.cleared = true; r1.due = NOW - 9 * DAY_MS;
    assert.equal(vaultFor(s, { now: NOW }), null, 'a tier-1 card became the vault');
    const t3 = BANK.find(c => VAULT_TIERS.includes(c.tier ?? 2));
    const r3 = applyOutcome(s, t3.id, 'wrong', { now: NOW - 9 * DAY_MS });
    r3.cleared = false; r3.due = NOW - 9 * DAY_MS;
    assert.equal(vaultFor(s, { now: NOW }), null, 'an uncleared card became the vault');
    r3.cleared = true; r3.attempts = 1; r3.rarity = 'gold';
    assert.equal(vaultFor(s, { now: NOW })?.id, t3.id);
  });

  test('the vault carries the grade R_player says it should be (§3.5), not the guard\'s', () => {
    const { s } = vaultSave();
    s.player.elo.player = 900;
    assert.equal(vaultFor(s, { now: NOW }).grade, 2);
    s.player.elo.player = 1100;
    assert.equal(vaultFor(s, { now: NOW }).grade, 3);
    s.player.elo.player = 1300;
    assert.equal(vaultFor(s, { now: NOW }).grade, 4);
  });

  test('only the VAULT shape names a vault on the board', () => {
    const { s } = vaultSave();
    assert.equal(postBoard(s, '2026-09-16', { now: NOW, shape: 'JOB' }).vault, null);
    assert.ok(postBoard(s, '2026-09-16', { now: NOW, shape: 'VAULT' }).vault);
  });
});

/* ================================================================= 9. declines */

describe('J5 / G1 — declines re-price at +0.15', () => {
  test('declinePrice(n) = round(n · 1.15) and DECLINE_PRICE is 0.15', () => {
    assert.equal(DECLINE_PRICE, 0.15);
    assert.equal(declinePrice(0), 0);
    assert.equal(declinePrice(20), 23);
    assert.equal(declinePrice(41), 47);
    assert.equal(declinePrice(100), 115);
    for (const n of [1, 7, 26, 49, 105, 318]) assert.equal(declinePrice(n), Math.round(n * 1.15));
    assert.equal(declinePrice({ posted: 41 }), 47, 'a contract may be passed instead of its number');
    assert.equal(declinePrice(null), 0);
  });

  test('every posted contract carries its own decline price, ≥ its posted value', () => {
    for (let i = 0; i < 12; i++) {
      for (const c of boardFor(i).contracts) {
        assert.equal(c.decline, Math.round(c.posted * (1 + DECLINE_PRICE)));
        assert.ok(c.decline >= c.posted, 'a decline made a contract cheaper');
      }
    }
  });
});

/* ================================================================= 10. the ×2 */

describe('J5 / G3.6 — the ×2 posting', () => {
  test('p = 1/6 per target, 1/6 ± 0.01 over 10⁴ day seeds', () => {
    let on = 0, total = 0;
    const perIndex = new Array(12).fill(0);
    let day = '2020-01-01';
    for (let d = 0; d < 10000; d++) {
      const marks = x2Marks(day, 0, 12);
      marks.forEach((v, i) => { if (v) { on++; perIndex[i]++; } });
      total += marks.length;
      day = addDays(day, 1);
    }
    const rate = on / total;
    assert.ok(Math.abs(rate - X2.p) <= 0.01, `overall rate ${rate.toFixed(5)} against ${X2.p}`);
    for (let i = 0; i < 12; i++) {
      const r = perIndex[i] / 10000;
      assert.ok(Math.abs(r - X2.p) <= 0.01, `target ${i} rate ${r.toFixed(4)}`);
    }
    assert.equal(X2.p, 1 / 6);
    assert.equal(X2.mult, 2);
  });

  test('INDEPENDENT per target: no pair of indices is correlated beyond noise', () => {
    const n = 8, trials = 10000;
    const both = Array.from({ length: n }, () => new Array(n).fill(0));
    const each = new Array(n).fill(0);
    let day = '2021-03-01';
    for (let d = 0; d < trials; d++) {
      const m = x2Marks(day, 1, n);
      for (let i = 0; i < n; i++) {
        if (m[i]) each[i]++;
        for (let j = i + 1; j < n; j++) if (m[i] && m[j]) both[i][j]++;
      }
      day = addDays(day, 1);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pij = both[i][j] / trials;
        const expected = (each[i] / trials) * (each[j] / trials);
        assert.ok(Math.abs(pij - expected) < 0.012, `(${i},${j}) joint ${pij.toFixed(4)} vs ${expected.toFixed(4)}`);
      }
    }
  });

  test('seeded per `dateISO|jobIndex|targetIndex` — recomputed independently from rng.js', () => {
    assert.deepEqual(X2.seedParts, ['dateISO', 'jobIndex', 'targetIndex']);
    for (const day of ['2026-09-16', '2026-09-17', '2026-12-31']) {
      for (const jobIndex of [0, 1, 2]) {
        const marks = x2Marks(day, jobIndex, 12);
        for (let i = 0; i < 12; i++) {
          const expect = mulberry32(cyrb53(`${day}|${jobIndex}|${i}`) >>> 0).next() < 1 / 6;
          assert.equal(marks[i], expect, `${day}|${jobIndex}|${i}`);
        }
      }
    }
    /* the job index really does move it: job 2's placement is not job 1's */
    const a = x2Marks('2026-09-16', 0, 12).join('');
    const b = x2Marks('2026-09-16', 1, 12).join('');
    assert.notEqual(a, b, 'job 2 repeats job 1 — the placement would already be known');
  });

  test('the mark is on the envelope BEFORE the call, and doubles the posted value', () => {
    const b = boardFor(4);
    const marks = b.x2.marks;
    assert.equal(b.x2.count, marks.filter(Boolean).length);
    const forced = draftFrom(b.bundles, b.recommend.picks, { x2: () => true });
    const none = draftFrom(b.bundles, b.recommend.picks, { x2: () => false });
    assert.equal(forced.queue.length, none.queue.length);
    for (let i = 0; i < forced.queue.length; i++) {
      assert.equal(forced.queue[i].x2, true, 'the envelope does not carry the mark');
      assert.equal(none.queue[i].x2, false);
      /* ONE round of the whole product (notes/J1.md §5.7), so the doubled posting is
         `round(2x)`, which can sit one loot above `2·round(x)` on a half-unit price */
      const raw = none.queue[i];
      const t = b.pool.find(x => x.id === raw.id);
      assert.equal(forced.queue[i].posted, postedFor({
        tier: t.tier, scopeFlags: t.scopeFlags,
        bucket: t.bucket ?? undefined,
        overdueDays: t.bucket == null ? undefined : t.overdueDays,
        tell: t.tell, x2: true,
      }), 'the ×2 is not econ.postedFor with the mark on');
      assert.ok(forced.queue[i].posted >= raw.posted, 'the ×2 made a target cheaper');
      assert.ok(Math.abs(forced.queue[i].posted - raw.posted * 2) <= 1,
        'the ×2 is not worth a doubling of the envelope');
    }
    /* the envelope carries `posted` and `x2` before anything about a call, a rung or a chain exists */
    for (const it of forced.queue) {
      assert.equal(typeof it.posted, 'number');
      assert.equal(typeof it.x2, 'boolean');
      assert.equal(it.call, undefined);
      assert.equal(it.rung, undefined);
    }
  });

  /**
   * G3.7 proof 6 says "no reroll exists". The pinned seed only ever defeated RELOAD-scumming: the
   * section is titled quit-scumming, and WALKING was free. `endJob` writes a log entry for every
   * outcome including a zero-target walk, `jobIndexFor` counted log entries, and the day's seed is
   * `job|profile|day|jobIndex` — so one keystroke at the board (W → Leave, `screens/job.js` binds it
   * at every phase but the debrief) re-rolled the guard wing, the bundle partition, the ×2 placement
   * and the posted value at a cost of nothing: loose 0, bagged 0, rating unchanged. Round 1 measured
   * twelve walks on one save → twelve distinct seeds, ×2 counts 0…5, posted 177…279, and an arm that
   * walked until it saw ≥ 3 ×2 marks averaged posted 319 against 225 for taking the first board.
   */
  test('WALK-SCUMMING IS DEAD: walking at the board N times re-posts the byte-identical board', () => {
    const save = structuredClone(CORPUS[6]);
    const seen = [];
    for (let k = 0; k < 8; k++) {
      const b = postBoard(save, '2026-09-16', { now: NOW + k * 60000 });
      seen.push({
        seed: b.seed, jobIndex: b.jobIndex, marks: b.x2.marks.join(''), x2: b.x2.count,
        contracts: b.posted, locks: b.bundles.map(x => x.locks.join(',')).join('|'),
        posted: b.bundles.map(x => x.posted).join(','), wings: b.wings.join('+'),
        drafts: b.drafts.map(d => `${d.picks.join('')}:${d.postedNet}:${d.x2}`).join('|'),
      });
      /* `force` because a walk leaves Today's Page live and `startJob` now refuses to overwrite one
         (state.js `page-in-progress`, round 2 ledger-invariance). That refusal is the point of that
         fix and not of this one: what is under test here is that the BOARD does not re-roll across
         walks, so the scummer is given the most generous possible loop and still gets one board. */
      startJob(save, { board: b, now: NOW + k * 60000, today: '2026-09-16', force: true });
      walk(save, { now: NOW + k * 60000 + 3000 });
    }
    assert.equal(save.game.log.length, 8, 'the walks were not logged at all');
    for (const e of save.game.log) assert.equal(e.targets, 0, 'a walk answered something');
    for (let k = 1; k < seen.length; k++) {
      assert.deepEqual(seen[k], seen[0], `walk ${k} re-rolled the board: ${JSON.stringify(seen[k])}`);
    }
    assert.equal(new Set(seen.map(x => x.seed)).size, 1, 'the walks produced more than one seed');
    /**
     * ONE RESIDUE, OUT OF THIS LANE AND REPORTED RATHER THAN HIDDEN (notes/board-fix.md Requests 2/3):
     * the board's published GUARD DISTRIBUTION still moves across these walks, because `state.endJob`
     * feeds `guard.pushHeat` with `{ press: g.tokens, posted: g.posted }` on a zero-target walk —
     * `g.posted` is the board's stake, not what was answered, so a walk writes a full-weight press
     * window entry. `guardDist` then reads it. That is `js/job/state.js`'s line to fix (a walk must
     * weigh 0), and the 1.00 bar it produces is `js/job/guard.js`'s ε-floor/0.75-cap question. Nothing
     * the board owns re-rolls, which is what this test is for.
     */
    const after = structuredClone(CORPUS[6]);
    after.game.log = [{ day: '2026-09-16', shape: 'JOB', targets: 10, posted: 200, tGame: 300000, tAnswer: 420000 }];
    assert.equal(jobIndexFor(after, '2026-09-16'), 1);
    assert.notEqual(postBoard(after, '2026-09-16', { now: NOW }).seed, seen[0].seed);
  });

  test('the marks are pinned to the day and index, so a resume cannot re-roll them', () => {
    const s = CORPUS[6];
    const a = postBoard(s, '2026-09-16', { now: NOW, jobIndex: 0 });
    const b = postBoard(s, '2026-09-16', { now: NOW + 3 * HOUR_MS, jobIndex: 0 });
    assert.deepEqual(a.x2.marks, b.x2.marks);
    assert.equal(a.seed, b.seed);
  });
});

/* ================================================================= 11. Global rule 5 */

describe('J5 / COMPOSED Global rule 5 — no item is ever removed from the schedule', () => {
  test('nothing in the board path writes to the save', () => {
    for (let i = 0; i < 20; i++) {
      const s = CORPUS[i];
      const before = JSON.stringify(s);
      const b = postBoard(s, '2026-09-16', { now: NOW });
      for (const d of b.drafts) draftFrom(b.bundles, d.picks, { x2: b.x2.marks });
      buildJob(s, { board: b, now: NOW });
      vaultFor(s, { now: NOW });
      assert.equal(JSON.stringify(s), before, `corpus save ${i} was mutated by the board`);
    }
  });

  test('set(job items) ⊆ set(page items) — the game never composes, it only partitions', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      const page = new Set(b.page.queue.map(it => it.id));
      for (const x of b.bundles) for (const id of x.locks) assert.ok(page.has(id), `save ${i}: ${id} is not on the Page`);
      for (const d of b.drafts) for (const it of d.queue) assert.ok(page.has(it.id), `save ${i}: ${it.id} is not on the Page`);
    }
  });

  /**
   * ROUND 1 (board-schedule): this test used to re-post the board from the SAME, UNMUTATED save — its
   * own comment said "the save is untouched" — so nothing was ever answered and it asserted only that
   * `composePage` is deterministic, which the digest test at the top of this file already pins. Its
   * comment claimed "every critical that was not drafted is at the front"; the assertion underneath
   * was `next.page.queue.some(q => q.id === it.id)` — presence, not position.
   *
   * This is the walk the sentence describes: answer the drafted union through the STUDY LAYER'S OWN
   * calls (`applyOutcome` + `markItem`, the same two the flat path uses), close the page with
   * `finishPage`, re-compose the day the way Home does (`plan.composeOpts`), and then assert both
   * halves — everything unposted is back, and the deferred criticals LEAD it.
   *
   * ROUND 2 (board-schedule). Two defects, both hidden by the `checked < 5` cap this loop used to
   * carry. 37 of the 50 corpus saves match the filter; the loop stopped after the first five hits
   * (0, 1, 2, 4, 6) and never saw the other 32.
   *
   *  1. `Math.max(...deferredAt) < firstOrdinary` — "ahead of every non-critical item" — is
   *     MIS-SPECIFIED, and fails on 7 of the 37. Six of those seven fail on a Rematch:
   *     `page.js isCriticalTarget` returns false for `role === 'rematch'` (it requires a due
   *     review with a bucket), while `composePage` step 2 seats every pending Rematch immediately
   *     after the two-item opener. So on any Page carrying a Rematch the assertion is unsatisfiable
   *     by construction, and it would red-flag correct behaviour. What the composer DOES guarantee
   *     — and it holds on 37 of 37 — is that the deferred criticals lead the next board's REVIEW
   *     BLOCK: they sit ahead of every `new` / `weak` / `floor` item on the Page.
   *  2. The seventh failure (corpus save 19) is a genuine counterexample to the published sentence,
   *     and it is asserted below rather than excluded: criticality is BUCKET-based
   *     (`bucket ≤ 2 ∨ overdue ≥ 1 d ∨ sweep`) while `composePage` sorts its dues on OVERDUE DAYS,
   *     so a warm non-critical review 0.5 d overdue leads a deferred bucket-1 critical 0.2 d
   *     overdue. "Rises on the overdue sort and leads the next board" is therefore not guaranteed
   *     for an item that is critical by bucket alone. See Requests in notes/tests-fix.md.
   *  3. The other half — "everything unposted is back" — over-claimed too: it asserted the return
   *     of every non-Variant queue item, including `new` and `weak` CARDS that were never on the
   *     schedule at all (saves 11, 22, 34 drop one to three of them, because the new-card pool is
   *     re-drawn per Page and shrinks when reviews are heavy). Global rule 5 is about the SCHEDULE,
   *     so the guarantee is now asserted over the items that are actually due, and the new-card
   *     half is measured and named instead of being asserted as a law it never was.
   */
  test('a target a job does not reach stays due and LEADS the next board’s review block', () => {
    let checked = 0;
    const rematchBlocked = [];      // Pages where a Rematch sits ahead of a deferred critical
    const bucketVsOverdue = [];     // the bucket-critical / overdue-sort disagreement
    const newCardsDropped = [];     // unreached NEW/WEAK cards the next Page did not re-draw
    for (let i = 0; i < CORPUS.length; i++) {
      const save = structuredClone(CORPUS[i]);
      const b = postBoard(save, '2026-09-16', { now: NOW });
      if (!b.deferred.length) continue;
      const drafted = jobQueueOf(buildJob(save, { board: b, now: NOW, today: '2026-09-16' }));
      const draftedIds = new Set(drafted.map(it => it.id));
      /* SCHEDULED items only: an Infinite Variant is generated per page from the seed, not scheduled,
         so the next Page carries a fresh `T-*#hash` of that skill rather than the same id. Global
         rule 5 is about the schedule — cards, rematches and dues — and that is what is asserted. */
      const unreached = b.page.queue.filter(it => !draftedIds.has(it.id) && !it.isVariant);
      if (!unreached.length) continue;
      checked++;

      /* ANSWER the job, through the study layer, exactly as the flat path does */
      startJob(save, { board: b, now: NOW, today: '2026-09-16' });
      save.inProgress.queue.forEach((it, k) => {
        applyOutcome(save, it.id, 'clean', { now: NOW + 1000 });
        markItem(save, { ok: true, cleared: true }, { idx: k });
      });
      finishPage(save);
      assert.equal(save.inProgress?.game ?? null, null, `save ${i}: the job outlived finishPage`);

      /* the next board of the same day, composed the way Home composes it */
      const next = composePage(save, { ...composeOpts(save), now: NOW + HOUR_MS });
      const on = new Map(next.queue.map((it, k) => [it.id, k]));

      /* (a) GLOBAL RULE 5: every unreached item that is on the SCHEDULE is back. */
      for (const it of unreached) {
        if (it.role !== 'review' && it.role !== 'rematch') continue;
        assert.ok(on.has(it.id), `save ${i}: due ${it.id} was posted by nobody and is gone from the next Page`);
      }
      /* …and the new/weak cards that were never scheduled are re-drawn from the pool, not owed. */
      for (const it of unreached) {
        if (it.role === 'review' || it.role === 'rematch') continue;
        if (!on.has(it.id)) {
          newCardsDropped.push({ save: i, id: it.id, role: it.role, scheduled: CORPUS[i].cards?.[it.id]?.due != null });
        }
      }

      /* (b) every deferred critical is STILL DUE */
      const deferredAt = b.deferred.filter(id => on.has(id)).map(id => on.get(id));
      assert.equal(deferredAt.length, b.deferred.length, `save ${i}: a deferred critical is no longer due`);

      const priced = next.queue.map((it, k) => jobTargetOf(it, save, { now: NOW + HOUR_MS, order: k }));
      const inReviewBlock = (t) => t.role === 'review' || t.role === 'rematch';
      const maxDeferred = Math.max(...deferredAt);

      /* (c) THE GUARANTEE: they lead the next board's REVIEW BLOCK — ahead of every new/weak/floor
             item. Holds on all 37 matching saves; this is the sentence the composer can keep. */
      const firstOutside = priced.findIndex(t => !inReviewBlock(t));
      if (firstOutside >= 0) {
        assert.ok(maxDeferred < firstOutside,
          `save ${i}: a deferred critical sits at ${maxDeferred}, behind the ${priced[firstOutside].role} item at ${firstOutside}`);
      }

      /* (d) the two ways the STRONGER sentence ("ahead of every non-critical item") fails, recorded
             per save rather than skipped. Both are named in COMPOSED-GAME Requests. */
      for (let k = 0; k < maxDeferred; k++) {
        const t = priced[k];
        if (t.critical) continue;
        if (t.role === 'rematch') { rematchBlocked.push(`${i}:${t.id}@${k}`); continue; }
        const behind = deferredAt.filter(a => a > k).map(a => priced[a]);
        bucketVsOverdue.push({ save: i, ahead: t, behind });
      }
    }
    assert.ok(checked >= 30,
      `only ${checked} corpus saves defer a critical AND leave a target unposted — the loop is meant to run over `
      + 'EVERY one of them (it used to stop after five, which is how six mis-specified failures and three '
      + 'missing-item failures went unseen)');

    /* A Rematch is not a critical target (`isCriticalTarget` requires a due review with a bucket)
       and composePage seats it at slot 3, so it is the ordinary reason the stronger sentence fails. */
    assert.ok(rematchBlocked.length >= 6,
      `only ${rematchBlocked.length} Pages seat a Rematch ahead of a deferred critical — if this has become 0, `
      + '`isCriticalTarget` now counts a pending Rematch and the stronger sentence can be asserted directly');

    /* The genuine counterexample — rare, and it is a property of the two orderings rather than of
       this corpus: criticality is BUCKET-based, composePage's due sort is OVERDUE-based. Every
       occurrence is required to be exactly that, so the day the mechanism changes this goes red. */
    const say = (t) => `${t.id} (bucket ${t.bucket}, ${t.overdueDays} d overdue, ${t.role})`;
    assert.ok(bucketVsOverdue.length <= 3,
      `${bucketVsOverdue.length} Pages put a plain non-critical review ahead of a deferred critical: `
      + bucketVsOverdue.map(v => `save ${v.save}: ${say(v.ahead)}`).join(' | '));
    for (const v of bucketVsOverdue) {
      const t = v.ahead;
      assert.equal(t.role, 'review', `save ${v.save}: ${say(t)} is not even a due review`);
      assert.ok(t.bucket > BOARD.criticalBucketMax,
        `save ${v.save}: ${say(t)} has a critical bucket and is not critical — the criticality rule has changed`);
      assert.ok((t.overdueDays ?? 0) < BOARD.criticalOverdueDays,
        `save ${v.save}: ${say(t)} is a day overdue and is not critical — the criticality rule has changed`);
      for (const d of v.behind) {
        assert.ok((t.overdueDays ?? 0) > (d.overdueDays ?? 0),
          `save ${v.save}: ${say(t)} leads the deferred ${say(d)} WITHOUT winning the overdue sort — `
          + 'that would be a new defect, not the bucket/overdue disagreement this records');
        assert.ok(d.bucket <= BOARD.criticalBucketMax,
          `save ${v.save}: the deferred ${say(d)} is critical for some reason other than its bucket`);
      }
    }

    /* And the new-card half, measured: a card that was never on the schedule is re-drawn from the
       pool, not owed by Global rule 5. Every one that fails to return must be exactly that. */
    assert.ok(newCardsDropped.length >= 1,
      'no unreached new/weak card failed to return — if the pool has become stable, the old '
      + '"every unreached item is back" assertion could be restored and this arm deleted');
    for (const d of newCardsDropped) {
      assert.ok(['new', 'weak', 'floor'].includes(d.role), `save ${d.save}: ${d.id} is a ${d.role}, not a pool card`);
      assert.equal(d.scheduled, false,
        `save ${d.save}: ${d.id} had a Leitner record and still vanished — Global rule 5 DOES owe it`);
    }
  });

  /**
   * ROUND 1 (board-schedule): this used to build its own `fakePage`, hand it to `composeBundles` and
   * then assert `b.deferred ⊆ page.queue` — but `deferred` is DERIVED from `page.queue` inside
   * `composeBundles`, so the assertion was a tautology that could not fail for any input. The save
   * below is a real corpus save whose COMPOSED queue carries more criticals than the shape can hold,
   * and the assertions are about what the board did with them.
   */
  test('a real Page with more criticals than the shape can hold: named, posted or deferred — never dropped', () => {
    let found = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const save = CORPUS[i];
      const b = boardFor(i);
      const onPage = b.page.queue
        .map((it, k) => jobTargetOf(it, save, { now: NOW, order: k }))
        .filter(t => t.critical).map(t => t.id);
      if (onPage.length <= b.budget.targets) continue;              // the shape had room: not this case
      found++;
      assert.ok(b.deferred.length > 0, `save ${i}: ${onPage.length} criticals, a ${b.budget.targets}-target shape, nothing deferred`);
      assert.deepEqual(new Set([...b.critical, ...b.criticalOptional, ...b.deferred]), new Set(onPage));
      const posted = new Set(b.bundles.flatMap(x => x.locks));
      for (const id of b.deferred) {
        assert.ok(!posted.has(id), `save ${i}: ${id} is named deferred and posted anyway`);
        assert.ok(b.page.queue.some(it => it.id === id), `save ${i}: ${id} was deferred off the Page entirely`);
      }
      /* every posted lock is still a lock the COMPOSER put on the Page — the board never invents one */
      const pageIds = new Set(b.page.queue.map(it => it.id));
      for (const id of posted) assert.ok(pageIds.has(id), `save ${i}: ${id} is not on the composed Page`);
    }
    assert.ok(found >= 5, `only ${found} corpus saves composed more criticals than their shape holds`);
  });
});

/* ================================================================= 12. buildJob + the board */

describe('J5 / buildJob → inProgress.game', () => {
  test('exactly the sixteen IN_PROGRESS_KEYS, in that set, and nothing else is enumerable', () => {
    const g = buildJob(CORPUS[3], { today: '2026-09-16', now: NOW });
    assert.deepEqual(Object.keys(g).slice().sort(), IN_PROGRESS_KEYS.slice().sort());
    for (const k of IN_PROGRESS_KEYS) assert.ok(k in g, `missing ${k}`);
    const round = JSON.parse(JSON.stringify(g));
    assert.deepEqual(Object.keys(round).sort(), IN_PROGRESS_KEYS.slice().sort());
    assert.equal(round.queue, undefined, 'the drafted queue leaked into the persisted object');
    assert.equal(round.board, undefined);
    assert.ok(jobQueueOf(g).length > 0, 'but it IS reachable through jobQueueOf');
    assert.ok(jobBoardOf(g));
  });

  test('a job starts at loose 0 / bagged 0 / chain 0 with no calls and no briefs', () => {
    const g = buildJob(CORPUS[3], { today: '2026-09-16', now: NOW });
    assert.equal(g.loose, 0);
    assert.equal(g.bagged, 0);
    assert.equal(g.chain, 0);
    assert.deepEqual(g.calls, []);
    assert.deepEqual(g.briefs, []);
    assert.equal(g.phase, 'board');
    assert.equal(g.phaseAt, NOW);
    assert.equal(g.tGame, 0);
    assert.equal(g.tAnswer, 0);
  });

  test('the bundles persist as ids only, capped at CAPS.bundles, in the J10 shape', () => {
    const g = buildJob(CORPUS[3], { today: '2026-09-16', now: NOW });
    assert.ok(g.bundles.length <= CAPS.bundles);
    for (const b of g.bundles) {
      assert.deepEqual(Object.keys(b).sort(),
        ['cold', 'grade', 'id', 'label', 'locks', 'minutes', 'overflow', 'posted', 'wing'].sort());
      for (const l of b.locks) assert.equal(typeof l, 'string');
    }
    assert.ok(JSON.stringify(g).length < 4096, `a live job serialises to ${JSON.stringify(g).length} bytes`);
  });

  test('THE PINNED SEED (G3.7 proof 6): two builds of the same day and index are identical', () => {
    const a = buildJob(CORPUS[7], { today: '2026-09-16', now: NOW, jobIndex: 0 });
    const b = buildJob(CORPUS[7], { today: '2026-09-16', now: NOW, jobIndex: 0 });
    assert.deepEqual(a, b);
    assert.equal(a.seed, jobSeedFor(CORPUS[7], '2026-09-16', 0));
    assert.deepEqual(jobQueueOf(a).map(x => x.id), jobQueueOf(b).map(x => x.id));
    /* a DIFFERENT index is a different job: guard, partition and ×2 all move off the same save */
    const c = buildJob(CORPUS[7], { today: '2026-09-16', now: NOW, jobIndex: 1 });
    assert.notEqual(c.seed, a.seed);
  });

  test('the drafted picks default to the board\'s recommendation and can be overridden', () => {
    const board = boardFor(9);
    const g = buildJob(CORPUS[9], { board, now: NOW });
    assert.deepEqual(g.picks, board.recommend.picks);
    const other = board.drafts.find(d => d.picks.join('') !== board.recommend.picks.join(''));
    const h = buildJob(CORPUS[9], { board, now: NOW, picks: other.picks });
    assert.deepEqual(h.picks, other.picks);
    assert.deepEqual(jobQueueOf(h).map(x => x.id), other.queue.map(x => x.id));
  });

  test('the guard is drawn from the published distribution over the board\'s own support', () => {
    for (let i = 0; i < 12; i++) {
      const board = boardFor(i);
      const g = buildJob(CORPUS[i], { board, now: NOW });
      if (!board.wings.length) continue;
      assert.ok(board.wings.includes(g.guard.wing), `the guard took ${g.guard.wing}, not on the board`);
      const sum = Object.values(g.guard.dist).reduce((s, p) => s + p, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `the published distribution sums to ${sum}`);
      assert.equal(board.guardSupport, `guard: ${board.guard.n} wings on the board`);
      assert.ok(g.guard.mult >= 0.5 && g.guard.mult <= 0.75);
    }
  });
});

describe('J5 / the board the student reads', () => {
  test('the primary button prints targets, minutes, the end time and the projected split', () => {
    const b = boardFor(2);
    assert.match(b.primary, /^(RUN|JOB|VAULT) · [A-E]( [A-E])* · \d+ targets · posted \d+( \(−\d+ shared\))? · ~\d+ min · ends \d\d:\d\d · \d+ % game$/);
    assert.equal(b.ends, new Date(b.endsAt).toTimeString().slice(0, 5));
    assert.ok(b.endsAt > NOW, 'the board ends in the future');
    assert.match(b.projection, /^~\d+ % game · (projected|your last \d jobs)$/);
    assert.equal(b.projectionSource, 'projected', 'job 1 says projected, it does not invent a history');
  });

  /**
   * ROUND 3, player-feel MAJOR: "the job never tells you what it pays until it is over". The button
   * read `JOB · 10 targets · ~23 min · ends 19:52 · 26 % game` — no contract letters, and the word
   * `posted` nowhere on it; `Posted 516` first reached the student in the debrief, after the job.
   * `COPY.postedNet` / `COPY.postedFlat` and `draftFrom().line` had been composed for this line
   * since J5 and had no render site at all (`grep -rn "postedNet|postedFlat" site/js/screens/` → no
   * matches). G1 publishes the button in full:
   *
   *   [ TAKE THE POSTED JOB · A D E · 10 targets · posted 100 (−5 shared) · ~14 min · ends 20:31 · 48 % game ]
   *
   * Both screens render `board.primary` (`screens/job.js` the button, `screens/home.js
   * primaryLineFor` the CTA), so this is the one string to get right — and the last assertion pins
   * it to `COPY.primary`, the template Home still falls back to, so the two cannot drift apart.
   */
  test('the primary is G1\'s button: the letters it drafts and the posted it pays, on every corpus board', () => {
    let shared = 0, flat = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      if (!b.recommend) continue;
      const d = b.recommend;
      const minutes = Math.ceil((b.endsAt - b.now) / 60000);
      assert.equal(b.primary, [
        SHAPES[b.shape].name, d.label, `${d.queue.length} targets`, d.line,
        `~${minutes} min`, `ends ${b.ends}`, `${b.split} % game`,
      ].join(' · '), `save ${i}`);
      /* the payout is really on it, in the copy file's own words, and it is the DRAFTED union's */
      assert.equal(b.postedLine, d.line);
      assert.ok(b.primary.includes(` ${d.picks.join(' ')} `), `save ${i}: the button does not name its contracts`);
      if (d.shared > 0) {
        shared++;
        /* `COPY.postedNet` prints the union GROSS and the deduction beside it (G1: "the board prints
           each contract's posted value gross and the drafted union's value net — posted 105
           (−5 shared)"), so both numerals of the net are on the button */
        assert.ok(b.primary.includes(`posted ${d.postedGross} (−${d.shared} shared)`), `save ${i}: the button does not price the job`);
        assert.ok(Math.abs((d.postedGross - d.shared) - d.postedNet) < 1e-6, `save ${i}: gross − shared is not the net`);
      } else {
        flat++;
        assert.ok(b.primary.includes(`posted ${d.postedNet}`), `save ${i}: the button does not price the job`);
      }
      /* …and it IS `COPY.primary` plus those two segments — if the copy file's template moves, this
         line has to move with it (the seven-segment COPY entry is filed under Requests). */
      const tail = b.primary.replace(` · ${d.label}`, '').replace(` · ${d.line}`, '');
      assert.equal(tail, COPY.primary({
        shape: SHAPES[b.shape].name, targets: d.queue.length, minutes, ends: b.ends, split: b.split,
      }), `save ${i}: the button is no longer COPY.primary plus the letters and the payout`);
    }
    /* every full board shares: the core is replicated into `r` of the `n` contracts, so a draft of
       a 5-contract board ALWAYS carries a lock twice over and always prints the `(−N shared)` half
       (0 of 3996 corpus drafts have `shared = 0`). The flat form is the thin board's — below. */
    assert.equal(flat, 0, 'a full board cannot draft without sharing a core lock');
    assert.equal(shared, CORPUS.length);
  });

  test('…and the thin board\'s one contract prints the FLAT form, COPY.postedFlat', () => {
    /* One contract, no replication, nothing shared — the only board on which `COPY.postedFlat` is
       the right sentence, and (until round 3) `draftFrom` printed its text from a local literal
       instead, which is how that COPY entry came to have zero call sites. */
    const queue = Array.from({ length: 3 }, (_, k) => item(['VOC', 'PAIRS'][k % 2], 1));
    const b = postBoard(fresh(NOW), '2026-09-16', { now: NOW, pageOverride: fakePage(queue) });
    assert.equal(b.posted, 1);
    assert.equal(b.recommend.shared, 0);
    assert.equal(b.postedLine, COPY.postedFlat({ posted: b.recommend.postedNet }));
    assert.ok(b.primary.includes(` · ${COPY.postedFlat({ posted: b.recommend.postedNet })} · `), b.primary);
    assert.ok(!/shared/.test(b.primary), 'nothing is shared on a one-contract board');
  });

  test('a student with a ledger gets their OWN split, labelled with the job count', () => {
    const s = structuredClone(CORPUS[2]);
    s.game.log = [
      { day: '2026-09-14', shape: 'VAULT', targets: 7, tGame: 300000, tAnswer: 420000 },
      { day: '2026-09-15', shape: 'VAULT', targets: 7, tGame: 320000, tAnswer: 400000 },
    ];
    const b = postBoard(s, '2026-09-16', { now: NOW });
    assert.equal(b.projectionSource, 'ledger');
    assert.match(b.projection, /your last 2 jobs$/);
    /**
     * …and the number is the PER-DRAFT model spent on the student's own phase means, recomputed here
     * from `data/job.js` — NOT the raw `Σ tGame / Σ (tGame + tAnswer)` over whatever shapes those two
     * jobs happened to be. Round 1 (split-honesty): that ratio has no shape term in it at all, so a
     * history of VAULT/full-use jobs printed 48 % over a JOB12 night the debrief headlined at 35.2 %.
     * The board's own `wallS` (which prints `ends HH:MM`) was already per-shape, so the same row
     * printed a clock from one model and a split from another.
     */
    const means = { ...PHASE_MEANS_DEFAULT, ...(s.game?.ledger?.phaseMeans ?? null) };
    const q = b.recommend.queue;
    const landed = Math.min(SHAPES[b.shape].briefs, BOARD.briefAfterTargets.filter(n => n < q.length).length);
    let answerS = 0, decisionS = 0;
    for (const it of q) {
      answerS += ANSWER_MINUTES_PER_TIER[it.tier] * 60;
      decisionS += DECISION_SECONDS[it.tier];
    }
    /**
     * ROUND 2 (split-honesty) — AND THE TWO PER-TARGET TERMS ARE NOW THE STUDENT'S TOO. Until round 2
     * `answerS` and `decisionS` were the shipped tables at both ends, so `~N % game · your last 2
     * jobs` put this student's name on a number 86 % of whose inputs they had never produced, and it
     * missed the debrief's own headline by 17–35 points in both directions. They are now those same
     * tables scaled by this student's measured RATE against them, recomputed here from the log above
     * and `econ.answerSeconds`/`decisionSeconds` — a rate belongs to the student, the tier mix
     * belongs to tonight's draft, and the projection needs both.
     */
    const rates = b.projectionRates;
    assert.equal(rates.n.answer, 2, 'both logged jobs were rated');
    assert.notEqual(rates.answer, 1, 'the answer term is still the brochure');
    assert.notEqual(rates.decision, 1, 'the decision term is still the brochure');
    answerS *= rates.answer;
    decisionS *= rates.decision;
    const gameS = means.board + means.guard + means.brief * landed + means.getaway + decisionS;
    assert.equal(b.split, Math.round((100 * gameS) / (answerS + gameS)), 'the split is not the per-draft model');
    assert.notEqual(b.split, Math.round((100 * 620000) / (620000 + 820000)), 'the raw cross-shape ratio is back');
    /* the clock still spends the debrief read the student sits through — one model, two questions */
    assert.equal(b.endsAt, NOW + Math.round((answerS + gameS + means.debrief) * 1000));
  });

  /**
   * THE LINE SAYS `your last N jobs`, SO THE STUDENT HAS TO BE IN IT (round 2, split-honesty
   * BLOCKER). Same save, same day, same draft — only the history changes, to two students who are
   * not the shipped tables in opposite directions. If the projection were still the tables, these
   * two boards would print the same number, which is what the critic measured and what made the
   * label a lie.
   */
  test('two students with the same board and different histories get different splits', () => {
    const withLog = (jobs) => {
      const s = structuredClone(CORPUS[2]);
      s.game.log = jobs;
      return postBoard(s, '2026-09-16', { now: NOW });
    };
    const job = (tGame, tAnswer) => ({ day: '2026-09-15', shape: 'JOB', targets: 10, tGame, tAnswer });
    /* a slow answerer who taps through the game: mostly ANSWER seconds */
    const slow = withLog([job(120000, 900000), job(130000, 880000)]);
    /* a fast answerer who deliberates: mostly GAME seconds */
    const fast = withLog([job(420000, 90000), job(400000, 95000)]);
    const base = withLog([]);
    assert.equal(base.projectionSource, 'projected');
    assert.equal(slow.projectionSource, 'ledger');
    assert.deepEqual(slow.recommend.picks, fast.recommend.picks, 'the two boards are not the same draft');
    assert.ok(slow.split < base.split - 5,
      `the slow answerer's board printed ${slow.split} % against a shipped ${base.split} %`);
    assert.ok(fast.split > base.split + 5,
      `the deliberator's board printed ${fast.split} % against a shipped ${base.split} %`);
    assert.ok(fast.split - slow.split >= 20,
      `two opposite students printed ${slow.split} % and ${fast.split} % — the line is still the brochure`);
  });

  test('a zero-target WALK is not a measurement: it moves neither the label nor the projection', () => {
    /* Round 1 (exploit-hunt): `endJob` logs every outcome, so three board-walks — `targets 0`,
       `tAnswer 0` — printed `~100 % game · your last 3 jobs` on Home and on the board, both labelled
       measured. And because `jobIndexFor` counted them, each walk re-rolled the seed. */
    const s = structuredClone(CORPUS[2]);
    s.game.log = [...(s.game.log ?? [])];
    const before = postBoard(s, '2026-09-16', { now: NOW });
    for (let k = 0; k < 3; k++) {
      s.game.log.push({ day: '2026-09-16', shape: 'JOB', targets: 0, posted: 0, bagged: 0, tGame: 4000, tAnswer: 0 });
    }
    const after = postBoard(s, '2026-09-16', { now: NOW });
    assert.equal(after.projectionSource, 'projected', 'three walks became "your last 3 jobs"');
    assert.equal(after.split, before.split, 'three walks moved the projected split');
    assert.ok(after.split < 100, `the board printed ${after.split} % game`);
    /* …and the board itself is the same board: the walk is not a reroll (G3.7 proof 6) */
    assert.equal(after.seed, before.seed);
    assert.equal(after.jobIndex, before.jobIndex);
    assert.deepEqual(after.x2.marks, before.x2.marks);
  });

  /**
   * …AND A PARTIAL WALK IS A MEASUREMENT OF WHAT IT ANSWERED, NOT OF WHAT IT DRAFTED (round 3,
   * split-honesty BLOCKER — the half round 2 left open).
   *
   * `state.endJob` writes `targets: answered(s)` beside `posted: g.posted`, and `g.posted` is the
   * WHOLE drafted queue's value, set once at `startJob` and never reduced when the student walks out
   * at target 3 of 10. `personalRates` rated the measured seconds against that full-queue value, so a
   * table-pace student whose honest split is 27 % had a board printing 69 % after five mid-job walks
   * — off a failure state G1 documents ("One tap on WALK at any moment", "Walked (quit, 50 %
   * auto-bag)") and wires to the screen. Nothing in `tests/` had ever walked out of a job before
   * reading the projection back.
   *
   * These two cells drive the REAL machine — `startJob` → `lockCall` → `applyTarget` → `push` →
   * `walk` — on a clock that is nobody's published table, and assert the published criterion
   * (`SPLIT.agreeWithinPoints`) plus the mechanism that carries it (`projectionRates`).
   */
  describe('J5 / a mid-job WALK is measured on what it answered', () => {
    /** a student who is not the tables: slower on the stem, quicker on the beat */
    const CLOCK = Object.freeze({
      answerS: { 1: 44, 2: 71, 3: 155, 4: 240 }, callS: { 1: 7, 2: 8, 3: 9, 4: 10 },
      beatS: { 1: 6, 2: 9, 3: 13, 4: 17 }, board: 26, guard: 13, brief: 21, getaway: 16,
    });
    const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };

    /** `screens/job.js finalWordOf`, inlined (this lane does not import that file) */
    const finalWord = (save) => {
      const g = state.stateOf(save);
      if (!g) return state.OUTCOMES.QUIT;
      if (g.stakes === false) return g.quiet === true ? state.OUTCOMES.QUIET22 : state.OUTCOMES.CALLED;
      if (state.queueOf(save).length > 1) return g.last?.ok === true ? state.OUTCOMES.CRACKED : state.OUTCOMES.KNOCKED;
      return state.OUTCOMES.COMPLETED;
    };

    /** play a job on `clock`, walking out after `quitAfter` answers; returns the board and the debrief */
    function play(save0, shapeId, { quitAfter = Infinity } = {}) {
      const save = structuredClone(save0);
      const board = postBoard(save, '2026-09-16', { now: NOW, shape: shapeId });
      let t = NOW;
      const step = (secs) => (t += Math.round(secs * 1000));
      state.startJob(save, { today: '2026-09-16', now: t, board, force: true });
      state.tick(save, 'guard', step(CLOCK.board));
      state.beginTargets(save, { now: step(CLOCK.guard) });
      let answered = 0;
      for (let stop = 0; stop < 900; stop++) {
        const g = state.stateOf(save);
        if (!g || g.outcome != null) break;
        if (answered >= quitAfter) { state.walk(save, { now: step(2) }); break; }
        const tier = (state.queueOf(save)[state.idxOf(save)]?.tier) ?? 2;
        if (g.phase === 'envelope') { state.lockCall(save, 70, { now: step(CLOCK.callS[tier]) }); continue; }
        if (g.phase === 'answer') { state.applyTarget(save, CLEAN, { now: step(CLOCK.answerS[tier]) }); answered++; continue; }
        if (g.phase === 'payout' || g.phase === 'bagpush') {
          const last = state.queueOf(save)[Math.max(0, state.idxOf(save) - 1)]?.tier ?? 2;
          const when = step(CLOCK.beatS[last]);
          if (state.targetsLeft(save) === 0) state.endJob(save, finalWord(save), { now: when, day: '2026-09-16' });
          else state.push(save, { now: when });
          continue;
        }
        if (g.phase === 'brief') { state.brief(save, {}, { now: step(CLOCK.brief) }); continue; }
        if (g.phase === 'getaway') { state.crack(save, { now: step(CLOCK.getaway) }); continue; }
        break;
      }
      const entry = save.game.log.at(-1) ?? null;
      const wall = (entry?.tGame ?? 0) + (entry?.tAnswer ?? 0);
      return { save, board, entry, headline: wall > 0 ? (100 * entry.tGame) / wall : 0 };
    }

    /** a save whose last five jobs are `walks` mid-job walks and the rest complete */
    const seasoned = (i, shapeId, walks) => {
      let s = structuredClone(CORPUS[i]);
      for (let k = 0; k < SPLIT.projectionWindowJobs; k++) {
        const half = Math.max(1, Math.round(SHAPES[shapeId].targets / 2));
        s = play(s, shapeId, { quitAfter: k < walks ? half : Infinity }).save;
      }
      return s;
    };

    test('the log entry really does record the WHOLE queue against the answered targets', () => {
      /* the shape of the defect, pinned so a later fix in `state.js` is visible here rather than
         silently double-counted: if `posted` ever becomes the answered part (or `postedAnswered` /
         `queueTargets` appears beside it), this assertion is the place that says so */
      const w = play(CORPUS[2], 'JOB', { quitAfter: 3 });
      assert.equal(w.entry.targets, 3);
      const drafted = w.board.recommend.queue.reduce((s, it) => s + it.posted, 0);
      assert.ok(w.entry.posted > drafted * 0.9,
        `the entry recorded posted ${w.entry.posted} against a drafted queue worth ${drafted}`);
      assert.equal(w.entry.postedAnswered, undefined, 'state.js now records an answered basis — read it');
      assert.equal(w.entry.queueTargets, undefined, 'state.js now records the queue length — read it');
    });

    test('THE CRITERION survives a history of mid-job walks: every shape, up to five of five', () => {
      let worst = 0;
      const rows = [];
      for (const shapeId of SHAPE_IDS) {
        for (const walks of [0, 3, SPLIT.projectionWindowJobs]) {
          const w = play(seasoned(2, shapeId, walks), shapeId);
          const gap = Math.abs(w.board.split - w.headline);
          rows.push([shapeId, walks, w.board.split, +w.headline.toFixed(1), +gap.toFixed(1)]);
          worst = Math.max(worst, gap);
          assert.equal(w.board.projectionSource, 'ledger', `${shapeId}/${walks}: no history reached the board`);
          assert.ok(gap <= SPLIT.agreeWithinPoints,
            `${shapeId} after ${walks} mid-job walks: the board printed ${w.board.split} %, the debrief headlined ${w.headline.toFixed(1)} % (gap ${gap.toFixed(1)})`);
        }
      }
      if (process.env.J5_PRINT) console.table(rows);
      assert.ok(worst > 0, 'the cells are not being measured at all');
    });

    test('…and the rate it reads is the student\'s own — the CONTROL that names the mechanism', () => {
      /* The mechanism, not the outcome. The same student, the same clock: once with five finished
         jobs behind them, once with five walked at half. They must read as ONE pace. */
      const walkedSave = seasoned(2, 'JOB', SPLIT.projectionWindowJobs);
      const complete = postBoard(seasoned(2, 'JOB', 0), '2026-09-16', { now: NOW, shape: 'JOB' });
      const walked = postBoard(walkedSave, '2026-09-16', { now: NOW, shape: 'JOB' });
      assert.equal(walked.projectionRates.n.answer, SPLIT.projectionWindowJobs, 'the walks were dropped, not rated');
      for (const term of ['answer', 'decision']) {
        const a = complete.projectionRates[term];
        const b = walked.projectionRates[term];
        assert.ok(Math.abs(a - b) / a < 0.35,
          `the ${term} rate reads ${b.toFixed(2)} for a walker against ${a.toFixed(2)} for the same student finishing`);
      }
      /**
       * THE CONTROL. `postedAnswered` on an entry means "this many posted points were actually
       * answered", and `personalRates` then takes the entry at its word and skips the prefix
       * estimate — so writing the WHOLE queue's posted into it reproduces, exactly, what this file
       * did before round 3. Same save, same log, one field: the student's pace reads less than half
       * what it is, and the board's own published criterion breaks.
       */
      const naiveSave = structuredClone(walkedSave);
      for (const e of naiveSave.game.log) e.postedAnswered = e.posted;
      const naive = postBoard(naiveSave, '2026-09-16', { now: NOW, shape: 'JOB' });
      assert.ok(naive.projectionRates.answer < walked.projectionRates.answer / 2,
        `the control did not reproduce the defect: ${naive.projectionRates.answer.toFixed(2)} against ${walked.projectionRates.answer.toFixed(2)}`);
      const w = play(walkedSave, 'JOB');
      assert.ok(Math.abs(naive.split - w.headline) > SPLIT.agreeWithinPoints,
        `the control printed ${naive.split} % against a headline of ${w.headline.toFixed(1)} % — the old reading did not miss`);
      assert.ok(Math.abs(w.board.split - w.headline) <= SPLIT.agreeWithinPoints,
        `and the live one printed ${w.board.split} % against ${w.headline.toFixed(1)} %`);
    });
  });

  test('every legal draft is priced on the sheet, so the draw distribution is computable', () => {
    const b = boardFor(5);
    assert.equal(b.drafts.length, b.draft > 0 ? 10 : 1);
    assert.deepEqual(b.drafts.map(d => d.picks.join('')).sort(),
      legalDrafts(b.posted, b.draft).map(p => p.join('')).sort());
    assert.ok(b.drafts.includes(b.recommend), 'the recommendation is one of the legal drafts');
  });

  test('the recommendation takes the widest wing span first (the token press needs it)', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      const best = Math.max(...b.drafts.map(d => d.wings.length));
      assert.equal(b.recommend.wings.length, best, `save ${i}: the recommendation narrowed the support`);
    }
  });

  test('legalDrafts is C(n, d) in lexicographic order', () => {
    assert.equal(legalDrafts(5, 3).length, 10);
    assert.deepEqual(legalDrafts(5, 3)[0], ['A', 'B', 'C']);
    assert.deepEqual(legalDrafts(5, 3)[9], ['C', 'D', 'E']);
    assert.deepEqual(legalDrafts(4, 2).length, 6);
    assert.deepEqual(legalDrafts(2, 0), [['A', 'B']]);
    assert.deepEqual(legalDrafts(3, 3), [['A', 'B', 'C']]);
  });

  test('jobIndexFor counts today\'s jobs, and the seed is pinned to (profile, day, index)', () => {
    const s = structuredClone(CORPUS[0]);
    assert.equal(jobIndexFor(s, '2026-09-16'), 0);
    s.runs.push({ kind: 'job', startedAt: NOW - HOUR_MS });
    assert.equal(jobIndexFor(s, '2026-09-16'), 1);
    s.game.log.push({ day: '2026-09-16' }, { day: '2026-09-16' });
    assert.equal(jobIndexFor(s, '2026-09-16'), 2);
    assert.equal(jobIndexFor(s, '2026-09-15'), 0);
    assert.equal(jobSeedFor(s, '2026-09-16', 2), `job|${s.profileId}|2026-09-16|2`);
    assert.notEqual(jobSeedFor(s, '2026-09-16', 2), jobSeedFor(s, '2026-09-16', 3));
  });

  test('shapeFor: a ready boss is a VAULT, a short sitting a RUN, a plan-sized queue a JOB12', () => {
    const plain = fresh(NOW);
    assert.equal(shapeFor(plain, { shape: 'RUN' }), 'RUN');
    assert.equal(shapeFor(plain, { short: true }), 'RUN');
    assert.equal(shapeFor(plain, { minutes: 7 }), 'RUN');
    assert.equal(shapeFor(plain, { queueLength: 12 }), 'JOB12');
    assert.equal(shapeFor(plain, { queueLength: 11 }), 'JOB');
    assert.equal(shapeFor(plain, {}), 'JOB');
    /* a ready boss outranks everything but an explicit shape */
    const boss = CORPUS.find(s => bossReady(s).length);
    assert.ok(boss, 'the corpus contains a save with a ready boss');
    assert.equal(shapeFor(boss, {}), 'VAULT');
    assert.equal(shapeFor(boss, { shape: 'JOB' }), 'JOB');
  });

  test('every contract row prints its own locks, grade band, posted and minutes', () => {
    for (const c of boardFor(8).contracts) {
      assert.match(c.line, /^[A-E]  \S+\s* · \d+ (cold )?locks · grade \d(–\d)? · posted \d+ · ~[\d.]+ min · \S+$/);
    }
  });

  /**
   * THE GRADE BAND IS THE COLUMN THE DRAFT IS DECIDED ON, and a mixed-tier contract must print it as
   * a band. Round 1 (player-feel) found every row on a real board reading "grade 1" while three of the
   * five held grade-3 locks — `site/js/screens/job.js:409` hand-builds the row from `b.grade` (the
   * MINIMUM tier) instead of the `gradeLabel` this file computes and `COPY.contractRow` already takes.
   * A grade-3 lock is 3 answer-minutes against a grade-1's 0.5, so the one column that makes a 3-of-5
   * draft a real choice was both constant and wrong. The board's own row (`line`) is right; the fix is
   * one line in the screen, which this lane does not own — notes/board-fix.md "Requests" #1.
   */
  test('a mixed-tier contract publishes the BAND, on the object and in the printed row', () => {
    const queue = [item('VOC', 1), item('VOC', 3), item('PAIRS', 2), item('PAIRS', 1),
      item('FAC2', 2), item('FAC2', 3), item('CS-LIN', 1), item('CS-LIN', 2),
      item('NOTE', 1), item('NOTE', 3), item('SYS', 2), item('SYS', 1)];
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(queue) });
    const mixed = b.bundles.filter(x => x.grade !== x.gradeHi);
    assert.ok(mixed.length >= 3, `only ${mixed.length} of ${b.bundles.length} contracts carry mixed tiers`);
    for (const x of mixed) {
      assert.equal(x.gradeLabel, `grade ${x.grade}–${x.gradeHi}`, `${x.id} prints a single grade for a band`);
      assert.notEqual(x.gradeLabel, `grade ${x.grade}`, `${x.id} reads "grade ${x.grade}" while holding a grade-${x.gradeHi} lock`);
      assert.equal(x.grade, Math.min(...x.targets.map(t => t.tier)));
      assert.equal(x.gradeHi, Math.max(...x.targets.map(t => t.tier)));
    }
    /* the board's own printed row carries the band — the screen has only to render it */
    const board = postBoard(fresh(NOW), '2026-09-16', { now: NOW, pageOverride: fakePage(queue) });
    const rows = board.contracts.filter(c => c.grade !== c.gradeHi);
    assert.ok(rows.length >= 3);
    for (const c of rows) assert.match(c.line, new RegExp(` · grade ${c.grade}–${c.gradeHi} · `));
  });

  test('a board whose pool is nothing but Variants is flagged as a dry board', () => {
    const queue = Array.from({ length: 6 }, (_, k) => ({
      ...item(['VOC', 'PAIRS'][k % 2], 1, 'weak'), kind: 'variant', isVariant: true,
      template: 'T-x', seed: `s${k}`,
    }));
    const b = postBoard(fresh(NOW), '2026-09-16', { now: NOW, pageOverride: fakePage(queue) });
    assert.equal(b.dry, true);
    assert.equal(b.dryLine, 'low-value board: variants only');
  });
});

/* ================================================================= 13. pricing */

describe('J5 / the posted value is econ.postedFor and nothing else', () => {
  test('every target\'s posted equals econ.postedFor of its own facts', () => {
    for (let i = 0; i < 20; i++) {
      const b = boardFor(i);
      for (const t of b.pool) {
        const expect = postedFor({
          tier: t.tier, scopeFlags: t.scopeFlags,
          bucket: t.bucket ?? undefined,
          overdueDays: t.bucket == null ? undefined : t.overdueDays,
          tell: t.tell,
        });
        assert.equal(t.posted, expect, `${t.id} posted`);
        assert.equal(t.minutes, LIMITS.minutesPerTier[t.tier]);
        assert.equal(t.wing, wingOf(t.skill));
      }
    }
  });

  test('a review pays scope 1.25, a Variant 0.8, a new card on a mastered make 0.5', () => {
    const s = fresh(NOW);
    s.skills.VOC = { m: 96, n: 8, lastAt: NOW - DAY_MS, lastDueCorrectAt: NOW - DAY_MS };
    const rev = jobTargetOf(review('VOC', 1, 4, 0), s, { now: NOW });
    assert.equal(rev.scopeFlags.isReview, true);
    const varItem = { ...item('VOC', 1, 'weak'), kind: 'variant', isVariant: true };
    assert.equal(jobTargetOf(varItem, s, { now: NOW }).scopeFlags.isVariant, true);
    assert.equal(jobTargetOf(item('VOC', 1, 'new'), s, { now: NOW }).scopeFlags.isMastered, true);
    assert.equal(jobTargetOf(item('PAIRS', 1, 'new'), s, { now: NOW }).scopeFlags.isMastered, false);
  });

  test('the board\'s tell defaults to none, and J7\'s tellFor is honoured when supplied', () => {
    const s = CORPUS[1];
    const plain = composeBundles(s, { now: NOW });
    const live = composeBundles(s, { now: NOW, tellFor: () => ({ triggered: 3, cleared: false, sealed: false }) });
    const a = plain.pool.reduce((t, x) => t + x.posted, 0);
    const bTot = live.pool.reduce((t, x) => t + x.posted, 0);
    assert.ok(bTot > a, 'a live tell did not raise the posted value');
    for (const t of plain.pool) assert.equal(t.tell, null);
  });

  test('the contract\'s posted is the sum of its locks, and the pool\'s minutes are the composer\'s', () => {
    for (let i = 0; i < 12; i++) {
      const b = boardFor(i);
      assert.equal(b.minutes, b.recommend.minutes, 'the board prints the DRAFTED minutes');
      assert.equal(b.recommend.minutes,
        Math.round(b.recommend.targets.reduce((s, t) => s + t.minutes, 0) * 10) / 10);
      for (const x of b.bundles) {
        assert.equal(x.minutes, Math.round(x.targets.reduce((s, t) => s + t.minutes, 0) * 10) / 10);
      }
    }
  });
});

/* ================================================================= 14. hygiene */

describe('J5 / hygiene', () => {
  test('job/board.js and the three page.js functions are DOM-free and import in plain node', async () => {
    const mod = await import('../site/js/job/board.js');
    for (const name of ['postBoard', 'draftFrom', 'declinePrice', 'buildJob', 'vaultFor']) {
      assert.equal(typeof mod[name], 'function', `board.js must export ${name}`);
    }
    assert.ok(mod.SHAPES, 'board.js re-exports SHAPES');
    assert.equal(typeof globalThis.document, 'undefined', 'the test runner grew a DOM');
  });

  test('a board composed twice from the same save and day is identical', () => {
    for (let i = 0; i < 10; i++) {
      const a = postBoard(CORPUS[i], '2026-09-16', { now: NOW });
      const b = postBoard(CORPUS[i], '2026-09-16', { now: NOW });
      assert.equal(JSON.stringify(a.bundles.map(x => x.locks)), JSON.stringify(b.bundles.map(x => x.locks)));
      assert.deepEqual(a.critical, b.critical);
      assert.deepEqual(a.x2.marks, b.x2.marks);
      assert.deepEqual(a.recommend.picks, b.recommend.picks);
    }
  });

  test('`today` may be passed as the second argument or inside opts', () => {
    const a = postBoard(CORPUS[0], '2026-09-16', { now: NOW });
    const b = postBoard(CORPUS[0], { now: NOW, today: '2026-09-16' });
    assert.equal(a.day, b.day);
    assert.equal(a.seed, b.seed);
  });

  test('no target is priced twice and the pool is a subset of the composed queue', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      const ids = b.pool.map(t => t.id);
      assert.equal(ids.length, new Set(ids).size, `save ${i}: a lock is in the pool twice`);
      const page = setOf(b.page.queue);
      for (const id of ids) assert.ok(page.has(id));
      assert.ok(b.pool.length <= b.page.queue.length);
    }
  });
});

/* ================================================================= 15. the envelope is still a Card */

describe('J5 / the drafted envelope is still exactly what run.js renders', () => {
  test('every composePage field survives the draft; only game fields are added', () => {
    const b = boardFor(11);
    const byId = new Map(b.page.queue.map(it => [it.id, it]));
    const added = new Set(['n', 'from', 'sources', 'wing', 'posted', 'x2', 'critical']);
    for (const it of b.recommend.queue) {
      const src = byId.get(it.id);
      assert.ok(src, `${it.id} is not a composed item`);
      for (const [k, v] of Object.entries(src)) {
        if (k === 'n') continue;                          // renumbered inside the job
        assert.deepEqual(it[k], v, `${it.id}.${k} was rewritten by the draft`);
      }
      for (const k of Object.keys(it)) {
        assert.ok(k in src || added.has(k), `${it.id} grew an unexpected field ${k}`);
      }
      assert.equal(it.done, false);
      assert.equal(it.result, null);
    }
    /* the queue is numbered 1..n, in order */
    b.recommend.queue.forEach((it, i) => assert.equal(it.n, i + 1));
  });

  test('a generated Variant keeps its template, seed and params, so it still replays', () => {
    let seen = 0;
    for (let i = 0; i < CORPUS.length && seen < 5; i++) {
      const b = boardFor(i);
      for (const it of b.recommend.queue) {
        if (!it.isVariant) continue;
        seen++;
        assert.equal(typeof it.template, 'string');
        assert.ok(it.seed != null);
        const src = b.page.queue.find(q => q.id === it.id);
        assert.equal(it.template, src.template);
        assert.equal(it.seed, src.seed);
        assert.deepEqual(it.params ?? null, src.params ?? null);
      }
    }
    assert.ok(seen >= 5, `only ${seen} Variants in the corpus drafts`);
  });
});

/* ================================================================= 16. wings, on made-to-order queues */

describe('J5 / the wing guarantees on synthetic queues', () => {
  const fourWings = () => [
    review('VOC', 1, 1, 3), review('NOTE', 1, 1, 2), review('CLASS', 1, 2, 1),
    item('PAIRS', 2), item('FIG-ALG', 2), item('SEG-ALG', 1),
    item('CS-LIN', 2), item('CS-RATIO', 2), item('CSARITH', 1),
    item('FAC2', 2), item('SYS', 2), item('QUAD-SOLVE', 1),
  ];

  test('a four-wing queue posts 5 contracts spanning all 4 wings; every draft spans ≥ 2', () => {
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(fourWings()) });
    assert.equal(b.posted, 5);
    assert.equal(b.draft, 3);
    assert.equal(new Set(b.bundles.flatMap(x => x.wings)).size, 4);
    assert.ok(b.wings.length >= 3, 'G3.4 needs ≥ 3 wings on the board');
    for (const p of legalDrafts(5, 3)) {
      const d = draftFrom(b.bundles, p);
      assert.ok(d.wings.length >= 2, `${p.join('')} spans ${d.wings.length} wing(s)`);
    }
  });

  test('the wing-purity repair fires: a RECALL-heavy queue never leaves 3 pure RECALL contracts', () => {
    const queue = [];
    for (let i = 0; i < 15; i++) queue.push(item(['VOC', 'NOTE', 'CLASS'][i % 3], 1));
    queue.push(item('PAIRS', 2), item('FIG-ALG', 2));
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(queue) });
    const pure = new Map();
    for (const x of b.bundles) if (x.wings.length === 1) pure.set(x.wings[0], (pure.get(x.wings[0]) ?? 0) + 1);
    for (const [w, n] of pure) assert.ok(n < b.draft, `${n} contracts are pure ${w}, a draft takes ${b.draft}`);
    for (const p of legalDrafts(b.posted, b.draft)) {
      assert.ok(draftFrom(b.bundles, p).wings.length >= 2, `${p.join('')} is a one-wing draft`);
    }
  });

  test('a genuinely one-wing queue degrades to a one-wing board rather than inventing a wing', () => {
    const queue = Array.from({ length: 12 }, (_, i) => item(['VOC', 'NOTE', 'CLASS'][i % 3], 1));
    const b = composeBundles(fresh(NOW), { now: NOW, page: fakePage(queue) });
    assert.deepEqual(b.wings, ['RECALL']);
    for (const p of legalDrafts(b.posted, b.draft)) {
      assert.deepEqual(draftFrom(b.bundles, p).wings, ['RECALL']);
    }
  });
});

/* ================================================================= 17. old saves */

describe('J5 / a v1 save (no player, no game) still gets a board', () => {
  test('postBoard, buildJob and vaultFor survive a save with the game keys missing', () => {
    const s = fresh(NOW);
    delete s.player; delete s.game;
    const b = postBoard(s, '2026-09-16', { now: NOW });
    assert.ok(b.posted > 0);
    assert.equal(b.projectionSource, 'projected');
    assert.equal(vaultFor(s, { now: NOW }), null);
    const g = buildJob(s, { board: b, now: NOW });
    assert.deepEqual(Object.keys(g).slice().sort(), IN_PROGRESS_KEYS.slice().sort());
    assert.equal(jobIndexFor(s, '2026-09-16'), 0);
  });
});

/* ================================================================= 18. the shape budget is kept */

describe('J5 / the draft lands on the shape it was budgeted for', () => {
  /**
   * ROUND 3 (board-schedule). G8's J5 row and §568 publish *"every legal draft serves the shape's
   * target count exactly (99.5 % of drafts; ±1 otherwise)"*. This test asserted `±3` and
   * `exact/total > 0.6`, over ONE shape (`boardFor` posts the default JOB) and fifty saves — a build
   * that hit the budget on 61 % of drafts with ±3 scatter passed it, and the published 99.5 % / ±1
   * was asserted nowhere in the suite.
   *
   * Measured here, per shape, over all four hundred saves × every legal draft (15 984 drafts):
   *
   *     RUN    want  6   96.70 % exact   deltas {0: 3864, +1: 132}
   *     JOB    want 10   99.25 % exact   deltas {−1: 6, 0: 3966, +1: 24}
   *     JOB12  want 12   96.37 % exact   deltas {−3: 6, −2: 20, −1: 110, 0: 3851, +1: 9}
   *     VAULT  want  7   97.82 % exact   deltas {0: 3909, +1: 87}
   *
   * No shape reaches 99.5 %, and JOB12 leaves ±1 on 26 drafts — down to −3 (save 90 serves 10
   * against a 12-target shape on every one of its ten drafts: a Page too thin to feed a 12-target
   * job). The deviations are benign for the student — a slightly shorter or longer job, and the
   * board prints the draft's own `minutes` — but the published precision is not reproducible, so
   * what is asserted below is the MEASURED distribution, per shape, at a floor a regression trips.
   * The document is a lane this file does not own: see notes/tests-fix.md round 3, Requests.
   */
  test('every legal draft lands on jobBudget(shape).targets at the rate each shape actually holds', () => {
    /** the floors are the measured rates minus room for the composer to move a draft or two */
    const FLOOR = { RUN: 0.955, JOB: 0.985, JOB12: 0.955, VAULT: 0.965 };
    /** the widest |delta| each shape produces, and the share allowed OUTSIDE the published ±1 */
    const SPREAD = { RUN: 1, JOB: 1, JOB12: 3, VAULT: 1 };
    const OUT1 = { RUN: 0, JOB: 0, JOB12: 0.02, VAULT: 0 };
    const seen = {};
    for (const shape of Object.keys(SHAPES)) {
      let exact = 0, total = 0, worst = 0, outside1 = 0;
      const hist = new Map();
      for (let i = 0; i < WIDE_N; i++) {
        const b = postBoard(wideSave(i), '2026-09-16', { now: NOW, shape });
        for (const d of b.drafts) {
          total++;
          const want = Math.min(b.budget.targets, b.pool.length);
          const delta = d.queue.length - b.budget.targets;
          hist.set(delta, (hist.get(delta) ?? 0) + 1);
          if (delta === 0) exact++;
          if (Math.abs(delta) > 1) outside1++;
          worst = Math.max(worst, Math.abs(delta));
          assert.ok(Math.abs(delta) <= SPREAD[shape],
            `${shape} save ${i} ${d.picks.join('')}: ${d.queue.length} targets against a ${b.budget.targets}-target shape`);
          assert.ok(d.queue.length >= want - SPREAD[shape],
            `${shape} save ${i} ${d.picks.join('')}: only ${d.queue.length} of a possible ${want}`);
        }
      }
      const rate = exact / total;
      const line = `${shape}: ${exact}/${total} exact (${(100 * rate).toFixed(2)} %), worst |delta| ${worst}, `
        + `${outside1} outside ±1 — ${JSON.stringify([...hist.entries()].sort((a, b2) => a[0] - b2[0]))}`;
      assert.ok(total >= 3900, `${shape}: only ${total} drafts`);
      assert.ok(rate >= FLOOR[shape], `${line} — below this shape's measured floor of ${FLOOR[shape]}`);
      assert.ok(outside1 / total <= OUT1[shape], `${line} — more drafts outside ±1 than this shape has ever produced`);
      seen[shape] = { rate: +rate.toFixed(4), worst, outside1 };
    }
    /* THE PUBLISHED SENTENCE, measured rather than repeated. Three of the four shapes hold ±1
       absolutely; JOB12 is the one that does not, and it is named here so the day the composer's
       `choicePer` / `coreN` learns to feed a thin Page, this assertion is what says so. */
    for (const shape of ['RUN', 'JOB', 'VAULT']) {
      assert.equal(seen[shape].worst <= 1, true, `${shape} left ±1: worst |delta| ${seen[shape].worst}`);
      assert.equal(seen[shape].outside1, 0, `${shape} put ${seen[shape].outside1} drafts outside ±1`);
    }
    assert.ok(seen.JOB12.outside1 > 0,
      'JOB12 now holds ±1 on every draft — raise its SPREAD to 1 and move it into the list above');
    assert.ok(Math.max(...Object.values(seen).map((x) => x.rate)) < 0.995,
      'a shape now reaches the published 99.5 % — re-measure every floor above and tell the document '
      + '(notes/tests-fix.md round 3, Requests: G8 J5 / §568 publish 99.5 % and ±1, which this build does not hold)');
  });

  test('a job never carries more tier-4 locks than the Page does (LIMITS.tier4 = 2)', () => {
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      assert.ok(b.page.queue.filter(it => it.tier >= 4).length <= LIMITS.tier4);
      for (const d of b.drafts) {
        assert.ok(d.queue.filter(it => it.tier >= 4).length <= LIMITS.tier4,
          `save ${i} ${d.picks.join('')}: too many tier-4 locks`);
      }
    }
  });
});
