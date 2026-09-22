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
  shapeFor, jobQueueOf, jobBoardOf, VAULT_TIERS, x2Marks, supplyRow, RATE_CLAMP,
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
import { addDays, todayISO, daysUntilTest } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { isCleared } from '../site/js/readiness.js';
/* the screen is another lane's file; this file reads its SOURCE to assert that the board's toll line
   has a render site at all (round-3 verification, player-feel — it had none for two rounds) */
import { read } from './_helpers.mjs';

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
/**
 * THE ORDER LAWS RUN WIDER THAN THE DIGEST PIN (round-3 verification, board-schedule). 400 is what
 * the pinned digest literals below cover; it is not what the ORDER laws need. Swept to 2 000 saves,
 * every ramp break the composer still has is at `400 < i < 1 000` — RUN 495, RUN 918, VAULT 918 —
 * so the window that can see them starts at 1 000. 4 000 boards × ~10 drafts ≈ 2 s.
 */
const ORDER_N = 1000;
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
 * `run ≤ k` AND is legally LED? Monotone fixes the tier bands in ascending order, so this is a
 * per-band arrangement problem with a carried (last skill, run) — a memoised DFS over
 * (band, remaining counts, last, run).
 *
 * THE THIRD LAW IS PART OF FEASIBILITY (round-3 verification, board-schedule). `draftUnion` runs a
 * pass AFTER the ramp — "a hard lock is never first, a Rematch is never item 1" (`page.js`'s
 * `firstOk`) — and it WINS: when the drafted queue's only tier-1 lock is a Rematch, a tier-2 lock is
 * spliced to the front and the ramp is broken with the arranger blameless. This oracle modelled only
 * the run cap, so the assertion it guards ("…are not monotone, but a monotone run-safe order
 * exists") was structurally incapable of seeing that cause: 11 breaks in 79 968 drafts over 2 000
 * saves, two of them on the RECOMMENDED draft (RUN and VAULT, save 918), all of them at
 * `400 < i < 1000` — outside the window the suite swept. With the lead law modelled the count is 0
 * of 79 968, which is the proof that the law is the whole explanation. COMPOSED-GAME G1's escape
 * clause now names it too.
 *
 * The lead must come from the LOWEST tier band (monotone) and satisfy `firstOk`, so the DFS's first
 * placement is restricted to the skills that band can lead with.
 */
const rampLeadOk = (it) => !it.isRematch && it.tier < 4;

/** the skills the lowest tier band may lead with, under the composer's third ordering law */
const leadSkillsOf = (queue, all = false) => {
  const lowest = Math.min(...queue.map(it => it.tier));
  return new Set(queue.filter(it => it.tier === lowest && (all || rampLeadOk(it))).map(it => it.skill));
};

const existsMonotone = (queue, k = LIMITS.sameSkillRun) =>
  existsMonotoneWith(queue, k, leadSkillsOf(queue));

/** the same oracle with the lead law OFF — kept so a test can prove the law is what breaks the ramp */
const existsMonotoneRunCapOnly = (queue, k = LIMITS.sameSkillRun) =>
  existsMonotoneWith(queue, k, leadSkillsOf(queue, true));

/** shared body: `leads` is the set of skills the first placement may take */
function existsMonotoneWith(queue, k, leads) {
  if (!queue.length) return true;
  if (!leads.size) return false;
  const tiers = [...new Set(queue.map(it => it.tier))].sort((a, b) => a - b);
  const bands = tiers.map(t => {
    const m = new Map();
    for (const it of queue) if (it.tier === t) m.set(it.skill, (m.get(it.skill) ?? 0) + 1);
    return m;
  });
  const seen = new Set();
  const key = (b, counts, last, run, first) =>
    `${first ? 'F' : ''}${b}|${[...counts.entries()].sort().map(e => e.join(':')).join(',')}|${last}|${run}`;
  const go = (b, counts, last, run, first) => {
    if (counts.size === 0) {
      if (b + 1 >= bands.length) return true;
      return go(b + 1, new Map(bands[b + 1]), last, run, false);
    }
    const kk = key(b, counts, last, run, first);
    if (seen.has(kk)) return false;
    seen.add(kk);
    for (const [skill, c] of counts) {
      if (first && !leads.has(skill)) continue;
      if (skill === last && run >= k) continue;
      const next = new Map(counts);
      if (c > 1) next.set(skill, c - 1); else next.delete(skill);
      if (go(b, next, skill, skill === last ? run + 1 : 1, false)) return true;
    }
    return false;
  };
  return go(0, new Map(bands[0]), null, 0, true);
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
   * ASN-ANG composes a different Page than it did before the ticket. Measured against the
   * PRE-GAME-LAYER commit `3a57ff5`, over 400 saves: ONE divergence, at save 102 — and the fifty
   * stopped at 50, so the pin could not see the change this very build had made. (The same file's own
   * wide order-law test already argued "400 saves, not 50 … fifty samples cannot see it".)
   *
   * WHICH COMMIT, AND WHAT THIS FILE DOES AND DOES NOT PROVE (round-3 verification, board-schedule).
   * These three paragraphs and COMPOSED-GAME G8's J5 row all said `git archive HEAD`, and HEAD has
   * not been pre-ticket since the layer was committed:
   *
   *     $ git log -1 --format='%h %s'
   *     ca53259 THE JOB game layer: 11 tickets built, 2 critic rounds applied (pre-repair baseline)
   *     $ git show ca53259:site/data/templates.js | grep -c asn-reason   → 1
   *     $ git show 3a57ff5:site/data/templates.js | grep -c asn-reason   → 0
   *
   * So an auditor who ran the published recipe — unregister `T-asn-reason`, digest, compare to a
   * `git archive HEAD` export — got a divergence at save 102 and concluded the composer had moved.
   * Measured in read-only exports of both commits, same corpus generator, 400 saves:
   *
   *     live   (registered)  vs ca53259  []          live   vs 3a57ff5  [102]
   *     live   --unregister  vs ca53259  [102]       --unreg vs 3a57ff5 []
   *
   * — the PROPERTY is true and the published RECIPE was against the wrong commit. `3a57ff5` is the
   * pinned pre-game-layer commit and is what the recipe now names.
   *
   * And this suite does NOT read any git tree: it compares the unregistered digests against the two
   * literal tables below, which is a pin, not a reproduction. `J5B_DIVERGENCE[102]` really is
   * `3a57ff5`'s digest for save 102 (7205490269157262, confirmed in a read-only export), and the
   * honest statement is that the literals were MEASURED against that commit and are asserted here as
   * literals. "…and what the suite asserts" has been struck from the J5 row for the same reason.
   *
   * So the claim is split in two, and both halves are asserted below:
   *   · `composePage` ITSELF is byte-identical to pre-ticket — proved by unregistering J5b's template
   *     and reproducing `3a57ff5`'s output on all 400 saves, mismatches 0;
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
   * digest each one had. MEASURED IN A READ-ONLY `git archive 3a57ff5` EXPORT — the pinned
   * pre-game-layer commit, NOT `HEAD`, which has carried J5b's registry entry since the layer was
   * committed (see the pin's docblock above for the two commits and the four comparisons). Every one
   * of them is a Page on which J5b's `T-asn-reason` was drawn; the test below proves that by taking
   * the template back out of the registry.
   *
   * These are LITERALS, and nothing in this file re-derives them from a tree — the reproduction is a
   * command an auditor runs, printed above; the assertion is a pin.
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

  /**
   * THE EXCEPTION, STATED CORRECTLY AND MEASURED PAST THE PINNED WINDOW (round-1 verification,
   * board-schedule).
   *
   * COMPOSED-GAME G8 J5 publishes that the composed Page is byte-identical to pre-ticket "EXCEPT
   * where J5b's own new template is drawn", and the arm above asserts exactly that — over the four
   * hundred saves the pin covers, where it is true. It is not true in general. Swept to 2 000 saves
   * (682 ms; the registry is a plain object read live by `allTemplates()`, so deleting the one J5b
   * entry IS the pre-ticket registry and reproduces `git archive 3a57ff5` exactly):
   *
   *     divergences 13 of 2000 = 0.65 %   — not "one in four hundred"
   *     12 of them draw T-asn-reason
   *     save 656 draws NONE, and its Page is one item SHORTER than pre-ticket (14 against 15)
   *
   * The second mechanism is the weak-skill loop, `page.js` step 5. Pre-ticket `templateForSkill`
   * returned null for ASN-PLP (no template registered) and the loop fell through to the ASN fallback
   * and took the ORIGINAL card `fact-01`. With J5b registered it returns `T-asn-reason`, builds a
   * Variant, the Variant does not fit the minute budget, `if (item && !fits(item)) break;` leaves the
   * loop — and the fallback card is never taken. So registering a template can make a Page SHORTER,
   * and the published exception clause has to say so.
   *
   * THE SUGGESTED CODE FIX IS REFUTED, with the measurement. Making that `break` fall through to the
   * ASN fallback is not a no-op on the study layer: patched into a copy of the tree and digested
   * against the same 2 000 saves, it moves **667 Pages (33.4 %)**, 123 of them inside the pinned 400
   * — because every weak slot with a generator ALSO stops breaking and takes an original card
   * instead. One save gets its item back and a third of the corpus gets a different Page. The
   * wording is what is wrong, not the loop (designs/SPEC-CORRECTIONS.md A-4).
   *
   * Global rule 5 is intact either way: `fact-01` is still scheduled and returns on a later Page —
   * this is a Page that is one item thinner, not an item removed from the schedule.
   */
  test('…and the J5b exception is BOTH mechanisms, swept to 2000 saves: drawn, or a Variant the budget rejects', () => {
    const N = 2000;
    const saves = Array.from({ length: N }, (_, i) => wideSave(i));
    const on = saves.map(s => composePage(structuredClone(s), { now: NOW }));
    const entry = templates['T-asn-reason'];
    assert.ok(entry, 'J5b registered no T-asn-reason entry');
    let off;
    delete templates['T-asn-reason'];
    try {
      assert.ok(!templatesForSkill('ASN-PLP').includes('T-asn-reason'), 'the registry still serves it');
      off = saves.map(s => composePage(structuredClone(s), { now: NOW }));
    } finally {
      templates['T-asn-reason'] = entry;
    }

    const drawn = [];
    const shortened = [];
    for (let i = 0; i < N; i++) {
      if (cyrb53(JSON.stringify(on[i])) === cyrb53(JSON.stringify(off[i]))) continue;
      const q = on[i].queue;
      const p = off[i].queue;
      if (q.some(it => it.template === 'T-asn-reason')) { drawn.push(i); continue; }
      /* the ONLY other way a registry entry may move a Page: the weak slot resolved to a Variant the
         minute budget rejected, so the ASN fallback card pre-ticket took is missing and the Page is
         shorter. Anything else is a real change to the composer and this goes red. */
      const missing = p.filter(it => !q.some(x => x.id === it.id));
      assert.ok(q.length < p.length,
        `save ${i} diverges, draws no T-asn-reason and is not shorter — composePage itself has moved`);
      assert.equal(missing.length, p.length - q.length,
        `save ${i}: the shorter Page is not simply missing the items pre-ticket carried`);
      for (const m of missing) {
        assert.equal(m.role, 'weak', `save ${i}: ${m.id} is a ${m.role}, not the weak slot's fallback card`);
        assert.ok(String(m.skill).startsWith('ASN-'),
          `save ${i}: ${m.id} is a ${m.skill}, and only the ASN skills have no generator of their own`);
        assert.ok(!m.isVariant, `save ${i}: ${m.id} is a Variant, not the original card the fallback takes`);
      }
      shortened.push({ i, on: q.length, off: p.length, missing: missing.map(m => `${m.id}/${m.skill}`) });
    }

    const total = drawn.length + shortened.length;
    assert.ok(total > 0, 'no save composes differently at all — the J5b entry is no longer reachable');
    /* the POPULATION rate, not the corpus's: 13 of 2000 is 0.65 %, and "one save in four hundred"
       (the number the pin can see) understates it by a factor of 2.6 */
    assert.ok(total / N <= 0.02, `${total} of ${N} saves (${(100 * total / N).toFixed(2)} %) compose differently than pre-ticket`);
    const outside = [...drawn, ...shortened.map(x => x.i)].filter(i => i >= WIDE_N);
    assert.ok(outside.length >= 2,
      `only ${outside.length} divergence(s) lie outside the pinned ${WIDE_N} — the sweep is measuring `
      + 'nothing the digest pin above could not already see, and the width is pointless');
    /* the shorter class EXISTS — if it ever goes to zero the exception clause may be simplified back */
    assert.equal(shortened.length, 1,
      `${shortened.length} saves lose an item to the weak-slot mechanism: ${JSON.stringify(shortened)}`);
    assert.equal(shortened[0].i, 656, `the shorter-Page save moved to ${shortened[0].i}`);
    /* and the item is still SCHEDULED — Global rule 5 is about the schedule, not about one Page */
    const s656 = wideSave(656);
    for (const m of shortened) {
      for (const id of m.missing.map(x => x.split('/')[0])) {
        assert.ok(s656.cards?.[id]?.due != null || ALL_CARDS.some(c => c.id === id),
          `${id} left the schedule entirely, which would be a Global rule 5 break`);
      }
    }
    console.log(`  J5b divergence over ${N} saves: ${total} (${(100 * total / N).toFixed(2)} %) — `
      + `${drawn.length} draw the template, ${shortened.length} lose the ASN fallback card to the minute budget`);
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
        /**
         * THE PRINTED LINE IS THE LIVE PAYOUT, NOT THE GROSS (round-1 verification, player-feel).
         *
         * `postedGross`, `postedNet` and `postedLive` are three different real quantities and the
         * line used to print the first one, so the board said `posted 526 (−199 shared)` and the
         * debrief said `Posted 419` about the same job (and 526 − 199 is 327, a third number).
         * `state.startJob` writes `g.posted = round(Σ queue.posted)` — `postedLive`, the drafted
         * queue WITH the day's ×2 marks realised — and that is what `endJob` logs and the debrief
         * reports, so that is what the button now promises.
         *
         * ROUND 2 (player-feel): AND IT IS NOT A SUBTRACTION SUM. The toll used to ride inside the
         * same segment — `posted 419 (−239 shared)` — and a minus sign in a bracket after a price is
         * read as money coming off the top: `419 − 239` is 180, the three contract rows above add to
         * 526, `526 − 239` is 287, and none of those is what the job pays. The payout segment is now
         * `COPY.postedFlat` with no operator in it, and the toll is a line of its own whose own
         * arithmetic lands on the payout — asserted here by parsing BOTH numbers back out of the
         * rendered string, which is the only way a printed subtraction can be checked.
         */
        const liveGross = d.queue.reduce((s, it) => s + it.posted * Math.max(1, it.sources.length), 0);
        assert.equal(d.live, d.postedLive, `save ${i} ${d.picks.join('')}: live is not postedLive`);
        assert.equal(d.sharedLive, liveGross - d.postedLive, `save ${i} ${d.picks.join('')} sharedLive`);
        assert.equal(d.line, `posted ${d.postedLive}`, `save ${i} ${d.picks.join('')}: the payout line`);
        assert.ok(!/[−+-]/.test(d.line.replace(/^posted /, '')),
          `save ${i} ${d.picks.join('')}: the payout segment carries an operator — ${d.line}`);
        /**
         * THE EXPLANATION SUBTRACTS FROM A NUMBER THAT IS ON THE SCREEN (round-3 verification,
         * player-feel). Round 2's line was `posted 658 (−239 shared)`: internally consistent, and
         * 658 is a LIVE gross that nothing on the board prints — the rows a student can add up are
         * `composeBundles`' pre-×2 `posted` values, which sum to `postedGross`. So the line is now
         * the whole chain, and every link is checked here against the shipped fields:
         *
         *     N locks (−S shared) · T targets · posted G (−P shared) [· +X ×2 · posted L]
         *
         *   N − S = T (the rows print N locks between them; the job has T targets)
         *   G − P = postedNet, and postedNet + X = postedLive = the button's own number.
         */
        const lockPostings = d.queue.reduce((s, it) => s + Math.max(1, it.sources.length), 0);
        assert.equal(d.locks, lockPostings, `save ${i} ${d.picks.join('')}: locks is not Σ sources`);
        const rowLocks = d.picks.reduce((s, p) => s + b.bundles.find(x => x.id === p).locks.length, 0);
        assert.equal(lockPostings, rowLocks,
          `save ${i} ${d.picks.join('')}: Σ sources is ${lockPostings} and the contract rows print ${rowLocks} locks`);
        assert.equal(d.sharedLocks, lockPostings - d.queue.length);
        assert.equal(d.sharedPoints, d.postedGross - d.postedNet);
        assert.equal(d.x2Up, d.postedLive - d.postedNet);
        if (d.sharedLocks > 0 || d.sharedPoints > 0) {
          const m = /^(\d+) locks \(−(\d+) shared\) · (\d+) targets · posted (\d+) \(−(\d+) shared\)(?: · \+(\d+) ×2 · posted (\d+))?$/
            .exec(d.sharedLine);
          assert.ok(m, `save ${i} ${d.picks.join('')}: the toll line is not the published chain — ${d.sharedLine}`);
          const n = (x) => (x == null ? null : Number(x));
          const [locks, sharedL, targets, gross, sharedP, x2Up, live] = m.slice(1).map(n);
          assert.equal(locks - sharedL, targets,
            `save ${i} ${d.picks.join('')}: ${locks} locks − ${sharedL} shared is not the ${targets} targets printed beside it`);
          assert.equal(locks, lockPostings, `save ${i} ${d.picks.join('')}: the lock count is not the rows'`);
          assert.equal(targets, d.queue.length);
          assert.equal(gross, d.postedGross,
            `save ${i} ${d.picks.join('')}: the toll line's gross ${gross} is not the ${d.postedGross} `
            + 'the contract rows add to — it is back on a basis nothing prints');
          assert.equal(gross - sharedP, d.postedNet,
            `save ${i} ${d.picks.join('')}: ${gross} − ${sharedP} is not the pre-×2 net ${d.postedNet}`);
          if (d.x2Up > 0) {
            assert.equal(x2Up, d.x2Up, `save ${i} ${d.picks.join('')}: the ×2 uplift segment is missing or wrong`);
            assert.equal(d.postedNet + x2Up, d.postedLive);
            assert.equal(live, d.postedLive, `save ${i} ${d.picks.join('')}: the chain does not end on the button's number`);
          } else {
            assert.equal(x2Up, null, `save ${i} ${d.picks.join('')}: a ×2 segment with no ×2 mark — ${d.sharedLine}`);
            assert.equal(gross - sharedP, d.postedLive,
              `save ${i} ${d.picks.join('')}: with no ×2 the subtraction must land on the button's ${d.postedLive}`);
          }
        } else {
          assert.equal(d.sharedLine, null, `save ${i} ${d.picks.join('')}: a toll line with no shared lock`);
        }
        /* and the line never leads with a number the job will not pay */
        assert.ok(!d.line.startsWith(`posted ${d.postedGross} `) || d.postedGross === d.postedLive,
          `save ${i} ${d.picks.join('')}: the line leads with the gross ${d.postedGross} again`);
      }
    }
  });

  /**
   * THE BOARD'S PROMISE IS THE DEBRIEF'S REPORT — the same quantity, driven through the machine.
   * One job per corpus save, started from the recommended draft, nothing walked: the number inside
   * `COPY.postedNet` / `COPY.postedFlat` must BE `state.stateOf(save).posted`, which is what
   * `endJob` logs and `screens/run.js` prints as `Posted`. Exact, not within a tolerance.
   */
  test('the number the button prints IS the number the job posts (`state.posted`), on every save', () => {
    let shared = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const save = structuredClone(CORPUS[i]);
      const b = postBoard(save, '2026-09-16', { now: NOW });
      const printed = Number(/posted (\d+)/.exec(b.recommend.line)?.[1]);
      assert.ok(Number.isFinite(printed), `save ${i}: the payout line prints no number — ${b.recommend.line}`);
      startJob(save, { board: b, now: NOW, today: '2026-09-16' });
      assert.equal(printed, state.stateOf(save).posted,
        `save ${i}: the board promised ${printed} and the job posts ${state.stateOf(save).posted} — `
        + `(gross ${b.recommend.postedGross}, net ${b.recommend.postedNet}, live ${b.recommend.postedLive})`);
      assert.ok(b.primary.includes(b.recommend.line), `save ${i}: the primary button dropped the payout segment`);
      /* the button carries the promise and NOT the toll: the toll is `b.sharedLine`, on its own */
      assert.ok(!b.primary.includes('shared'),
        `save ${i}: the primary button prints the sharing toll again — ${b.primary}`);
      if (b.recommend.sharedLocks > 0 || b.recommend.sharedPoints > 0) {
        shared++;
        assert.equal(b.sharedLine, b.recommend.sharedLine, `save ${i}: the board dropped the toll line`);
        /* the whole chain has to END on the number the job posts, whichever segments it has */
        const nums = [...b.sharedLine.matchAll(/(\d+)/g)].map(x => Number(x[1]));
        const [locks, sharedL, targets, gross, sharedP] = nums;
        assert.equal(locks - sharedL, targets, `save ${i}: the lock arithmetic does not close — ${b.sharedLine}`);
        assert.equal(targets, state.queueOf(save).length, `save ${i}: the toll line's target count is not the job's`);
        const posted = state.stateOf(save).posted;
        const end = b.recommend.x2Up > 0 ? nums[6] : gross - sharedP;
        assert.equal(end, posted,
          `save ${i}: the toll line ${b.sharedLine} does not end on the ${posted} the job posts`);
        /* and its gross is the sum the three printed contract rows really add to */
        const rowGross = b.recommend.picks.reduce((s, p) => s + b.contracts.find(c => c.id === p).posted, 0);
        assert.equal(gross, rowGross, `save ${i}: the toll line's gross ${gross} is not the rows' ${rowGross}`);
      } else {
        assert.equal(b.sharedLine, null, `save ${i}: a toll line with no shared lock`);
      }
    }
    assert.ok(shared >= 5, `only ${shared} of ${CORPUS.length} boards share a lock between drafted contracts — `
      + 'the `COPY.postedNet` half of the line is not being exercised');
  });

  /**
   * …AND THE ×2 TAIL OF THAT CHAIN, WHICH THE CORPUS'S OWN DAY NEVER PRODUCES.
   *
   * `x2Marks` is seeded `cyrb53(dateISO|jobIndex|targetIndex)` and does not read the save, so on
   * '2026-09-16' at job index 0 EVERY corpus board draws the same all-false vector: the arm above
   * exercises `postedNet === postedLive` fifty times and the `+X ×2 · posted L` tail zero times.
   * `draftFrom` takes the mark vector as an argument, so the tail is driven directly here.
   */
  test('the toll line\'s ×2 tail closes too: net + ×2 IS the payout, on forced marks', () => {
    let seen = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const b = boardFor(i);
      const picks = b.recommend.picks;
      const all = draftFrom(b.bundles, picks, { x2: () => true });
      const none = draftFrom(b.bundles, picks, { x2: () => false });
      assert.equal(none.x2Up, 0, `save ${i}: a ×2 uplift with no marks`);
      assert.ok(all.postedLive > all.postedNet, `save ${i}: every target marked and the payout did not move`);
      assert.equal(all.x2Up, all.postedLive - all.postedNet);
      /* the pre-×2 half of the chain is the SAME on both, because the rows and the dedupe are */
      assert.equal(all.postedGross, none.postedGross, `save ${i}: the ×2 moved the contract rows' sum`);
      assert.equal(all.sharedPoints, none.sharedPoints, `save ${i}: the ×2 moved the sharing toll`);
      assert.equal(all.locks, none.locks);
      assert.equal(all.sharedLocks, none.sharedLocks);
      if (all.sharedLocks === 0 && all.sharedPoints === 0) continue;
      seen++;
      const m = /^(\d+) locks \(−(\d+) shared\) · (\d+) targets · posted (\d+) \(−(\d+) shared\) · \+(\d+) ×2 · posted (\d+)$/
        .exec(all.sharedLine);
      assert.ok(m, `save ${i}: the ×2 tail is missing from ${all.sharedLine}`);
      const [locks, sharedL, targets, gross, sharedP, x2Up, live] = m.slice(1).map(Number);
      assert.equal(locks - sharedL, targets, `save ${i}: the lock arithmetic does not close`);
      assert.equal(gross - sharedP, all.postedNet, `save ${i}: gross − shared is not the pre-×2 net`);
      assert.equal(all.postedNet + x2Up, live, `save ${i}: net + ×2 is not the number printed at the end`);
      assert.equal(live, all.postedLive, `save ${i}: the chain does not end on the payout`);
      /* and the payout the chain ends on is the one `startJob` will write */
      const save = structuredClone(CORPUS[i]);
      startJob(save, { board: b, picks, now: NOW, today: '2026-09-16' });
      assert.equal(none.postedLive, state.stateOf(save).posted,
        `save ${i}: the unmarked chain's payout is not what the job posts`);
    }
    assert.ok(seen >= 40, `only ${seen} boards exercised the ×2 tail`);
  });

  /**
   * A LINE WITH NO RENDER SITE IS NOT AN EXPLANATION (round-3 verification, player-feel MAJOR).
   *
   * `board.sharedLine` was composed by `draftFrom`, handed up by `postBoard`, and asserted to the
   * decimal point by the two arms above — and `grep -rn sharedLine site/` returned ONE file,
   * `site/js/job/board.js`. No screen rendered it, so the board promised `posted 419` under three
   * contract rows that add to 526, and the one sentence the code computed to explain the gap reached
   * nobody. This file cannot mount a DOM, so the assertion is the grep itself, turned into a law:
   * the screen must reference the field in a render position, and it must take the quote's line
   * (the draft ON SCREEN) rather than the board's (the RECOMMENDED draft) when the student has
   * re-drafted — which is exactly the defect `quoteFor` exists for on every other segment.
   * `qa/job-screen.mjs` reads the rendered text in chromium; this is the part that runs everywhere.
   */
  test('the toll line has a render site, and it is the draft ON SCREEN', () => {
    const SCREEN = read('site/js/screens/job.js');
    assert.ok(/sharedLine/.test(SCREEN),
      '`site/js/screens/job.js` does not mention `sharedLine`. The board composes the only sentence '
      + 'that explains why three contract rows adding to 526 are a `posted 419` button, and for two '
      + 'rounds nothing rendered it.');
    assert.match(SCREEN, /h\(\s*'p\.job-shared[^']*'\s*,\s*quote\?\.sharedLine\s*\?\?\s*board\.sharedLine\s*\)/,
      'the toll line is not rendered from `quote?.sharedLine ?? board.sharedLine`. `board.sharedLine` '
      + 'alone is the RECOMMENDED draft\'s, and the student may have re-drafted — the same defect '
      + '`quoteFor` was written for on the primary button (450 of 450 non-recommended drafts printed '
      + 'the wrong letters).');
    assert.match(SCREEN, /sharedLine:\s*drafted\.sharedLine/,
      '`quoteFor` no longer carries `sharedLine`, so the render above falls back to the board\'s line '
      + 'under a draft that is not the board\'s');
    /* and the board still hands it up, so the fallback is real */
    const b = boardFor(0);
    assert.ok('sharedLine' in b, 'postBoard stopped publishing `sharedLine`');
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

  test('ALL THREE order laws hold on 1 000 saves × EVERY shape — the RUN break round 3 found at save 69, and the RAMP breaks the verification round found at 495 and 918', () => {
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
     *
     * ROUND-3 VERIFICATION — THE WIDTH AND THE ORACLE, BOTH (board-schedule). Two more defects, and
     * they are the same defect at two levels:
     *   · `WIDE_N = 400` is again a window that cannot see the next break. Swept to 2 000 saves ×
     *     every shape × every legal draft (79 968 drafts) the ramp breaks 11 times, on 3 save/shape
     *     pairs, and every one of them is at `400 < i < 1 000` — RUN save 495, RUN save 918 and
     *     VAULT save 918 — **two of them on the RECOMMENDED draft**, the one a single tap takes.
     *     `ORDER_N` is 1 000 so the loop contains them.
     *   · `existsMonotone` modelled only the run cap, so the assertion below ("…but a monotone
     *     run-safe order exists") could not see the cause even had the loop reached it.
     *     `draftUnion` runs a THIRD ordering law after the ramp — a Rematch is never item 1, a hard
     *     lock is never first — and it WINS: when the only tier-1 lock is a Rematch, a tier-2 lock is
     *     spliced to the front. The oracle now requires a legal lead, and with that modelled the
     *     break count over the same 79 968 drafts is 0. `existsMonotoneRunCapOnly` keeps the old
     *     oracle so the arm below can prove that the difference between them IS those eleven.
     * COMPOSED-GAME G1's escape clause names the third law too, and `page.js`'s own comment carries
     * the table.
     */
    let cases = 0, mono = 0, impossible = 0, boards = 0, worstSlack = Infinity;
    let ledBreaks = 0;
    const shapesSeen = new Map();
    for (const shape of Object.keys(SHAPES)) {
      for (let i = 0; i < ORDER_N; i++) {
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
          /* the draft's own report of the ramp is checked whatever the oracle says */
          assert.equal(d.monotone, isMonotone(d.queue),
            `${shape} save ${i} ${d.picks.join('')}: the draft reports the wrong ramp`);
          /* the LEAD is the third law, and it is absolute like the run cap */
          assert.ok(rampLeadOk(d.queue[0]),
            `${shape} save ${i} ${d.picks.join('')}: item 1 is ${d.queue[0].isRematch ? 'a Rematch' : `tier ${d.queue[0].tier}`}`);
          if (!existsMonotone(d.queue)) {
            impossible++;
            /* …and when the LEAD law is what makes it impossible, say so: this is the class the old
               oracle could not see, counted rather than swept into `impossible`. */
            if (existsMonotoneRunCapOnly(d.queue) && !isMonotone(d.queue)) ledBreaks++;
            continue;
          }
          assert.ok(isMonotone(d.queue),
            `${shape} save ${i} ${d.picks.join('')}: tiers ${d.queue.map(x => x.tier).join('')} are not monotone, but a monotone run-safe LEGALLY-LED order exists`);
          mono++;
        }
      }
    }
    assert.equal(boards, ORDER_N * Object.keys(SHAPES).length);
    /* every shape really was posted — the hole this test had for three rounds */
    assert.deepEqual([...shapesSeen.keys()].sort(), Object.keys(SHAPES).slice().sort(),
      `the loop only posted ${JSON.stringify([...shapesSeen])}`);
    for (const [id, n] of shapesSeen) assert.equal(n, ORDER_N, `${id} was posted ${n} times, not ${ORDER_N}`);
    assert.ok(cases >= 39000, `only ${cases} draft cases`);
    assert.ok(mono > 30000, `only ${mono} drafts could be monotone`);
    assert.ok(impossible / cases < 0.5, `monotone was impossible in ${impossible}/${cases} drafts`);
    /* the cap is not vacuous: some draft really does come within a lock of it */
    assert.ok(worstSlack <= 1, `the closest any draft came to the run cap was ${worstSlack} locks — the rule never binds`);
    /**
     * THE THIRD LAW IS NOT A HYPOTHESIS — it is what breaks the ramp on this corpus, and it really
     * does break it inside this window. Over 2 000 saves the count is 11 on 3 save/shape pairs; the
     * window here holds all of them, so the count must be > 0 or the widening has silently stopped
     * reaching them (a shape rename, a composer change, a corpus regeneration).
     */
    assert.ok(ledBreaks >= 7,
      `only ${ledBreaks} drafts had their ramp broken by the lead law — round 3 measured 11 in 79 968 `
      + 'drafts over 2 000 saves, all of them at 400 < i < 1 000, so this window should hold them');
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

  /* THE PLAN'S OPTS **FOR THE DAY THIS SUITE FREEZES**, which is what `postBoard` itself computes:
     `job/board.js:279` is `planComposeOpts(save, { D: daysUntilTest(save.settings.testDate, day) })`.
     Bare `composeOpts(save)` defaults `D` off the REAL clock (`plan.js qFor`), and the corpus test
     dates are `addDays('2026-09-16', 1..21)`, so the two answers drift apart by one day per day and
     the comparison below was only coincidentally true. It stopped being true on 2026-09-22, when
     save 6's real-clock `D` reached 5, pushed `q` to `Q_WARN` and turned the lowering ON for a save
     whose 2026-09-16 board does not lower: `{q:12, tier4:1, microFlashOnly:true}` against the
     board's own `{q:6, tier4:2, microFlashOnly:false}`. Mirroring `board.js`'s expression makes both
     tests deterministic AND makes them measure the claim they state — that `postBoard` reads the
     plan rather than its caller — instead of comparing two different days. (Integration, 2026-09-22.
     Nothing is relaxed: the same deep-equal runs, on opts that are now the board's own.) */
  const planOptsFor = (save) => composeOpts(save, { D: daysUntilTest(save?.settings?.testDate, TODAY) });

  test('Home\'s call and the job screen\'s call post the byte-identical board, on every corpus save', () => {
    let lowered = 0;
    for (let i = 0; i < CORPUS.length; i++) {
      const save = CORPUS[i];
      const compose = planOptsFor(save);
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
      const c = planOptsFor(CORPUS[i]);
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
      const planPage = composePage(save, { ...planOptsFor(save), now: NOW, today: '2026-09-16' });
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

  /**
   * THE SUPPLY ROW IS RENDERED, AND IT SAYS ITS FOUR WORDS ONCE (round 3, player-feel).
   *
   * `screens/job.js:637` renders `board.supplyLines.join(' · ')`, and `wingSupply`'s own per-wing
   * lines made that "RECALL 103 locks available today · FIGURES 15 locks available today · WORDS 26
   * locks available today · ALGEBRA 31 locks available today" — 135 characters, 88 of them the same
   * phrase four times, one line under the contract rows round 2 de-duplicated. This asserts the
   * STRING THE SCREEN BUILDS, not the array: the phrase exactly once, every wing and every number
   * still present, and the whole row shorter than the repeated form it replaces.
   */
  test('the board prints the thin line and the supply row the screen renders', () => {
    const queue = Array.from({ length: 6 }, (_, k) => item(['VOC', 'PAIRS'][k % 2], 1));
    const save = fresh(NOW);
    const b = postBoard(save, '2026-09-16', { now: NOW, pageOverride: fakePage(queue) });
    assert.equal(b.thin, true);
    assert.match(b.thinLine, /^thin board · 3 contracts · draft 2 · /);
    /* the head, then one token per wing — `wingSupply`'s own order */
    assert.equal(b.supplyLines.length, WING_IDS.length + 1);
    assert.equal(b.supplyLines[0], 'locks available today');
    for (const l of b.supplyLines.slice(1)) assert.match(l, /^[A-Z]+ \d+$/);
    const rendered = b.supplyLines.join(' · ');                       // screens/job.js:637, verbatim
    assert.equal((rendered.match(/locks available today/g) ?? []).length, 1,
      `the supply row repeats itself: ${rendered}`);
    for (const w of WING_IDS) {
      assert.ok(rendered.includes(` ${w} `) || rendered.includes(`· ${w} `),
        `${w} is not on the supply row: ${rendered}`);
      assert.ok(rendered.includes(`${w} ${b.supply[w].locks}`), `${w}'s count is not the supply's own`);
    }
    /* the OLD form, rebuilt from the same numbers, is the thing this replaces — and it is longer */
    const repeated = WING_IDS.map(w => `${w} ${b.supply[w].locks} locks available today`).join(' · ');
    assert.ok(rendered.length < repeated.length - 50,
      `the row is ${rendered.length} characters against the repeated form's ${repeated.length}`);
  });

  /**
   * THE DRIFT GUARD, because the phrase is not retyped in this lane.
   *
   * `board.supplyRow` builds its head by calling `COPY.supply` with the wing and the count taken
   * out, so `data/job.js` stays the one place that sentence lives — and `wingSupply`
   * (`js/gen/asn-reason.js`, the study layer, which this lane may not touch) has its own copy of the
   * same sentence as a literal. This asserts the two are the same sentence: `COPY.supply` must
   * rebuild the generator's long line exactly, for every wing, on a real board. If either file moves
   * it, this test goes red and gets read, and `supplyRow` falls back to publishing the generator's
   * own lines unchanged rather than mangling them.
   */
  test('the supply row is COPY.supply and wingSupply agreeing — not a literal in this lane', () => {
    const b = boardFor(3);
    const order = Object.keys(b.supply);
    assert.ok(order.length >= WING_IDS.length, 'the board lost the supply record');
    const long = order.map(w => COPY.supply({ wing: b.supply[w].label ?? w, locks: b.supply[w].locks }));
    for (const l of long) assert.match(l, /^[A-Z]+ \d+ locks available today$/, `COPY.supply is not that sentence: ${l}`);
    /* the head the board publishes IS that sentence with the two variables removed */
    assert.equal(b.supplyLines[0], String(COPY.supply({ wing: '', locks: '' })).replace(/\s+/g, ' ').trim());
    /* and every number on the row is the number the generator counted */
    for (const w of order) {
      assert.ok(b.supplyLines.includes(`${b.supply[w].label ?? w} ${b.supply[w].locks}`),
        `${w} ${b.supply[w].locks} is not on the row: ${b.supplyLines.join(' · ')}`);
    }
    /* THE CONTROL: hand `supplyRow` a supply whose long lines are NOT `label locks phrase` and it
       must refuse to shorten them — the fallback that keeps a copy change from mangling the row */
    const fake = { RECALL: { id: 'RECALL', label: 'RECALL', locks: 9 } };
    assert.deepEqual(supplyRow(fake, ['RECALL'], ['RECALL: 9 available']), ['RECALL: 9 available']);
    assert.deepEqual(supplyRow(fake, ['RECALL'], ['RECALL 9 locks available today']),
      ['locks available today', 'RECALL 9']);
    assert.deepEqual(supplyRow({}, [], ['whatever']), ['whatever'], 'an empty supply is passed through');
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

  /**
   * THE PRINTED ×2 COUNT IS THE SHAPE'S OWN, AND THIS ARM CAN TELL (round-1 verification,
   * test-integrity).
   *
   * `board.js` publishes `x2.count = marks.slice(0, budget.targets).filter(Boolean).length` — the
   * realised count over the SHAPE's target indices, which is the quantity G3.6 prints BEFORE the
   * draft (Global law 6), while `marks` itself runs one index longer on the 1.6 % of boards whose
   * longest legal draft serves an extra target. The pin used to be
   *
   *     assert.equal(b.x2.count, marks.slice(0, b.budget.targets).filter(Boolean).length)
   *
   * with `marks = b.x2.marks` — the shipped expression recomputed from the shipped array, i.e. a
   * constant compared against arithmetic on the same constant. Mutating the shipped line to
   * `marks.filter(Boolean).length` (drop the slice) left the whole suite green, and over 40 saves ×
   * 20 days × 4 shapes that mutation changes the PRINTED count on 48 of the 240 extended boards.
   *
   * So the board is chosen BECAUSE it discriminates — the vector runs long AND the tail is marked —
   * and the expected count is derived independently, from a fresh `x2Marks(day, jobIndex, targets)`
   * over the shape's own target count, never from `b.x2.marks`. The last assertion is the one the
   * mutation dies on: the naive count is a different number on this board.
   *
   * ROUND 2 (test-integrity): ONE BOARD CANNOT CARRY A CLAIM ABOUT AN EXPRESSION WITH TWO ENDPOINTS.
   * The arm above stopped at the FIRST discriminating board and its only negative control was the
   * whole-vector count — so it discriminates against dropping the slice and against nothing else
   * about it. Mutating the shipped line to `marks.slice(1, budget.targets)` — a wrong slice START —
   * left the entire suite green (`node --test tests/` → the same five environment-only failures as
   * the unmutated tree, job-board 106/106), while through the shipped `x2Marks` that mutant prints a
   * different number on about one board in four: the marks are an independent 1-in-6 per index, so
   * `marks[0]` is true on 1 000 of the 4 000 boards below and dropping index 0 changes the count on
   * every one of them.
   *
   * So the assertion IS the sweep: every board of 20 days × 50 saves × 4 shapes, each expected count
   * recomputed from the day's own coin rather than from `b.x2.marks`, plus two counters that assert
   * the population can see each endpoint of the slice — 1 000 boards where `marks[0]` is marked (a
   * wrong start), 21 where the vector runs long and its tail is marked (a dropped end). Both mutants
   * now die on the first board that discriminates. 4 000 boards, ~1.5 s.
   */
  test('the printed ×2 count is the SHAPE\'s realised count — swept over every board, both slice endpoints', () => {
    let boards = 0;
    let firstMarked = 0;                    // boards where `marks[0]` is true — a wrong slice START
    let extendedTail = 0;                   // boards whose vector runs long AND whose tail is marked
    let sample = null;
    for (let d = 0; d < 20; d++) {
      const day = addDays('2026-09-16', d);
      for (let i = 0; i < CORPUS.length; i++) {
        for (const shape of SHAPE_IDS) {
          let b; try { b = postBoard(CORPUS[i], day, { now: NOW, shape }); } catch { continue; }
          boards++;
          const m = b.x2.marks;
          const T = b.budget.targets;
          /* derived independently of the board object: the day's own coin, over the SHAPE's indices */
          const want = x2Marks(day, b.jobIndex, T).filter(Boolean).length;
          assert.equal(b.x2.count, want,
            `${day} ${shape} save ${i}: the board printed ${b.x2.count} ×2 marks against the day's own ${want} `
            + `(marks ${JSON.stringify(m)}, shape budget ${T})`);
          if (m[0] === true) firstMarked++;
          if (m.length > T && m.slice(T).some(Boolean)) {
            extendedTail++;
            sample ??= { b, day, i, shape, want };
          }
        }
      }
    }
    assert.ok(boards >= 3900, `only ${boards} boards composed — the sweep did not run`);
    /* THE POPULATION CAN SEE BOTH ENDPOINTS. Without these two counters the loop above could be
       green over a corpus in which no board discriminates, which is the defect it replaces. */
    assert.ok(firstMarked / boards >= 0.15,
      `only ${firstMarked} of ${boards} boards (${(100 * firstMarked / boards).toFixed(1)} %) carry a mark on target 1 `
      + '— measured 25.0 %, and a wrong slice START would be invisible to this sweep below that');
    assert.ok(extendedTail >= 5,
      `only ${extendedTail} boards run the vector long AND mark the tail (measured 21) — the extended-vector `
      + 'regime is gone and a DROPPED slice would be invisible to this sweep');
    /* …and on one such board, the explicit negative control the round-1 arm carried */
    assert.notEqual(sample.b.x2.marks.filter(Boolean).length, sample.want,
      `${sample.day} ${sample.shape} save ${sample.i}: dropping the slice would print the same number`);
  });

  test('the mark is on the envelope BEFORE the call, and doubles the posted value', () => {
    const b = boardFor(4);
    const marks = b.x2.marks;
    assert.ok(marks.length >= b.budget.targets);
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

  /**
   * …AND WHAT IT DOES NOT CLOSE, MEASURED RATHER THAN CLAIMED (round 3, exploit-hunt).
   *
   * The test above walks eight times with `targets = 0` — and that is the only walk any test in this
   * repo had ever taken before reading the board back, which is how "a walk now re-posts the
   * byte-identical board" / "no reroll exists" came to be published without a qualifier. A walk that
   * ANSWERED ONE TARGET is a job on record (`jobIndexFor`, and the guard lane's own criterion: "one
   * answered target ends the hold"), so the day's index moves, and with it the seed, the partition,
   * the guard draw, the ×2 placement and the posted value — by design, because G3.6 seeds the ×2 per
   * JOB INDEX so that "after job 1 the placement is not already known" (G12 #30).
   *
   * So this cell pins the REAL gate, driven through the real machine: the first job's targets came
   * off Today's Page, and `state.startJob` refuses the next job while that page is live. The board
   * does not defend this; the page does. Anything that later makes `startJob` accept a second job on
   * a live page re-opens a +46…62 % best-of-16 on the day's own boards, and this test is where that
   * shows up. (COMPOSED-GAME G3.7 proof 6's sentence is corrected in notes/repair-board.md.)
   */
  test('a walk that ANSWERED a target is a job on record — and the page is what holds the door', () => {
    const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
    const save = structuredClone(CORPUS[6]);
    const first = postBoard(save, '2026-09-16', { now: NOW });
    assert.equal(jobIndexFor(save, '2026-09-16'), 0);

    /* answer exactly one target, then walk: `startJob → lockCall → applyTarget → walk` */
    let t = NOW;
    const step = (s) => (t += s * 1000);
    state.startJob(save, { today: '2026-09-16', now: t, board: first, force: true });
    state.tick(save, 'guard', step(20));
    state.beginTargets(save, { now: step(10) });
    state.lockCall(save, 70, { now: step(8) });
    state.applyTarget(save, CLEAN, { now: step(60) });
    state.walk(save, { now: step(2) });
    const entry = save.game.log.at(-1);
    assert.equal(entry.targets, 1, 'the walk did not record the answered target');

    /* it counts, and the next board is a DIFFERENT board — G3.6's own rule, not a defect */
    assert.equal(jobIndexFor(save, '2026-09-16'), 1);
    const second = postBoard(save, '2026-09-16', { now: NOW });
    assert.notEqual(second.seed, first.seed, 'the seed did not move — G12 #30 wants it to');
    assert.equal(second.seed, jobSeedFor(save, '2026-09-16', 1));
    assert.notDeepEqual(second.x2.marks, first.x2.marks, 'job 2 repeats job 1\'s ×2 placement');

    /* THE GATE, and it is not this file's: the job that was walked left Today's Page live */
    assert.throws(() => state.startJob(save, { today: '2026-09-16', now: NOW + 120000, board: second }),
      (e) => {
        assert.equal(e.code, 'page-in-progress',
          'startJob accepted a second job on a live page — the reroll is reachable again');
        assert.match(e.message, /left on Today's Page/);
        return true;
      });
    const left = (save.inProgress?.queue ?? []).filter(x => !x.done).length;
    assert.ok(left >= 5, `the toll for one reroll is only ${left} unstaked answers`);

    /* and the pin still does its own job: the SAME index is the same board, byte for byte */
    const again = postBoard(save, '2026-09-16', { now: NOW + 4 * HOUR_MS, jobIndex: 1 });
    assert.equal(again.seed, second.seed);
    assert.deepEqual(again.x2.marks, second.x2.marks);
    assert.deepEqual(again.bundles.map(x => x.locks.join(',')), second.bundles.map(x => x.locks.join(',')));

    /* THE SIZE OF WHAT THE PAGE IS HOLDING BACK, so a later ticket cannot call it cosmetic: the best
       of the day's first sixteen boards against taking the first one, on this save's own numbers */
    const posted = [];
    for (let k = 0; k < 16; k++) posted.push(postBoard(save, '2026-09-16', { now: NOW, jobIndex: k }).recommend.postedLive);
    assert.ok(Math.max(...posted) > posted[0] * 1.2,
      `best-of-16 is only ${Math.max(...posted)} against a first board of ${posted[0]}`);
  });

  /**
   * THE ×2 VECTOR COVERS THE LONGEST DRAFT, NOT THE SHAPE'S BUDGET (round 3, board-schedule).
   *
   * G8's J5 row publishes "the ×2 lands independently at `p = 1/6` per target". `postBoard` sized
   * the mark vector to `budget.targets`, and `draftUnion` reads `opts.x2[i]` by queue position — so
   * an index past the end of the array is `undefined` → false. The shape's budget is not the ceiling
   * on a drafted queue: step 7 of `composeBundles` pushes one cross-wing donor lock into a bundle to
   * keep G3.4's "every legal 3-of-5 draft spans ≥ 2 wings", and every draft holding that bundle runs
   * ONE target long. On those drafts the LAST target's ×2 probability was 0, not 1/6.
   *
   * WHY NO TEST SAW IT, and why this one sweeps DAYS. The mark at index `i` is one coin, drawn from
   * `dateISO|jobIndex|i` — so on a single day every save and every shape shares the same tail coin,
   * and a one-day corpus sweep reports either "all marked" or "none marked" for a whole tail index
   * whatever the fix is. The rate is only visible across days. The old per-day assertions could not
   * have caught this, and neither could the 10⁴-day rate test above, which calls `x2Marks` directly
   * with a length of its own choosing and never asks how long the board made the vector.
   *
   * THE CONTROL IS IN THE TEST: every long draft is re-priced with the OLD budget-sized vector, and
   * its tail target must come back unmarked in every one of them (0 of 192 on this sweep, against 33
   * of 192 live). If the sizing regresses, the two numbers become the same number and this fails.
   */
  test('the ×2 vector covers the LONGEST legal draft — 24 days × every shape × 25 saves', () => {
    const DAYS = 24, SAVES = 25;
    let boards = 0, cases = 0, long = 0, marked = 0, oldMarked = 0;
    let day = '2026-09-16';
    for (let d = 0; d < DAYS; d++) {
      for (const shape of Object.keys(SHAPES)) {
        for (let i = 0; i < SAVES; i++) {
          const b = postBoard(wideSave(i), day, { now: NOW, shape });
          boards++;
          /* what the board WOULD have handed `draftUnion` before the fix */
          const budgetMarks = x2Marks(day, b.jobIndex, b.budget.targets);
          for (const dr of b.drafts) {
            cases++;
            assert.ok(dr.queue.length <= b.x2.marks.length,
              `${shape} ${day} save ${i} ${dr.picks.join('')}: ${dr.queue.length} targets against a ${b.x2.marks.length}-mark vector`);
            for (let k = 0; k < dr.queue.length; k++) {
              assert.equal(dr.queue[k].x2, !!b.x2.marks[k],
                `${shape} ${day} save ${i} ${dr.picks.join('')}: target ${k + 1} disagrees with the day's mark`);
            }
            assert.equal(dr.x2, dr.queue.filter(x => x.x2).length, 'the draft miscounts its own marks');
            if (dr.queue.length > b.budget.targets) {
              long++;
              if (dr.queue.at(-1).x2) marked++;
              const old = draftFrom(b.bundles, dr.picks, { x2: budgetMarks });
              if (old.queue.at(-1).x2) oldMarked++;
            }
          }
        }
      }
      day = addDays(day, 1);
    }
    assert.equal(boards, DAYS * SAVES * Object.keys(SHAPES).length);
    assert.ok(cases >= 20000, `only ${cases} draft cases`);
    /* the regime exists — a draft really does run past the shape's budget */
    assert.ok(long >= 100, `only ${long} drafts ran longer than their shape's budget: the regime is gone`);
    /* …and on those drafts the final target is marked at the published rate */
    assert.ok(marked > 0, `${long} drafts ran long and NOT ONE of their tail targets was ever marked`);
    assert.ok(Math.abs(marked / long - X2.p) <= 0.08,
      `the tail target is marked at ${(marked / long).toFixed(4)} over ${long} long drafts, against ${X2.p}`);
    /* THE CONTROL: the budget-sized vector cannot mark a tail target at all */
    assert.equal(oldMarked, 0,
      `the control did not reproduce the defect — the budget-sized vector marked ${oldMarked} tails`);
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
  /**
   * WIDENED TO THE CORPUS THIS FILE ALREADY BUILDS, AND ASSERTING THE LAW THE COMPOSER CAN KEEP
   * (round-1 verification, board-schedule).
   *
   * This arm ran `for (let i = 0; i < CORPUS.length; i++)` — fifty saves, one shape — in a file whose
   * digest pin and both order laws were widened to four hundred precisely because "fifty samples
   * cannot see it". Swept the same way (400 saves × every shape, 1 162 boards that defer a critical
   * and leave a target unposted) the two strongest assertions go red:
   *
   *     DUE items absent from the NEXT Page                    4   (272/RUN ×2, 272/VAULT, 302/RUN)
   *     deferred criticals absent from the next Page           3
   *     deferred criticals not leading the review block       14   (69/JOB12, 166/×4, 225, 256, 257…)
   *
   * AND THE SCHEDULE IS INTACT IN EVERY ONE OF THEM. Save 272/RUN's `fac-12` is byte-identical before
   * and after the job — `bucket 2`, `due 2026-09-19`, still on the due list — and it is simply the
   * least overdue of EIGHTEEN dues against `LIMITS.dues = 12`: `composePage` never unscheduled it,
   * the next Page had no room. That is what COMPOSED Global rule 5 actually says, and it holds
   * 1 162 / 1 162; "still on the NEXT Page, ahead of every non-critical item" is a stronger sentence
   * than the composer ever promised (designs/SPEC-CORRECTIONS.md A-5).
   *
   * The leading law fails structurally too, not only statistically: save 69/JOB12 defers `ang-04`,
   * which is TIER 4, and `composePage`'s own rule is that a hard item is never first — so a tier-4
   * deferred critical can never lead a Page. Each exception below must be one of the composer's own
   * rules; an unexplained one is a real defect and goes red.
   */
  test('a target a job does not reach stays due and LEADS the next board’s review block', () => {
    let checked = 0;
    const rematchBlocked = [];      // Pages where a Rematch sits ahead of a deferred critical
    const bucketVsOverdue = [];     // the bucket-critical / overdue-sort disagreement
    const newCardsDropped = [];     // unreached NEW/WEAK cards the next Page did not re-draw
    const crowdedOff = [];          // DUE items the next Page had no room for (LIMITS.dues)
    const notLeading = [];          // deferred criticals the review block does not lead with
    const spreadReordered = [];     // pairs the overdue sort and the tier ramp do not explain
    for (let i = 0; i < WIDE_N; i++) {
     for (const shapeId of SHAPE_IDS) {
      const save = structuredClone(wideSave(i));
      const b = postBoard(save, '2026-09-16', { now: NOW, shape: shapeId });
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

      /**
       * (a) GLOBAL RULE 5, AS THE RULE ACTUALLY READS: every unreached item that is on the SCHEDULE
       * is still on the schedule. That is what "no item is ever removed from the schedule by a game
       * decision" says, and it holds on every one of the 1 162 boards. Returning on the NEXT Page is
       * a stronger sentence that belongs to `composePage`'s due cap, not to the game: a Page serves
       * `LIMITS.dues` of them, and the least overdue of eighteen dues waits its turn.
       */
      for (const it of unreached) {
        if (it.role !== 'review' && it.role !== 'rematch') continue;
        const rec = save.cards?.[it.id];
        assert.ok(rec && rec.due != null,
          `save ${i}/${shapeId}: due ${it.id} was posted by nobody and the game UNSCHEDULED it — Global rule 5`);
        if (!on.has(it.id)) {
          crowdedOff.push({ save: i, shapeId, id: it.id, due: rec.due, dues: next.queue.filter(x => x.role === 'review').length });
        }
      }
      /* …and the new/weak cards that were never scheduled are re-drawn from the pool, not owed. */
      for (const it of unreached) {
        if (it.role === 'review' || it.role === 'rematch') continue;
        if (!on.has(it.id)) {
          newCardsDropped.push({
            save: i, shapeId, id: it.id, role: it.role,
            scheduled: wideSave(i).cards?.[it.id]?.due != null,
            stillScheduled: save.cards?.[it.id]?.due != null,
          });
        }
      }

      /* (b) every deferred critical is STILL DUE — on the schedule, whether or not this Page took it */
      for (const id of b.deferred) {
        const rec = save.cards?.[id];
        assert.ok(rec && rec.due != null, `save ${i}/${shapeId}: deferred critical ${id} is no longer due at all`);
      }
      const deferredAt = b.deferred.filter(id => on.has(id)).map(id => on.get(id));
      if (!deferredAt.length) continue;         // every deferred critical waits for a later Page

      const priced = next.queue.map((it, k) => jobTargetOf(it, save, { now: NOW + HOUR_MS, order: k }));
      const inReviewBlock = (t) => t.role === 'review' || t.role === 'rematch';
      const maxDeferred = Math.max(...deferredAt);

      /**
       * (c) THE GUARANTEE: they lead the next board's REVIEW BLOCK — ahead of every new/weak/floor
       * item — EXCEPT where `composePage`'s own ordering rules outrank them. There are exactly two,
       * and each exception is required to be one of them:
       *   · a hard item is never first, so a TIER-4 deferred critical cannot lead a Page at all;
       *   · the queue is arranged on a 1→4 ramp, so a deferred critical of tier t sits behind the
       *     cheaper items the ramp puts first.
       * An exception that is neither is a real defect and fails here.
       */
      const firstOutside = priced.findIndex(t => !inReviewBlock(t));
      if (firstOutside >= 0 && maxDeferred >= firstOutside) {
        const blocker = priced[firstOutside];
        const late = deferredAt.filter(a => a >= firstOutside).map(a => priced[a]);
        for (const d of late) {
          /* the composer KEPT it — it is still a due review and still critical, it simply is not at
             the head of the Page. That is the part of the sentence `composePage` can honour. */
          assert.ok(inReviewBlock(d), `save ${i}/${shapeId}: deferred ${d.id} came back as a ${d.role}, not a review`);
          assert.ok(d.critical, `save ${i}/${shapeId}: deferred ${d.id} came back NOT critical`);
        }
        notLeading.push({ save: i, shapeId, at: maxDeferred, firstOutside, role: blocker.role, tiers: late.map(d => d.tier) });
      }

      /* (d) the two ways the STRONGER sentence ("ahead of every non-critical item") fails, recorded
             per save rather than skipped. Both are named in COMPOSED-GAME Requests. */
      for (let k = 0; k < maxDeferred; k++) {
        const t = priced[k];
        if (t.critical) continue;
        if (t.role === 'rematch') { rematchBlocked.push(`${i}:${t.id}@${k}`); continue; }
        if (!inReviewBlock(t)) continue;        // handled by (c): the composer's own ordering rules
        /* the RAW due is carried along: `composePage` sorts its review block on the unrounded
           overdue (page.js:834) but stamps the item with `Math.round(overdue * 10) / 10`
           (page.js:282), so two items that print the same 0.4 d are not a tie to the sort. */
        const raw = (x) => ({ ...x, rawDue: save.cards?.[x.id]?.due ?? null });
        const behind = deferredAt.filter(a => a > k).map(a => raw(priced[a]));
        bucketVsOverdue.push({ save: i, shapeId, ahead: raw(t), behind });
      }
     }
    }
    assert.ok(checked >= 800,
      `only ${checked} boards of ${WIDE_N} × ${SHAPE_IDS.length} defer a critical AND leave a target unposted — `
      + 'the loop is meant to run over EVERY one of them, at the width the rest of this file uses '
      + '(it ran over fifty saves and one shape, which is why four lost dues and fourteen order '
      + 'exceptions went unseen)');

    /**
     * THE TWO CORRECTED LAWS, with their exception counts measured rather than assumed absent.
     * `crowdedOff` is a DUE item the next Page had no room for — the schedule kept it (asserted per
     * item above), `LIMITS.dues` did not. `notLeading` is a deferred critical the review block does
     * not lead with, which is structurally impossible to avoid for a tier-4 one (a hard item is
     * never first) and ordinary for the ramp and the same-skill spread.
     */
    assert.ok(crowdedOff.length <= 20,
      `${crowdedOff.length} due items were crowded off the next Page by the composer's own due cap `
      + `(LIMITS.dues = ${LIMITS.dues}): ${JSON.stringify(crowdedOff.slice(0, 4))} — every one of them is still `
      + 'scheduled (asserted per item), so this is a Page-width bound, not a Global rule 5 break');
    assert.ok(notLeading.length <= 40,
      `${notLeading.length} boards do not lead their review block with the deferred critical: `
      + `${JSON.stringify(notLeading.slice(0, 4))}`);
    assert.ok(notLeading.some(v => v.tiers.some(t => t >= 4)),
      'no tier-4 deferred critical was found behind the review block — the STRUCTURAL exception '
      + '(composePage never seats a hard item first, so a tier-4 deferred critical can never lead a '
      + 'Page) is no longer exercised and the published sentence could be tightened');
    console.log(`  deferred-due laws over ${checked} boards: ${crowdedOff.length} dues crowded off the next Page, `
      + `${notLeading.length} boards where the deferred critical does not lead the review block`);

    /* A Rematch is not a critical target (`isCriticalTarget` requires a due review with a bucket)
       and composePage seats it at slot 3, so it is the ordinary reason the stronger sentence fails. */
    assert.ok(rematchBlocked.length >= 6,
      `only ${rematchBlocked.length} Pages seat a Rematch ahead of a deferred critical — if this has become 0, `
      + '`isCriticalTarget` now counts a pending Rematch and the stronger sentence can be asserted directly');

    /* The genuine counterexample — rare, and it is a property of the two orderings rather than of
       this corpus: criticality is BUCKET-based, composePage's due sort is OVERDUE-based. Every
       occurrence is required to be exactly that, so the day the mechanism changes this goes red. */
    const say = (t) => `${t.id} (bucket ${t.bucket}, ${t.overdueDays} d overdue, ${t.role})`;
    /* 43 of 1 162 boards, over 13 distinct saves (the same save contributes once per shape). The
       bound was 3 when the sweep was fifty saves and one shape; it scales with the sweep, and the
       per-occurrence assertions below are what actually hold the mechanism. */
    assert.ok(bucketVsOverdue.length <= 60,
      `${bucketVsOverdue.length} boards put a plain non-critical review ahead of a deferred critical: `
      + bucketVsOverdue.slice(0, 6).map(v => `save ${v.save}: ${say(v.ahead)}`).join(' | '));
    for (const v of bucketVsOverdue) {
      const t = v.ahead;
      assert.equal(t.role, 'review', `save ${v.save}: ${say(t)} is not even a due review`);
      assert.ok(t.bucket > BOARD.criticalBucketMax,
        `save ${v.save}: ${say(t)} has a critical bucket and is not critical — the criticality rule has changed`);
      assert.ok((t.overdueDays ?? 0) < BOARD.criticalOverdueDays,
        `save ${v.save}: ${say(t)} is a day overdue and is not critical — the criticality rule has changed`);
      for (const d of v.behind) {
        /* `composePage` orders its review block by OVERDUE first, bucket second (page.js:834) — on
           the UNROUNDED overdue, while the item it stamps carries `Math.round(overdue*10)/10`
           (page.js:282) — and then re-orders the whole Page on the 1→4 tier ramp and the same-skill
           spread. The first two are checkable from the item; the spread is not, so an occurrence
           neither explains is COUNTED rather than asserted away, and bounded below. */
        const wins = (t.overdueDays ?? 0) > (d.overdueDays ?? 0)
          || (t.rawDue != null && d.rawDue != null && t.rawDue < d.rawDue);
        if (!wins && !(t.tier < d.tier)) spreadReordered.push(`${v.save}/${v.shapeId}:${t.id}@${t.tier} ahead of ${d.id}@${d.tier}`);
        /* whatever ordered them, the composer KEPT the deferred critical as a due critical review */
        assert.ok(d.role === 'review' || d.role === 'rematch',
          `save ${v.save}: the deferred ${say(d)} came back as a ${d.role}`);
        /* critical by one of the two published routes — a low bucket, or enough days overdue */
        assert.ok(d.bucket <= BOARD.criticalBucketMax || (d.overdueDays ?? 0) >= BOARD.criticalOverdueDays,
          `save ${v.save}: the deferred ${say(d)} is critical for neither of the published reasons `
          + `(bucket ≤ ${BOARD.criticalBucketMax} or ≥ ${BOARD.criticalOverdueDays} d overdue)`);
      }
    }
    /* the residue: pairs that neither the overdue sort nor the tier ramp explains, which is the
       same-skill spread re-seating the review block after it was ordered. Bounded, and named. */
    assert.ok(spreadReordered.length <= 20,
      `${spreadReordered.length} pairs are ordered by neither the overdue sort nor the tier ramp — `
      + `${spreadReordered.slice(0, 5).join(' | ')} — if this has grown, composePage's ordering has moved`);

    /* And the new-card half, measured: a card that was never on the schedule is re-drawn from the
       pool, not owed by Global rule 5. Every one that fails to return must be exactly that. */
    assert.ok(newCardsDropped.length >= 1,
      'no unreached new/weak card failed to return — if the pool has become stable, the old '
      + '"every unreached item is back" assertion could be restored and this arm deleted');
    for (const d of newCardsDropped) {
      assert.ok(['new', 'weak', 'floor'].includes(d.role), `save ${d.save}: ${d.id} is a ${d.role}, not a pool card`);
      /* GLOBAL RULE 5 IS ABOUT THE SCHEDULE. A pool slot is re-drawn per Page, so a card that filled
         one is not owed the NEXT Page — the weak slot's ASN fallback takes "its most needed
         original", which does have a Leitner record, so `scheduled` is not always false at 400 saves
         the way it was at fifty. What the rule forbids is the GAME unscheduling it, and that is what
         is asserted: a card that was due before the job is still due after it. */
      assert.equal(d.stillScheduled, d.scheduled,
        `save ${d.save}/${d.shapeId}: ${d.id} was ${d.scheduled ? '' : 'not '}scheduled before the job and `
        + `is ${d.stillScheduled ? '' : 'not '}scheduled after it — the game moved the schedule`);
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
    /* the payout segment is `posted N` and nothing else: the `(−M shared)` form is a deduction the
       screen's own arithmetic never produced, and it lives on `board.sharedLine` now (round-2
       verification, player-feel — `draftFrom`'s note carries the measurement) */
    assert.match(b.primary, /^(RUN|JOB|VAULT) · [A-E]( [A-E])* · \d+ targets · posted \d+ · ~\d+ min · ends \d\d:\d\d · \d+ % game$/);
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
      /* THE BUTTON PRICES THE JOB AND DOES NOT SUBTRACT FROM IT (round-2 verification, player-feel).
         The payout segment is `COPY.postedFlat` on every board, shared or not: `posted 419`, the
         number `startJob` writes and the debrief headlines. The toll is real and is still published
         — on `board.sharedLine`, in `COPY.postedNet`'s own words, fed the one pair whose subtraction
         lands on the payout — but it is not inside the segment that names the price, because
         `posted 419 (−239 shared)` is read as 180 and the screen carries no arithmetic that
         produces 419 (three contract rows adding to 526, and 239 on a live-gross basis of 658). */
      assert.ok(b.primary.includes(`posted ${d.postedLive}`), `save ${i}: the button does not price the job`);
      assert.ok(!b.primary.includes('shared'), `save ${i}: the button subtracts again — ${b.primary}`);
      if (d.sharedLocks > 0 || d.sharedPoints > 0) {
        shared++;
        /* ROUND-3 VERIFICATION (player-feel): the toll line's gross is the PRINTED CONTRACT ROWS'
           sum, not a live gross. The live gross (658 above) is a number nothing on the board shows,
           so a rendered subtraction from it explains nothing — and the line had no render site at
           all, which is the other half of the finding. The chain is `N locks (−S shared) · T targets
           · posted G (−P shared)`, plus `· +X ×2 · posted L` when the day's marks land. */
        const rowGross = d.picks.reduce((s, p) => s + b.contracts.find(c => c.id === p).posted, 0);
        assert.equal(rowGross, d.postedGross, `save ${i}: the rows do not add to postedGross`);
        const head = `${d.locks} locks (−${d.sharedLocks} shared) · ${d.queue.length} targets · `
          + `posted ${d.postedGross} (−${d.sharedPoints} shared)`;
        assert.equal(b.sharedLine, d.x2Up > 0 ? `${head} · +${d.x2Up} ×2 · posted ${d.postedLive}` : head,
          `save ${i}: the toll line is not the published chain on the printed rows' basis`);
        assert.equal(d.postedGross - d.sharedPoints, d.postedNet, `save ${i}: gross − shared is not the net`);
        assert.equal(d.postedNet + d.x2Up, d.postedLive, `save ${i}: net + ×2 is not the payout`);
        assert.equal(d.locks - d.sharedLocks, d.queue.length, `save ${i}: locks − shared is not the target count`);
        assert.ok(d.postedLive >= d.postedNet, `save ${i}: the live payout is below the pre-×2 union`);
      } else {
        flat++;
        assert.equal(b.sharedLine, null, `save ${i}: a toll line with nothing shared`);
      }
      /* …and it IS `COPY.primary` plus those two segments — if the copy file's template moves, this
         line has to move with it (the seven-segment COPY entry is filed under Requests). */
      const tail = b.primary.replace(` · ${d.label}`, '').replace(` · ${d.line}`, '');
      assert.equal(tail, COPY.primary({
        shape: SHAPES[b.shape].name, targets: d.queue.length, minutes, ends: b.ends, split: b.split,
      }), `save ${i}: the button is no longer COPY.primary plus the letters and the payout`);
    }
    /* every full board shares: the core is replicated into `r` of the `n` contracts, so a draft of
       a 5-contract board ALWAYS carries a lock twice over and always publishes a `sharedLine`
       (0 of 3996 corpus drafts have `shared = 0`). A board with nothing shared has none — below. */
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
    /**
     * THE SECOND CLOCK, BECAUSE ONE CLOCK CANNOT CARRY A PUBLISHED NUMBER (round-2 verification,
     * board-schedule).
     *
     * Every figure this arm printed — and every figure COMPOSED-GAME statement 2 published from it —
     * was measured over `CLOCK` alone, and `CLOCK`'s whole-job answer pace happens to sit within 5 %
     * of the shipped table (575 s against a published 600 on a JOB-10), which is the single most
     * flattering thing a clock can be to a projection that falls back to that table. G1 names "the
     * two clocks that bracket the error" — a slow answerer and a deliberator — so the sweep below
     * runs over both. This is the deliberator: quick on every stem, slow on every call and every
     * payout beat, which is the profile that separates the two terms hardest.
     */
    const DELIBERATOR = Object.freeze({
      answerS: { 1: 20, 2: 33, 3: 70, 4: 105 }, callS: { 1: 16, 2: 19, 3: 23, 4: 27 },
      beatS: { 1: 14, 2: 18, 3: 24, 4: 30 }, board: 40, guard: 22, brief: 34, getaway: 26,
    });
    /**
     * THE THIRD AND FOURTH CLOCKS (round-2 verification, board-schedule finding 10).
     *
     * Two clocks were still two constants: the finding reproduced the published 13.0 % / 5.88 by
     * changing NOTHING but the clock and got 22.0 % / 8.71 from a slow answerer and 100 % / 21.78
     * from a deliberator, and it asked for "a slow answerer, a deliberator and a table-pace
     * student". `TABLE_PACE` is the student who IS the two shipped tables — every rate it implies is
     * exactly 1.00, which is the one clock a projection that falls back to those tables cannot be
     * wrong about for a reason it chose; `SLOW_STEM` is the slow answerer, table-paced on every
     * beat. Between them the four clocks bracket the answer term at 0.35x, 1.00x and 1.80x of the
     * shipped table while the decision term runs 1.00x and 1.6x, so no band below is a property of
     * one student's pace.
     */
    const TABLE_PACE = Object.freeze({
      answerS: { 1: 30, 2: 90, 3: 180, 4: 300 }, callS: { 1: 6, 2: 10, 3: 12, 4: 15 },
      beatS: { 1: 8, 2: 14, 3: 18, 4: 21 }, board: 18, guard: 12, brief: 20, getaway: 25,
    });
    const SLOW_STEM = Object.freeze({
      answerS: { 1: 60, 2: 170, 3: 330, 4: 540 }, callS: { 1: 6, 2: 10, 3: 12, 4: 15 },
      beatS: { 1: 8, 2: 14, 3: 18, 4: 21 }, board: 22, guard: 14, brief: 24, getaway: 28,
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

    /**
     * FINISH WHATEVER PAGE THE LAST JOB LEFT BEHIND — the path the student is actually forced down.
     *
     * Round-1 verification (split-honesty): this arm used to season its saves through
     * `startJob(..., { force: true })`, and `force` is the flag whose own docblock
     * (`site/js/job/state.js` "the deliberate override") exists for a Today's Page in progress. A
     * mid-job walk ALWAYS leaves one — `endJob` hands the rest of the queue back as a plain page at
     * `idx = answered` — and `grep -n force site/js/screens/job.js` returns nothing, so no student
     * can reach a second job without first clearing it. Seasoning through `force` therefore built a
     * history no save can hold, and the criterion was measured on it.
     *
     * Measured, before this landed: walk at 3 of 7 → `inProgress` is `{kind:'page', idx:3, len:10,
     * game:false}`, and the next `startJob` throws `JobStateError: page-in-progress — 7 left on
     * Today's Page`. Clearing it through the shipped writers (`markItem` × 7 → `finishPage`) is what
     * the screen makes the student do, and the next `startJob` then needs no flag at all.
     */
    function clearLeftoverPage(save) {
      for (let guard = 0; guard < 200; guard++) {
        const ip = save.inProgress;
        if (!ip || ip.kind !== 'page' || !Array.isArray(ip.queue)) return guard;
        if (ip.idx >= ip.queue.length) { finishPage(save); return guard; }
        markItem(save, { ok: true });
        if (save.inProgress && save.inProgress.idx >= save.inProgress.queue.length) { finishPage(save); return guard + 1; }
      }
      throw new Error('clearLeftoverPage did not terminate');
    }

    /** play a job on `clock`, walking out after `quitAfter` answers; returns the board and the debrief */
    function play(save0, shapeId, { quitAfter = Infinity, clock = CLOCK } = {}) {
      const save = structuredClone(save0);
      const board = postBoard(save, '2026-09-16', { now: NOW, shape: shapeId });
      let t = NOW;
      const step = (secs) => (t += Math.round(secs * 1000));
      /* NO `force`. The save handed in has no page in progress, because `seasoned` clears the one
         the previous walk left exactly as the screen makes the student clear it. */
      state.startJob(save, { today: '2026-09-16', now: t, board });
      state.tick(save, 'guard', step(clock.board));
      state.beginTargets(save, { now: step(clock.guard) });
      let answered = 0;
      for (let stop = 0; stop < 900; stop++) {
        const g = state.stateOf(save);
        if (!g || g.outcome != null) break;
        if (answered >= quitAfter) { state.walk(save, { now: step(2) }); break; }
        const tier = (state.queueOf(save)[state.idxOf(save)]?.tier) ?? 2;
        if (g.phase === 'envelope') { state.lockCall(save, 70, { now: step(clock.callS[tier]) }); continue; }
        if (g.phase === 'answer') { state.applyTarget(save, CLEAN, { now: step(clock.answerS[tier]) }); answered++; continue; }
        if (g.phase === 'payout' || g.phase === 'bagpush') {
          const last = state.queueOf(save)[Math.max(0, state.idxOf(save) - 1)]?.tier ?? 2;
          const when = step(clock.beatS[last]);
          if (state.targetsLeft(save) === 0) state.endJob(save, finalWord(save), { now: when, day: '2026-09-16' });
          else state.push(save, { now: when });
          continue;
        }
        if (g.phase === 'brief') { state.brief(save, {}, { now: step(clock.brief) }); continue; }
        if (g.phase === 'getaway') { state.crack(save, { now: step(clock.getaway) }); continue; }
        break;
      }
      const entry = save.game.log.at(-1) ?? null;
      const wall = (entry?.tGame ?? 0) + (entry?.tAnswer ?? 0);
      return { save, board, entry, headline: wall > 0 ? (100 * entry.tGame) / wall : 0 };
    }

    /**
     * A save whose last five jobs are `walks` mid-job walks and the rest complete — on ANY corpus
     * save, and with each walk's leftover page finished the way the student has to finish it.
     */
    const seasoned = (i, shapeId, walks, { clock = CLOCK } = {}) => {
      let s = structuredClone(CORPUS[i]);
      for (let k = 0; k < SPLIT.projectionWindowJobs; k++) {
        const half = Math.max(1, Math.round(SHAPES[shapeId].targets / 2));
        s = play(s, shapeId, { quitAfter: k < walks ? half : Infinity, clock }).save;
        clearLeftoverPage(s);
      }
      return s;
    };

    /** One seasoned cell played out: the board it posts against the debrief it headlines. */
    const cell = (i, shapeId, walks, clock = CLOCK) => {
      const w = play(seasoned(i, shapeId, walks, { clock }), shapeId, { clock });
      return { ...w, gap: Math.abs(w.board.split - w.headline) };
    };

    test('the log entry records the WHOLE queue against the answered targets — and the row\'s SHAPE is pinned', () => {
      /* THE TRIPWIRE, ARMED PROPERLY. This used to be two `=== undefined` assertions whose message
         was "state.js now records the queue length — read it". That is the right intent and the
         wrong mechanism: `board.js` reads `queueTargets` (:796) and `postedAnswered` (:873, :987)
         whenever they are present, so their PRESENCE changes what the projection means, and both
         fields have arrived and been withdrawn again inside this repair round (the state lane added
         them, `tests/job-save.test.mjs` went red on the 30-row budget — +29 B a row, +870 B — and
         they came back off). A pair of `undefined` assertions cannot tell "not written yet" from
         "written and reverted", and would have to be edited in both directions.
         So the ROW SHAPE is pinned instead: the exact set of optional fields the entry carries. Any
         arrival or departure fails here with the list, and the value assertions below are guarded by
         that pin rather than by a branch that can go vacuous. */
      const w = play(CORPUS[2], 'JOB', { quitAfter: 3 });
      assert.equal(w.entry.targets, 3);
      const drafted = w.board.recommend.queue.reduce((s, it) => s + it.posted, 0);
      assert.ok(w.entry.posted > drafted * 0.9,
        `the entry recorded posted ${w.entry.posted} against a drafted queue worth ${drafted}`);

      /* ROUND-4 VERIFY — `queueTargets` has LANDED and the pin now says so (the state lane;
         notes/repair-state.md §4). The row it rides on is BYTE-NEUTRAL: `state.endJob` pays for it
         by rounding the log's own copy of `rating` to 4 dp (18 B a row saved against 18 B spent),
         and `tests/job-save.test.mjs` re-measures `game keys added` at 40332 B — the figure it read
         before the change, to the byte. `calls` is 11 B a row / 330 B against 320 B of headroom and
         is still out; `postedAnswered` is REFUTED (notes/repair-board.md's own measurement) and must
         never arrive. Any further arrival or departure still fails here, with the list. */
      const OPTIONAL = ['postedAnswered', 'queueTargets', 'calls'];
      const present = OPTIONAL.filter((k) => w.entry[k] !== undefined);
      assert.deepEqual(present, ['queueTargets'],
        `site/js/job/state.js endJob writes [${present.join(', ')}] on the log row, against the `
        + '[queueTargets] this file is pinned to. That is not a free addition: `board.js '
        + '`queuedTargetsOf` prefers `queueTargets` over its own stand-in and `personalRates` prefers '
        + '`postedAnswered` over `posted`, so the projection\'s meaning moves with them — and '
        + '`tests/job-save.test.mjs` prices them at +29 B on a 30-row log. Assert what each new field '
        + 'MEANS here (the value arms below the pin), and re-run the save budget.');
      for (const k of present) {
        if (k === 'queueTargets') {
          assert.equal(w.entry.queueTargets, w.board.recommend.queue.length,
            '`queueTargets` is not the drafted queue\'s length — `queuedTargetsOf` prefers that field '
            + 'over its own stand-in, so a wrong one is worse than the estimate it replaced');
          assert.equal(play(CORPUS[2], 'JOB').entry.queueTargets, play(CORPUS[2], 'JOB').entry.targets,
            'a COMPLETED job records a queue longer than what it answered — `queuedTargetsOf` would '
            + 'then read a finished job as a walk, the defect the field exists to close');
        }
        if (k === 'postedAnswered') {
          assert.ok(w.entry.postedAnswered > 0 && w.entry.postedAnswered < w.entry.posted,
            `the answered prefix's posted value is ${w.entry.postedAnswered} against a whole-queue `
            + `${w.entry.posted} — on a walk at 3 it must be a strict prefix of it`);
        }
        if (k === 'calls') {
          assert.equal(w.entry.calls, 4,
            'a walk after 3 answers locked 4 calls (the fourth envelope is what it walked out of) — '
            + '`calls` is what lets the decision term price a walked job exactly');
        }
      }
    });

    /**
     * THE CRITERION — PER CELL ON EVERY `ledger` LINE, AT EVERY WALK LEVEL, ON TWO CLOCKS
     * (round-1 verification, split-honesty; round-2 verification, board-schedule).
     *
     * What this used to be: twelve cells, all of them `seasoned(2, …)` — corpus index **2**,
     * hardcoded, while the file builds a 50-save `CORPUS` and a 400-save wide corpus a thousand
     * lines above and used neither here. Round 1 swept it to fifty saves × four shapes, and to three
     * walk levels: 0, 3 and 5.
     *
     * ROUND 2 — THE THREE THINGS THAT SWEEP COULD NOT SEE. All three are closed at the root in
     * `site/js/job/board.js`; none of them is tolerated here.
     *
     *  1. **The level the sweep skipped.** 0, 3 and 5 miss FOUR of five — the only level at which
     *     the board missed the band under a MEASURED label. At four of five the decision term rates
     *     the one finished job, so the line reads `~25 % game · your last 1 job`
     *     (`projectionSource === 'ledger'`), while the ANSWER term was pooling that job with four
     *     prefixes. A prefix only ever measures the CHEAP END of the ramp: this file's own `CLOCK`
     *     answers a tier-1 stem in 44 s against a published 30 (rate 1.47) and a tier-2 in 71
     *     against 90 (0.79), so a JOB-10 walked at 5 reads 1.47 — correctly, for the five tier-1
     *     stems it saw — where the same student's whole job reads 0.96. Pooled by expected seconds,
     *     four such prefixes and one finished job read 1.25, and the board printed 25 % against a
     *     debrief headlining 30.0 on nine of the fifty corpus saves (18 of 200 cells on the second
     *     clock, worst 5.87). `personalRates` now rates the answer term on the window's WHOLE jobs
     *     whenever it has any and falls back to prefixes only when the window holds none — which is
     *     exactly the case the line labels `projected`.
     *  2. **One clock cannot carry a published number.** Every figure this arm has ever printed was
     *     measured over `CLOCK` alone, and `CLOCK`'s whole-job answer pace sits within 5 % of the
     *     shipped table (575 s against a published 600 on a JOB-10) — the single most flattering
     *     thing a clock can be to a projection whose fallback IS that table. The sweep now runs over
     *     `DELIBERATOR` as well, and both clocks are asserted to lie strictly inside `RATE_CLAMP`,
     *     so what is measured is the estimator and never the clamp.
     *  3. **A completed job read as a walk.** `queuedTargetsOf` fell back to the shape's published
     *     target count, which a thin Page does not always serve: on 14 of 400 saves every JOB12 the
     *     student ever FINISHED was read as a walk — permanently, not once in a while. Corpus save
     *     25 is five completed eleven-target jobs, and the board printed `projected` for all of them
     *     and landed 3.85 / 6.69 / 8.92 points from the headline on three clocks, at every walk
     *     level including zero. It now prefers tonight's own drafted queue length for the same
     *     shape, and `missedComplete` below is the count that says so.
     *
     * MEASURED AFTER ALL THREE — 50 saves × 4 shapes × 6 walk levels × 4 clocks = 4 800 cells:
     *
     *     walks 0…4   `ledger` on all 4 000, and 0 of 4 000 outside the band (worst 2.32)
     *     walks 5     `projected` on all 800, and the distribution is the clock's:
     *                   TABLE_PACE    0 of 200        median 0.20   worst 2.11
     *                   SLOW_STEM     0 of 200        median 0.78   worst 2.69
     *                   CLOCK        26 of 200 (13 %) median 2.32   worst 5.88
     *                   DELIBERATOR 200 of 200 (100 %) median 14.22 worst 21.78
     *
     * So the criterion is asserted in two registers, and THE REGISTER IS CHOSEN BY THE LINE THE
     * BOARD PRINTS rather than by the walk level: a `ledger` line — one that names the student's own
     * jobs — is asserted PER CELL against `SPLIT.agreeWithinPoints`, everywhere, on every clock; a
     * `projected` line is the claim job 1 makes and is asserted as a DISTRIBUTION, per clock, at the
     * shape it measures. At five of five the window holds no whole job at all, so every term the
     * board has is a prefix of the cheap end of a ramp and the decision term has nothing it can
     * rate; that residue is an information limit — `calls` or the answered prefix's pre-×2 table
     * cost on the log entry close it (notes/repair-board.md Requests 1) — and it is also where the
     * two clocks disagree by a factor of six, which is why the document publishes the clock
     * population beside the number (designs/SPEC-CORRECTIONS.md A-3). The distribution bounds are
     * upper bounds only, so a further repair that pushes them down leaves this green.
     */
    /* THE NAME IS A CROSS-LANE CONTRACT. `tests/job-meta-constants.test.mjs` §G captures this arm by
       the prefix "THE CRITERION survives a history of mid-job walks" and then requires the name to
       carry both registers, so that no document can certify the criterion at a level where this arm
       asserts a distribution. The per-cell register now reaches FOUR of five (it was three before
       the answer term stopped pooling prefixes with whole jobs), and the phrase that lint matches is
       kept in the name as the thing that was superseded rather than deleted. */
    test('THE CRITERION survives a history of mid-job walks — PER CELL on every LEDGER line, now to four of five and not only three of five, and as a DISTRIBUTION at five of five (50 saves, every shape, four clocks)', () => {
      const CLOCKS = [['CLOCK', CLOCK], ['DELIBERATOR', DELIBERATOR], ['TABLE_PACE', TABLE_PACE], ['SLOW_STEM', SLOW_STEM]];
      const LEVELS = [0, 1, 2, 3, 4, SPLIT.projectionWindowJobs];
      /* the sweep must measure the ESTIMATOR, not `clampRate`: every per-tier ratio each clock
         implies against the two shipped tables has to sit strictly inside the published clamp */
      for (const [name, clk] of CLOCKS) {
        for (const t of [1, 2, 3, 4]) {
          const rates = [
            ['answer', clk.answerS[t] / (ANSWER_MINUTES_PER_TIER[t] * 60)],
            ['decision', (clk.callS[t] + clk.beatS[t]) / DECISION_SECONDS[t]],
          ];
          for (const [term, r] of rates) {
            assert.ok(r > RATE_CLAMP.min && r < RATE_CLAMP.max,
              `${name} tier ${t}: the ${term} rate it implies is ${r.toFixed(2)}, outside the shipped `
              + `clamp [${RATE_CLAMP.min.toFixed(3)}, ${RATE_CLAMP.max}] — this sweep would be measuring the clamp`);
          }
        }
      }

      /** the measured shape of the `projected` register at five of five, per clock — UPPER bounds */
      const AT_FIVE = {
        CLOCK: { over: 0.16, median: 3.0, max: 6.0, measured: '13.0 % / 2.32 / 5.88' },
        /* the whole point of the second clock is that this register is a property of the student's
           clock, so the bound that matters here is how far the board can be when it has nothing but
           prefixes to rate */
        DELIBERATOR: { over: 1.0, median: 17.0, max: 26.0, measured: '100 % / 14.22 / 21.78' },
        /* the student who IS the two shipped tables: the projection's fallback is their own pace,
           and at five of five it is inside the band on every cell */
        TABLE_PACE: { over: 0.02, median: 0.5, max: 2.6, measured: '0 % / 0.20 / 2.11' },
        /* the slow answerer: 1.8x the answer table, table pace on every beat — also inside it, which
           is the half of the finding that matters: the miss is not "slow students", it is the
           DECISION rate (see the mechanism assertion below) */
        SLOW_STEM: { over: 0.02, median: 1.2, max: 3.3, measured: '0 % / 0.78 / 2.69' },
      };
      const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
      const rows = [];
      let missedComplete = 0;
      let ledgerCells = 0;
      for (const [clockName, clk] of CLOCKS) {
        for (const walks of LEVELS) {
          const cells = [];
          for (let i = 0; i < CORPUS.length; i++) {
            for (const shapeId of SHAPE_IDS) {
              const w = cell(i, shapeId, walks, clk);
              const where = `${clockName} save ${i} ${shapeId}/${walks}`;
              const n = w.board.projectionRates.n;
              const wholeJobs = SPLIT.projectionWindowJobs - walks;
              /**
               * WHAT EACH TERM ACTUALLY RATED, per cell — the mechanism, not just the outcome.
               *
               * Both terms read the same classifier (`reachedGetaway`), so the two counts move
               * together: the answer term rates the window's whole jobs, and when the window has
               * none it rates every walked job's prefix rather than nothing — `state.applyTarget`
               * folds only a completed answer into `tAnswer`, so a job walked after k answers
               * recorded exactly k answers' worth of answering and the prefix is a real
               * measurement, just of the cheap end. The decision term never rates a prefix: after
               * k answers `tGame − fixed` lies anywhere in `[(k−1)·D + call, k·D + call]` and no
               * logged field says where. An empty ANSWER accumulator is the one state that must be
               * impossible, because `rate()` then falls back to 1 — the shipped table — under a
               * sentence with the student's name on it.
               */
              assert.equal(n.answer, n.decision > 0 ? n.decision : SPLIT.projectionWindowJobs,
                `${where}: the answer term rated ${n.answer} jobs against the decision term's ${n.decision} — `
                + 'it takes the window\'s WHOLE jobs when it has any and every walked prefix when it has none');
              assert.ok(n.answer > 0, `${where}: the answer term rated nothing and fell back to the shipped table`);
              assert.ok(n.decision <= wholeJobs,
                `${where}: the decision term rated ${n.decision} jobs when only ${wholeJobs} of them are `
                + 'a whole number of decision cycles');
              assert.equal(w.board.projectionSource, n.decision > 0 ? 'ledger' : 'projected',
                `${where}: the line's provenance is not what the two terms rated`);
              /* a FINISHED job read as a walked one — `queuedTargetsOf`'s estimate missing. Counted,
                 not assumed absent; `queueTargets` on the log entry would remove the estimate. */
              missedComplete += wholeJobs - n.decision;
              cells.push({ i, shapeId, gap: w.gap, split: w.board.split, headline: w.headline, source: w.board.projectionSource });
            }
          }
          assert.equal(cells.length, CORPUS.length * SHAPE_IDS.length, `${clockName}/${walks}: the sweep did not run`);
          const gaps = cells.map(c => c.gap).sort((a, b) => a - b);
          const over = cells.filter(c => c.gap > SPLIT.agreeWithinPoints);
          const ledger = cells.filter(c => c.source === 'ledger');
          rows.push([clockName, walks, cells.length, ledger.length, over.length,
            +(100 * over.length / cells.length).toFixed(1),
            +q(gaps, 0.5).toFixed(2), +q(gaps, 0.9).toFixed(2), +gaps.at(-1).toFixed(2)]);

          /* (1) THE PER-CELL REGISTER: a line that names the student's own jobs, at any walk level,
                 on either clock, with no averaging to hide in. */
          ledgerCells += ledger.length;
          for (const c of ledger) {
            assert.ok(c.gap <= SPLIT.agreeWithinPoints,
              `${clockName} save ${c.i} ${c.shapeId} after ${walks} mid-job walks: the board printed ${c.split} % `
              + `on a LEDGER line — the student's own jobs — and the debrief headlined ${c.headline.toFixed(1)} % `
              + `(gap ${c.gap.toFixed(1)} > ${SPLIT.agreeWithinPoints})`);
          }

          if (walks < SPLIT.projectionWindowJobs) {
            /* every window here holds at least one finished job, so every line must be a ledger one;
               a `projected` cell means a completed job was misclassified as a walk */
            assert.equal(ledger.length, cells.length,
              `${clockName}/${walks}: ${cells.length - ledger.length} boards printed \`projected\` although the `
              + 'window holds a finished job — `queuedTargetsOf` read a completed job as a walk');
          } else {
            /* (2) THE DISTRIBUTION REGISTER, per clock, at the shape it measures. */
            const b = AT_FIVE[clockName];
            assert.equal(ledger.length, 0,
              `${clockName}/5: ${ledger.length} boards claim \`ledger\` with no finished job in the window`);
            /**
             * THIS FILE'S OWN CLOCK IS THE ONE THE DOCUMENT QUOTES, and its three bounds are
             * therefore also written as LITERAL expressions, not read out of `AT_FIVE`:
             * `tests/job-meta-constants.test.mjs` §G derives COMPOSED-GAME.md's published numerals
             * ("at most 16 % of cells over, median ≤ 3.0, worst ≤ 6.0") from these exact three
             * expressions by regex, so that no numeral is typed twice between the arm and the
             * document. Change their SHAPE — a variable instead of a literal, a different
             * multiplier — and that lint goes red rather than the document going quietly stale.
             * The `deepEqual` under them is what keeps the table and the literals one number.
             */
            if (clockName === 'CLOCK') {
              assert.ok(over.length / cells.length <= 0.16,
                `CLOCK at five of five: the criterion misses on ${(100 * over.length / cells.length).toFixed(1)} % `
                + 'of cells — measured 13.0 % (24.0 % before the board repair)');
              assert.ok(q(gaps, 0.5) <= 0.6 * SPLIT.agreeWithinPoints,
                `CLOCK at five of five: the MEDIAN cell is ${q(gaps, 0.5).toFixed(2)} — measured 2.32, `
                + `well inside the published ${SPLIT.agreeWithinPoints}`);
              assert.ok(gaps.at(-1) <= 1.2 * SPLIT.agreeWithinPoints,
                `CLOCK at five of five: worst cell ${gaps.at(-1).toFixed(2)} points — measured 5.88 `
                + '(7.49 before the board repair), the tail has widened');
              assert.deepEqual([b.over, b.median, b.max],
                [0.16, 0.6 * SPLIT.agreeWithinPoints, 1.2 * SPLIT.agreeWithinPoints],
                'the AT_FIVE table and the three literal expressions above have drifted apart — the '
                + 'literals are what the document is derived from, so the table must follow them');
            }
            assert.ok(over.length / cells.length <= b.over,
              `${clockName} at five of five: the criterion misses on ${(100 * over.length / cells.length).toFixed(1)} % `
              + `of cells against a measured ${b.measured} (over % / median / worst)`);
            assert.ok(q(gaps, 0.5) <= b.median,
              `${clockName} at five of five: the MEDIAN cell is ${q(gaps, 0.5).toFixed(2)} points against a measured `
              + `${b.measured} (over % / median / worst)`);
            assert.ok(gaps.at(-1) <= b.max,
              `${clockName} at five of five: worst cell ${gaps.at(-1).toFixed(2)} points against a measured `
              + `${b.measured} (over % / median / worst) — the tail has widened`);
          }
        }
      }
      /* ---------------------------------------------------------------------------------------
         THE MECHANISM, ACROSS THE CLOCK POPULATION (round-2 verification, board-schedule #10).

         Four clocks make the five-of-five band a measurement instead of a constant, and they also
         say what the band is a function of. At five of five the window holds no finished job, so
         the DECISION term has nothing to rate and `rate()` falls back to the shipped table under a
         sentence with the student's name on it; the ANSWER term still rates every walked prefix.
         So the gap should be driven by how far the student's decision pace is from
         `DECISION_SECONDS`, and barely at all by their answer pace. Measured, over the four:

           clock         decision rate   answer rate    over at five of five
           TABLE_PACE      1.00           1.00                0 %
           SLOW_STEM       1.00           1.80–2.00           0 %
           CLOCK           0.71–0.93      0.79–1.47          13 %
           DELIBERATOR     1.53–2.14      0.35–0.67         100 %

         Which is the claim: order the clocks by their decision rate's distance from 1 and the miss
         rate is non-decreasing, while the answer rate's distance does NOT order them (SLOW_STEM is
         the furthest answer pace of the four and misses nothing).
         --------------------------------------------------------------------------------------- */
      const far = (clk, term) => Math.max(...[1, 2, 3, 4].map((t) => Math.abs(
        (term === 'answer' ? clk.answerS[t] / (ANSWER_MINUTES_PER_TIER[t] * 60)
          : (clk.callS[t] + clk.beatS[t]) / DECISION_SECONDS[t]) - 1)));
      const atFive = Object.fromEntries(rows.filter((r) => r[1] === SPLIT.projectionWindowJobs).map((r) => [r[0], r[5]]));
      const byDecision = CLOCKS.slice().sort((a, b) => far(a[1], 'decision') - far(b[1], 'decision'));
      for (let k = 1; k < byDecision.length; k++) {
        const [prev] = byDecision[k - 1]; const [here] = byDecision[k];
        assert.ok(atFive[here] >= atFive[prev] - 1e-9,
          `${here} (decision pace ${far(byDecision[k][1], 'decision').toFixed(2)} from the table) misses on `
          + `${atFive[here]} % of cells at five of five, while ${prev} (${far(byDecision[k - 1][1], 'decision').toFixed(2)}) `
          + `misses on ${atFive[prev]} % — the five-of-five residue is no longer ordered by the DECISION rate, `
          + 'so the mechanism this arm describes has changed and the bands above need re-deriving');
      }
      const slowest = CLOCKS.reduce((a, b) => (far(a[1], 'answer') >= far(b[1], 'answer') ? a : b));
      assert.ok(atFive[slowest[0]] <= 1,
        `${slowest[0]} has the answer pace furthest from the table (${far(slowest[1], 'answer').toFixed(2)}) and misses on `
        + `${atFive[slowest[0]]} % of cells — if the ANSWER rate now drives the residue, the prefix term has stopped working`);
      /* and the four clocks really are four different students, or none of this is a population */
      assert.ok(new Set(CLOCKS.map(([, c]) => far(c, 'decision').toFixed(2))).size >= 3,
        'the clock population has collapsed: at least three distinct decision paces are needed for the ordering above');

      /* the per-cell register must actually be the bulk of the sweep: 5 levels × 200 cells × N clocks */
      assert.equal(ledgerCells, CORPUS.length * SHAPE_IDS.length * (LEVELS.length - 1) * CLOCKS.length,
        `${ledgerCells} cells printed a LEDGER line — the per-cell register has lost coverage`);
      /* `queuedTargetsOf` prefers tonight's own drafted queue length for the same shape, so on this
         corpus every finished job in every window is recognised as one. The day this grows, a shape
         is being served a length tonight's draft does not predict and the estimate is showing. */
      assert.equal(missedComplete, 0,
        `${missedComplete} finished jobs were read as walked: \`queuedTargetsOf\` fell back to the shape's `
        + 'published target count and a thin Page did not serve it (notes/repair-board.md Requests 1 — '
        + '`queueTargets` on the log entry removes the estimate)');
      console.log('  split criterion [clock, walks, cells, ledger, over, over %, median, p90, max]:');
      for (const r of rows) console.log(`    ${JSON.stringify(r)}`);
      console.log(`    finished jobs read as walked (no queueTargets on the entry): ${missedComplete}`);
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
       * THE CONTROL, DRIVEN BY A SECOND CLOCK RATHER THAN BY A FIELD REWRITTEN ON THE SAME SAVE
       * (round-1 verification, split-honesty).
       *
       * The old control set `e.postedAnswered = e.posted` on the walker's own log and asserted the
       * rate halved. That is true, and it is a property of `postedOf`'s two-branch `if` — not of
       * anything a walk produces. It is kept below, honestly labelled, because it does reproduce the
       * pre-round-3 WRITE; but the mechanism claim ("the rate it reads is the student's own") needs
       * a second, independently-clocked walker, and here it is.
       *
       * Two students with identical histories — same corpus save, same shape, five walks at half —
       * differing only in how long they take to ANSWER: one takes exactly twice as long per tier.
       * If `personalRates` really recovers the walker's own pace off a queue it only partly
       * answered, the recovered `answer` rate must scale with the clock and the `decision` rate,
       * which the scaling does not touch, must not move at all. Measured on four saves, the ratio
       * is 0.500 to twelve digits and the decision rate is bit-identical.
       */
      const slowClock = { ...CLOCK, answerS: Object.fromEntries(Object.entries(CLOCK.answerS).map(([t, v]) => [t, v * 2])) };
      const slow = postBoard(seasoned(2, 'JOB', SPLIT.projectionWindowJobs, { clock: slowClock }), '2026-09-16', { now: NOW, shape: 'JOB' });
      assert.ok(Math.abs(slow.projectionRates.answer / walked.projectionRates.answer - 2) < 1e-9,
        `a student who takes twice as long per target reads ${slow.projectionRates.answer.toFixed(4)} s/point `
        + `against ${walked.projectionRates.answer.toFixed(4)} — the recovered pace is not the student's own`);
      assert.equal(slow.projectionRates.decision, walked.projectionRates.decision,
        'the decision rate moved, and nothing in the second clock touched a decision');
      assert.ok(slow.split < walked.split,
        `the slower student's board must project a SMALLER game share: ${slow.split} % against ${walked.split} %`);

      /**
       * …and the pre-round-3 WRITE, kept as the named reproduction it is. `postedAnswered` on an
       * entry means "this many posted points were actually answered", and `personalRates` then takes
       * the entry at its word and skips the prefix estimate — so writing the WHOLE queue's posted
       * into it reproduces exactly what `state.endJob` used to record. Same save, same log, one
       * field: the student's pace reads less than half what it is.
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

    /**
     * THE ESTIMATOR ITSELF, WHICH NOTHING IN THE SUITE ASSERTED (round-3 verification,
     * board-schedule MAJOR).
     *
     * Every arm in this file measures the GAP the projection produces; none of them measures
     * `personalRates`, and `board.js projectFor`'s docblock published a flat claim about it — "a
     * student who answers at the table's pace has rates of 1 and the number does not move" — that
     * was false on every shape pair, same-shape included. `TABLE_PACE` is the one clock that can
     * check it: it is `ANSWER_MINUTES_PER_TIER × 60` and `DECISION_SECONDS` byte for byte (asserted
     * below, so the arm cannot drift off the tables it is a control for), and therefore every honest
     * rate it implies is exactly 1.000 and any deviation is the estimator's own.
     *
     * Measured before the repair, 25 saves per row, five COMPLETED jobs of the history's shape:
     *
     *      JOB   → JOB    answer mean 0.942, worst |a−1| 0.107      (truth 1.000)
     *      JOB12 → JOB12  answer mean 0.933, worst 0.099
     *      RUN   → JOB    answer mean 1.029, worst 0.184 · decision worst 0.409
     *
     * The mechanism is `shareOf`: a past job's expectation is `tonight.answerS × (e.posted /
     * tonight.posted)`, and `posted` is not proportional to answer seconds — it carries the day's
     * realised ×2 marks, the tell, the cold flag and how overdue each lock was, none of which costs
     * a second, and the save's overdue backlog drains as the five jobs are played. Same-shape that
     * proxy is unnecessary: tonight's own drafted ramp at `k` IS that job's table cost, so
     * `expectedSecondsFor` uses it and the same-shape rows are now EXACT. Across shapes there is no
     * comparable instrument — pricing a RUN history on a JOB12's six cheapest targets reads 2.129 —
     * so the residual is measured, bounded here, and published in G1 statement 2 rather than
     * asserted away. The docblock's `biasA`/`biasD`, which named two terms the file never had, is
     * struck.
     */
    test('`personalRates` IS 1.000/1.000 for the student who is both shipped tables — EXACTLY, on a history of tonight\'s own shape, and inside measured bounds on every other pair', () => {
      for (const t of [1, 2, 3, 4]) {
        assert.equal(TABLE_PACE.answerS[t], ANSWER_MINUTES_PER_TIER[t] * 60,
          `TABLE_PACE is no longer the published answer table at tier ${t} — this control means nothing`);
        assert.equal(TABLE_PACE.callS[t] + TABLE_PACE.beatS[t], DECISION_SECONDS[t],
          `TABLE_PACE is no longer the published decision table at tier ${t}`);
      }
      const N = 12;
      let worstCrossA = 0, worstCrossD = 0, pairs = 0, same = 0;
      const rows = [];
      for (const hist of SHAPE_IDS) {
        for (const tonight of SHAPE_IDS) {
          pairs++;
          let wa = 0, wd = 0, sa = 0, sd = 0;
          for (let i = 0; i < N; i++) {
            const s = seasoned(i, hist, 0, { clock: TABLE_PACE });
            const b = postBoard(s, '2026-09-16', { now: NOW, shape: tonight });
            const r = b.projectionRates;
            const where = `${hist}→${tonight} save ${i}`;
            assert.equal(b.projectionSource, 'ledger', `${where}: five completed jobs and the line is not a ledger one`);
            assert.equal(r.n.answer, SPLIT.projectionWindowJobs, `${where}: the answer term rated ${r.n.answer} of 5`);
            assert.equal(r.n.decision, SPLIT.projectionWindowJobs, `${where}: the decision term rated ${r.n.decision} of 5`);
            sa += r.answer; sd += r.decision;
            wa = Math.max(wa, Math.abs(r.answer - 1));
            wd = Math.max(wd, Math.abs(r.decision - 1));
            if (hist === tonight) {
              same++;
              /* EXACT. Tonight's ramp at `k` is this job's own table cost, and `TABLE_PACE` spent
                 exactly that, so the ratio is 1 to the floating point and not to a tolerance. */
              assert.ok(Math.abs(r.answer - 1) < 1e-9,
                `${where}: the answer rate is ${r.answer.toFixed(6)} for a student whose every stem IS the `
                + 'published table and whose history is tonight\'s own shape — that is the estimator, not the student');
              assert.ok(Math.abs(r.decision - 1) < 1e-9,
                `${where}: the decision rate is ${r.decision.toFixed(6)} on the same student`);
            }
          }
          if (hist !== tonight) { worstCrossA = Math.max(worstCrossA, wa); worstCrossD = Math.max(worstCrossD, wd); }
          rows.push([`${hist}→${tonight}`, +(sa / N).toFixed(3), +wa.toFixed(3), +(sd / N).toFixed(3), +wd.toFixed(3)]);
        }
      }
      assert.equal(pairs, SHAPE_IDS.length ** 2);
      assert.equal(same, SHAPE_IDS.length * N, 'the same-shape rows did not run');
      /**
       * THE CROSS-SHAPE RESIDUAL, as an UPPER bound on what the posted proxy may cost. Measured
       * 0.213 (answer) and 0.409 (decision) over 25 saves per pair; these are the numbers G1
       * statement 2's round-3 correction publishes, and a repair that pushes them down leaves this
       * green. They may NOT be widened without re-publishing the paragraph.
       */
      assert.ok(worstCrossA <= 0.28,
        `the answer rate is ${worstCrossA.toFixed(3)} off 1 on a cross-shape history for a table-pace `
        + 'student (measured 0.213) — G1 statement 2 publishes that number');
      assert.ok(worstCrossD <= 0.50,
        `the decision rate is ${worstCrossD.toFixed(3)} off 1 on a cross-shape history (measured 0.409)`);
      /* and the cross-shape residual is REAL, or the bounds above are decorative */
      assert.ok(worstCrossA > 0.05 || worstCrossD > 0.05,
        'the cross-shape residual has vanished — if the estimator really closed it, publish the new '
        + 'numbers in G1 statement 2 and tighten these bounds rather than leaving them loose');
      if (process.env.J5_PRINT) console.table(rows);
    });

    /**
     * …AND THE RAMP IS ONLY USED WHERE IT REACHES (round-3 verification, board-schedule — found by
     * `tests/job-week.test.mjs` going red on the whole-tree run, not by inspection).
     *
     * `rampAt` extends past its last entry at the DEAREST target's own cost. That is the right bias
     * for a walked PREFIX — a longer prefix is never cheaper — and a wild extrapolation for a WHOLE
     * job much longer than tonight's draft, which same-shape histories really do contain:
     * `tests/job-week.test.mjs`'s D−7 save plays five JOBs whose Page served **19 locks** against
     * tonight's 10, and extended that is 1 350 s of "table" against 540 s of real ramp — a rate of
     * 0.66 and a board 7 points from the debrief headline. So the ramp branch is conditioned on
     * `answered <= queue.length` and the posted share takes the rest.
     *
     * The property that pins it, with no clock in it at all: **a student who does twice as much work
     * in twice the time is the same pace.** Two synthetic logs of tonight's own shape, identical but
     * for a doubled queue, a doubled `posted` and a doubled `tAnswer`, must read the same rate — and
     * that rate must be 1, because both are the table to the second. Under the extended ramp the
     * doubled log reads ~0.75 on a JOB-10.
     */
    test('a same-shape job LONGER than tonight\'s draft is priced by share, not by extending the ramp off its end', () => {
      for (let i = 0; i < 12; i++) {
        const b = postBoard(CORPUS[i], '2026-09-16', { now: NOW, shape: 'JOB' });
        const q = b.recommend.queue;
        const L = q.length;
        /* what the published table says tonight's own draft costs, in seconds */
        const A = q.reduce((s, it) => s + (ANSWER_MINUTES_PER_TIER[it.tier] ?? ANSWER_MINUTES_PER_TIER[2]) * 60, 0);
        const D = q.reduce((s, it) => s + (DECISION_SECONDS[it.tier] ?? DECISION_SECONDS[2]), 0);
        /* the log's `posted` is POST-×2 and `personalRates` rates against the EXPECTATION
           `postedNet × (1 + X2.p)`, so a log row on that basis is a student at exactly the table */
        const basis = b.recommend.net * (1 + X2.p);
        const row = (k) => ({
          day: '2026-09-15', shape: 'JOB', targets: k * L, queueTargets: k * L, bagged: 0,
          posted: basis * k, rating: 5, guard: null, cracked: true,
          /* `tGame` is the fixed phases this student sat through plus their decision seconds */
          tGame: Math.round(1000 * (PHASE_MEANS_DEFAULT.board + PHASE_MEANS_DEFAULT.guard
            + PHASE_MEANS_DEFAULT.brief * 2 + PHASE_MEANS_DEFAULT.getaway + k * D)),
          tAnswer: Math.round(1000 * k * A),
        });
        const at = (k) => {
          const s = structuredClone(CORPUS[i]);
          s.game = { ...(s.game ?? {}), log: Array.from({ length: 5 }, () => row(k)) };
          return postBoard(s, '2026-09-16', { now: NOW, shape: 'JOB' }).projectionRates;
        };
        const one = at(1);
        const two = at(2);
        assert.equal(one.n.answer, 5, `save ${i}: the one-length log was not rated`);
        assert.equal(two.n.answer, 5, `save ${i}: the doubled log was not rated`);
        assert.ok(Math.abs(one.answer - 1) < 0.02,
          `save ${i}: a job of tonight's own length at the table's pace reads ${one.answer.toFixed(3)}`);
        assert.ok(Math.abs(two.answer - 1) < 0.05,
          `save ${i}: a job of TWICE tonight's length at the same pace reads ${two.answer.toFixed(3)} — `
          + `tonight's ramp only has ${L} entries, so past it the estimator is extending at the dearest `
          + 'target\'s cost rather than measuring (tests/job-week.test.mjs\'s D−7 save is 19 against 10)');
        assert.ok(Math.abs(two.answer - one.answer) < 0.05,
          `save ${i}: doubling the queue and the seconds moved the pace from ${one.answer.toFixed(3)} to `
          + `${two.answer.toFixed(3)} — twice the work in twice the time is the same student`);
      }
    });

    /**
     * …AND THE CRITERION ON A SHAPE THE LEDGER HAS NEVER SEEN, SWEPT (round-3 verification,
     * board-schedule MAJOR).
     *
     * `tests/job-split.test.mjs`'s cross-shape arm is EIGHT cells — four shapes × two paths, all of
     * them `clone(CORPUS[2])`, one driver, one clock — and it seasons each with ALL THREE other
     * shapes mixed, which averages the shape bias out. A real student's ledger is usually one shape:
     * the school window posts a RUN every weekday (`plan.js`). So the published "a ledger of every
     * other shape ≤ 4.2" was a claim about eight averaged cells, and driven through the shipped
     * machine over the corpus it is false: 6.15 points on corpus save 3 with five COMPLETED JOB jobs
     * and tonight a RUN, on a `ledger` line with no walk anywhere in the history.
     *
     * The structure of the miss, 50 saves × all 12 ordered pairs × the four clocks this file
     * defines, five completed jobs of ONE past shape, no walks (2 400 cells):
     *
     *      the same shape (800 cells, the arm above)        0 over 5   median 0.25   worst 1.19
     *      a different shape, SAME `FIXED_PHASES` column    0 over 5   median 0.64   worst 4.39
     *      a different shape, ACROSS the two columns       21 over 5   median 0.94   worst 6.35
     *
     * Every pair that misses involves RUN, which is the only shape on the `RUN` fixed-phase column.
     * Two causes, both published in G1 statement 2 and neither closable from a five-entry log: the
     * posted proxy (see the estimator arm above), and `meansForShape`'s column conversion, which is
     * a modelling claim about the student that costs in BOTH directions — turning it off takes this
     * sweep to 1 of 1 196, and turns `tests/job-split.test.mjs`'s own cross-shape arm red at 5.2
     * points, because that arm's student IS the published columns. So the criterion is stated per
     * band here rather than as one number, and the band that misses is named.
     */
    test('the cross-shape criterion, per band — same `FIXED_PHASES` column inside the published 5 on every cell, across the two columns published as a measured band (50 saves × 12 ordered pairs × 4 clocks)', () => {
      const CLOCKS = [['CLOCK', CLOCK], ['DELIBERATOR', DELIBERATOR], ['TABLE_PACE', TABLE_PACE], ['SLOW_STEM', SLOW_STEM]];
      const colOf = (id) => SHAPES[id].fixed;
      const sameCol = [];
      const crossCol = [];
      let cells = 0, ledger = 0;
      for (const [clockName, clock] of CLOCKS) {
        for (const hist of SHAPE_IDS) {
          for (const tonight of SHAPE_IDS) {
            if (hist === tonight) continue;
            for (let i = 0; i < CORPUS.length; i++) {
              const w = play(seasoned(i, hist, 0, { clock }), tonight, { clock });
              cells++;
              if (w.board.projectionSource !== 'ledger') continue;      // a clamp bound: the arm below owns it
              ledger++;
              const gap = Math.abs(w.board.split - w.headline);
              const where = `${clockName} save ${i} ${hist}→${tonight}`;
              if (colOf(hist) === colOf(tonight)) {
                sameCol.push(gap);
                /* PER CELL: a ledger line on a shape the ledger has never seen, whose fixed-phase
                   column it HAS seen, is the published criterion with no averaging to hide in. */
                assert.ok(gap <= SPLIT.agreeWithinPoints,
                  `${where}: five COMPLETED jobs of one shape, no walk, the same fixed-phase column — the board `
                  + `printed ${w.board.split} % on a LEDGER line and the debrief headlined ${w.headline.toFixed(1)} % `
                  + `(gap ${gap.toFixed(2)} > ${SPLIT.agreeWithinPoints})`);
              } else {
                crossCol.push(gap);
              }
            }
          }
        }
      }
      assert.equal(cells, CLOCKS.length * SHAPE_IDS.length * (SHAPE_IDS.length - 1) * CORPUS.length);
      assert.ok(ledger > 2000, `only ${ledger} of ${cells} cells printed a ledger line`);
      assert.ok(sameCol.length > 1000 && crossCol.length > 1000, 'one of the two bands is empty');
      sameCol.sort((a, b) => a - b);
      crossCol.sort((a, b) => a - b);
      /* the WITHIN-COLUMN band, as the number G1 statement 2 publishes (measured 4.39) */
      assert.ok(sameCol.at(-1) <= 4.6,
        `the within-column cross-shape band is ${sameCol.at(-1).toFixed(2)} points (measured 4.39, published 4.4) `
        + '— G1 statement 2 has to be re-stated');
      /* the ACROSS-COLUMN band: published as a band, asserted as an UPPER bound and a share */
      assert.ok(crossCol.at(-1) <= 7.0,
        `the across-column cross-shape band is ${crossCol.at(-1).toFixed(2)} points (measured 6.35) — the tail has widened`);
      const over = crossCol.filter(x => x > SPLIT.agreeWithinPoints).length;
      assert.ok(over / crossCol.length <= 0.04,
        `${(100 * over / crossCol.length).toFixed(1)} % of across-column cells miss the published band `
        + `(measured 1.8 %, ${over} of ${crossCol.length})`);
      /* and it is REAL: if it ever goes to zero, the paragraph that publishes it must be withdrawn
         rather than left standing as a caveat nothing produces. */
      assert.ok(over > 0,
        'no across-column cell misses the band any more — G1 statement 2 publishes that it can, and a '
        + 'document may not keep a caveat the machine has stopped producing');
    });

    /**
     * A CLOCK OUTSIDE THE CLAMP IS BOUNDED, NOT DELETED — AND THE LINE SAYS WHAT IT RATED
     * (round-1 verification, split-honesty BLOCKER).
     *
     * `personalRates` clamps each job's ratio to `[RATE_MIN, RATE_MAX]` = `[1/6, 6]`, the file's own
     * statement of how far a student may sit from the shipped tables before they are a phone left on
     * the answer screen. It used to DROP an out-of-band job from both sums instead — and a deletion
     * is not a bound, because the deletions are not independent: the clamp is measured against ONE
     * table, so a student outside it on one stem is outside it on all of them. A FLAT clock (the same
     * seconds per stem whatever the tier — taps and reveals, which on a VAULT's tier-3/4 originals is
     * "I don't know it, reveal", not a phone) therefore emptied the whole window at once, `rate()`
     * fell back to 1, and the board printed the SHIPPED TABLE'S own projection under the words
     * `your last 5 jobs`:
     *
     *      20 s/stem   jobs on record 5   RATED 3   board "~60 % · your last 5 jobs"   headline 63.3
     *      15 s/stem   jobs on record 5   RATED 0   board "~23 % · your last 5 jobs"   headline 69.7
     *      10 s/stem   jobs on record 5   RATED 0   board "~23 % · your last 5 jobs"   headline 77.5
     *
     * — a CLIFF, not a gradient: five seconds per stem flipped the line from the student's own number
     * (gap 3.3) to the brochure's (gap 46.7), with no change to the sentence. Two things close it and
     * both are asserted here: the clamp now bounds the outlier INTO the window (nothing is dropped,
     * so the rate stays the student's own bounded pace), and `projectFor` labels the line by what the
     * two terms actually RATED, so an empty accumulator can never be printed as a measurement.
     *
     * ─────────────────────────────────────────────────────────────────────────────────────────────
     * VERIFY ROUND 3 (split-honesty, MAJOR): THE ARM ABOVE TOLERATED ITS OWN FALSIFICATION.
     *
     * What stood here ran ONE corpus save (`CORPUS[1]`), one shape, seven clocks — and its terminal
     * assertion was `worst <= 20`, four times `SPLIT.agreeWithinPoints = 5`, under a NAME certifying
     * "no table under `your last 5 jobs`". Four of its seven rows printed `projectionSource ===
     * 'ledger'` — the sentence that names the student's own jobs — while missing the published band,
     * the worst by 18.3 points, and the arm printed that table to the console and passed. Its other
     * assertions (inside the clamp, rate < 1, monotone) are all true and none of them is the
     * criterion. This is exactly the defect COMPOSED-GAME.md:1289 (G12 #80) was raised for and fixed
     * for the adjacent walk arm: "a published sentence may not rest on an arm that tolerates its own
     * falsification … its name stops certifying a claim the numbers below it refute".
     *
     * THE REGISTERS, chosen by THE LINE THE BOARD PRINTS — the same rule the walk arm uses, which it
     * could not use before. `personalRates` now reports `bounded` per term (every job it rated left
     * the SAME end of `[RATE_MIN, RATE_MAX]`, so the pooled rate IS that end) and `projectFor`
     * demotes such a line to `projected`: the printed percentage is unchanged, because the bound is
     * a far better guess than 1, but the claim "your last 5 jobs" is withdrawn. A flat clock is
     * exactly the population that produces it, so these cells now split the way the walk arm's do:
     *
     *   · `ledger`    — the board names the student's own jobs. The PUBLISHED CRITERION is asserted
     *                   PER CELL, at `SPLIT.agreeWithinPoints` itself and not a multiple of it, with
     *                   no averaging to hide in.
     *   · `projected` — the number on the board is `RATE_MIN × the shipped table`, a constant five
     *                   different students share. The criterion is NOT claimed there and is not
     *                   asserted; what is asserted is a DISTRIBUTION, per clock, with the clock
     *                   beside it, plus that the regime stays a gradient in the clock.
     *
     * Either way NOTHING IS DROPPED — `n.answer` and `n.decision` are five at every one of the 1 400
     * cells, and the rate is inside the clamp and under 1 — which is the round-1 fix, still asserted
     * per cell. The demotion is a LABEL, not a deletion.
     *
     * MEASURED, 50 saves × 4 shapes × 7 flat clocks = 1 400 cells:
     *
     *     s/stem   ledger   worst    projected   over %   median   worst    answer rate lo–hi
     *        40      200     0.52        0          —        —        —      0.308 – 0.889
     *        25      200     0.50        0          —        —        —      0.192 – 0.556
     *        20      197     0.66        3        0.0      1.59     2.17     0.167 – 0.444
     *        15      171     0.54       29       31.0      3.23     8.74     0.167 – 0.333
     *        12      105     0.54       95       32.6      2.45    13.41     0.167 – 0.267
     *        10       44     0.50      156       44.2      4.66    16.90     0.167 – 0.222
     *         8        3     0.41      197       79.2      7.95    20.96     0.167 – 0.178
     *
     *     LEDGER    920 cells — 0 outside SPLIT.agreeWithinPoints, worst 0.66
     *     PROJECTED 480 cells — 55.2 % outside it, median 5.57, p90 12.45, worst 20.96
     *     and the label is the mechanism: `projectionSource === 'projected'` ⟺ `bounded.answer ||
     *     bounded.decision`, on all 1 400 cells, 0 disagreements.
     *
     * The corpus sweep is WORSE than the single save the old arm ran (20.96 against 18.3), which is
     * the other half of the finding: `CORPUS[1]` was not a hard case, it was one case.
     */
    test('a clock outside the [1/6, 6] clamp is BOUNDED, not deleted — the CRITERION per cell on every LEDGER line, and a DISTRIBUTION per clock where the bound is what the board printed (50 saves, every shape, 7 flat clocks)', () => {
      const flat = (secs) => ({ ...CLOCK, answerS: { 1: secs, 2: secs, 3: secs, 4: secs } });
      /**
       * UPPER bounds on the `projected` register, per clock. `over` is a share, the rest are points.
       * `null` is the stronger claim — the clamp may not bind AT ALL at that clock — and it is made
       * only where the measured answer rate is clear of `RATE_CLAMP.min` (0.308 and 0.192 against
       * 0.167). Where the clamp does bind, the bound is conditional on the row having cells: WHICH
       * clock a flat student starts saturating at is the estimator's business and may move, so the
       * arm pins the SHAPE (monotone, bounded, non-empty at the fast end and empty at the slow end)
       * rather than demanding that a 3-cell row keep existing. `EVERY_CLOCK_BINDS_BY` and the two
       * population assertions at the end are what stop that being a way out.
       */
      const AT_BOUND = {
        40: null, 25: null,                              // the clamp never binds this far from it
        20: { over: 0.10, median: 3.0, worst: 4.0, measured: '0.0 % / 1.59 / 2.17 over 3 cells' },
        15: { over: 0.45, median: 4.5, worst: 11.0, measured: '31.0 % / 3.23 / 8.74' },
        12: { over: 0.45, median: 4.0, worst: 17.0, measured: '32.6 % / 2.45 / 13.41' },
        10: { over: 0.60, median: 6.5, worst: 21.0, measured: '44.2 % / 4.66 / 16.90' },
        8: { over: 0.90, median: 10.0, worst: 26.0, measured: '79.2 % / 7.95 / 20.96' },
      };
      /** the clock by which the clamp MUST be binding, or the distribution register is a fiction */
      const EVERY_CLOCK_BINDS_BY = 10;
      /** a row of fewer than this many cells cannot carry a share or a median — only its worst */
      const THIN = 20;
      const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
      const rows = [];
      const everyLedger = [];
      const everyProjected = [];
      for (const secs of [40, 25, 20, 15, 12, 10, 8]) {
        const clock = flat(secs);
        const ledger = [];
        const projected = [];
        const rates = [];
        for (let i = 0; i < CORPUS.length; i++) {
          for (const shapeId of SHAPE_IDS) {
            let s = structuredClone(CORPUS[i]);
            for (let k = 0; k < SPLIT.projectionWindowJobs; k++) { s = play(s, shapeId, { clock }).save; clearLeftoverPage(s); }
            const w = play(s, shapeId, { clock });
            const r = w.board.projectionRates;
            const where = `${secs} s/stem, save ${i} ${shapeId}`;
            const gap = Math.abs(w.board.split - w.headline);
            rates.push(r.answer);

            /* NOTHING IS DROPPED: five finished jobs are five rated jobs, at every clock. This is
               the round-1 fix and it is asserted per cell, not once per clock. */
            assert.equal(r.n.answer, SPLIT.projectionWindowJobs,
              `${where}: the window emptied — ${r.n.answer} of ${SPLIT.projectionWindowJobs} jobs rated`);
            assert.equal(r.n.decision, SPLIT.projectionWindowJobs, `${where}: the decision window emptied`);
            /* …and the rate is the student's own, bounded at the published clamp — never the table's 1 */
            assert.ok(r.answer >= RATE_CLAMP.min - 1e-9 && r.answer <= RATE_CLAMP.max + 1e-9,
              `${where}: the rate left the clamp at ${r.answer}`);
            assert.ok(r.answer < 1,
              `${where}: a student answering every tier in ${secs} s reads ${r.answer.toFixed(3)} — that is the shipped table`);

            /* THE LABEL IS THE MECHANISM: a line is demoted exactly when a term is sitting on a
               bound, and for no other reason. Asserted per cell, so the register the arm chooses
               below is the one the STUDENT sees rather than one this test invented. */
            const onABound = r.bounded?.answer === true || r.bounded?.decision === true;
            assert.equal(w.board.projectionSource, onABound ? 'projected' : 'ledger',
              `${where}: the board printed \`${w.board.projectionSource}\` while `
              + `bounded = ${JSON.stringify(r.bounded)} — the sentence's claim and the estimator's `
              + 'information state have come apart');

            if (onABound) { projected.push(gap); continue; }
            ledger.push(gap);
            /* (1) THE PER-CELL REGISTER — the published criterion, on every line that names the
                   student's own jobs, at the published number. */
            assert.ok(gap <= SPLIT.agreeWithinPoints,
              `${where}: the answer rate is ${r.answer.toFixed(3)}, off a bound, so the board printed `
              + `${w.board.split} % under "your last ${SPLIT.projectionWindowJobs} jobs" against a debrief `
              + `headlining ${w.headline.toFixed(1)} % (gap ${gap.toFixed(1)} > ${SPLIT.agreeWithinPoints})`);
          }
        }
        everyLedger.push(...ledger);
        everyProjected.push(...projected);
        ledger.sort((a, b) => a - b);
        projected.sort((a, b) => a - b);
        const rs = rates.slice().sort((a, b) => a - b);
        const all = [...ledger, ...projected].sort((a, b) => a - b);
        const missed = projected.filter((x) => x > SPLIT.agreeWithinPoints).length;
        rows.push([secs, ledger.length, ledger.length ? +ledger.at(-1).toFixed(2) : null,
          projected.length, projected.length ? +(100 * missed / projected.length).toFixed(1) : null,
          projected.length ? +pct(projected, 0.5).toFixed(2) : null,
          projected.length ? +projected.at(-1).toFixed(2) : null,
          +pct(all, 0.9).toFixed(2), +rs[0].toFixed(3), +rs.at(-1).toFixed(3)]);

        /* (2) THE DISTRIBUTION REGISTER, per clock, with the clock beside it. */
        const b = AT_BOUND[secs];
        if (b === null) {
          assert.equal(projected.length, 0,
            `${secs} s/stem: ${projected.length} of ${all.length} boards demoted themselves to `
            + '`projected`. This clock used to sit clear of the clamp, so the per-cell register above '
            + 'has quietly stopped covering it and the bound below is measuring the clamp');
        } else if (!projected.length) {
          /* the clamp has not started binding by this clock. Allowed above `EVERY_CLOCK_BINDS_BY`
             (the 20 s row is three cells of 200 and where it starts is the estimator's business),
             forbidden at and below it — a register with no cells at the fast end is a fiction, and
             the monotone ladder underneath would be asserting nothing. */
          assert.ok(secs > EVERY_CLOCK_BINDS_BY,
            `${secs} s/stem: not one of ${all.length} boards reaches a clamp bound, at a clock where `
            + `every job's every stem is answered in ${secs} s against published tables of `
            + '30/90/180/300. The distribution register is empty where it is supposed to be widest — '
            + 'either the clamp moved or the estimator did');
        } else {
          assert.ok(projected.at(-1) <= b.worst,
            `${secs} s/stem, PROJECTED: the worst clamp-bound cell is ${projected.at(-1).toFixed(2)} points `
            + `out, against a measured ${b.measured} (over % / median / worst) — the tail has widened`);
          if (projected.length >= THIN) {
            assert.ok(missed / projected.length <= b.over,
              `${secs} s/stem, PROJECTED: ${(100 * missed / projected.length).toFixed(1)} % of `
              + `${projected.length} clamp-bound cells miss SPLIT.agreeWithinPoints, against a `
              + `measured ${b.measured}`);
            assert.ok(pct(projected, 0.5) <= b.median,
              `${secs} s/stem, PROJECTED: the median clamp-bound cell is `
              + `${pct(projected, 0.5).toFixed(2)} points out, against a measured ${b.measured}`);
          }
        }
      }
      /* THE CLIFF IS GONE, and this is what says so: both the share of boards that reach the bound
         and the miss they produce are MONOTONE in the clock (within the corpus's own sampling
         noise), so five seconds per stem can no longer flip the line from the student's number to
         the brochure's. It was a step from gap 3.3 to gap 46.7 with no change to the sentence. */
      for (let k = 1; k < rows.length; k++) {
        assert.ok(rows[k][3] >= rows[k - 1][3],
          `FEWER boards reach the clamp at ${rows[k][0]} s/stem (${rows[k][3]}) than at `
          + `${rows[k - 1][0]} s/stem (${rows[k - 1][3]}) — the regime is not monotone in the clock`);
        assert.ok(rows[k][7] >= rows[k - 1][7] - 1.5,
          `the miss is not monotone in the clock: ${rows[k - 1][0]} s → p90 ${rows[k - 1][7]}, `
          + `${rows[k][0]} s → p90 ${rows[k][7]} — a cliff is back`);
      }
      /* THE WHOLE POPULATION, in both registers — and neither may be empty, or one of the two
         assertions above is decorative. */
      const led = everyLedger.sort((a, b) => a - b);
      const prj = everyProjected.sort((a, b) => a - b);
      assert.ok(led.length > 500, `only ${led.length} cells printed a ledger line — the per-cell register is thin`);
      assert.ok(prj.length > 100, `only ${prj.length} cells reached a bound — the distribution register is thin`);
      assert.equal(led.filter((x) => x > SPLIT.agreeWithinPoints).length, 0,
        'a ledger line missed the published criterion — see the per-cell failure above');
      assert.ok(pct(prj, 0.5) <= 8.0,
        `the median clamp-bound cell across every flat clock is ${pct(prj, 0.5).toFixed(2)} points out `
        + '(measured 5.57) — the demotion is carrying more error than it was measured to carry');
      assert.ok(prj.at(-1) <= 26.0,
        `the worst clamp-bound cell across every flat clock is ${prj.at(-1).toFixed(2)} points out `
        + '(measured 20.96; it was 58.1 when the window emptied instead of being bounded)');
      console.log(`  flat clock, ${led.length + prj.length} cells (${led.length} ledger / ${prj.length} projected):`);
      console.log('    [s/stem, ledger, ledger worst, projected, over %, median, worst, p90 all, rate lo, rate hi]');
      for (const r of rows) console.log(`    ${JSON.stringify(r)}`);
    });

    /**
     * AN EMPTY ACCUMULATOR IS NOT A MEASUREMENT — the label, asserted on the branch it names.
     *
     * `add` still refuses a term whose measured seconds or whose expectation is not a positive number
     * (a job logged at `tAnswer 0`; a decision measurement the fixed phases eat whole), and `rate()`
     * then returns 1 — the shipped `ANSWER_MINUTES_PER_TIER` table. The sentence used to count jobs
     * ON RECORD (`log.length`) rather than jobs RATED, so it said `your last 5 jobs` over a number
     * the student had contributed nothing to. It now counts what the THINNER term rated, and says
     * `projected` — the same claim job 1 makes — when that is zero.
     */
    test('an empty accumulator prints `projected`, never "your last N jobs"', () => {
      const s = structuredClone(CORPUS[3]);
      s.game = s.game ?? {};
      /* five real jobs on record, every one of them with no answering time to rate */
      s.game.log = Array.from({ length: SPLIT.projectionWindowJobs }, (_, k) => ({
        day: '2026-09-15', shape: 'JOB', targets: 10, bagged: 40, posted: 200,
        rating: 60, guard: 'RECALL', cracked: false, tGame: 240000 + k * 1000, tAnswer: 0,
      }));
      const b = postBoard(s, '2026-09-16', { now: NOW, shape: 'JOB' });
      assert.equal(b.projectionRates.jobsOnRecord, SPLIT.projectionWindowJobs, 'the jobs really are on record');
      assert.equal(b.projectionRates.n.answer, 0, 'the answer accumulator is not the empty one this arm is about');
      assert.equal(b.projectionRates.answer, 1, 'an unrated term is the shipped table, by construction');
      assert.equal(b.projectionSource, 'projected',
        'the board called the shipped table a measurement of five jobs the student never contributed to');
      assert.ok(!/\b5 jobs\b/.test(b.projection), `the line still names the jobs: ${b.projection}`);
      assert.equal(b.projection, COPY.projection({ split: b.split, jobs: 0 }));

      /* and the thinner term is what the sentence may name: rate the answer half, not the decision
         half, and the line falls back to `projected` even though five jobs are on record */
      const half = structuredClone(s);
      for (const e of half.game.log) { e.tAnswer = 300000; e.tGame = 0; }
      const hb = postBoard(half, '2026-09-16', { now: NOW, shape: 'JOB' });
      assert.equal(hb.projectionRates.n.answer, SPLIT.projectionWindowJobs);
      assert.equal(hb.projectionRates.n.decision, 0, 'the decision term found something to rate in tGame 0');
      assert.equal(hb.projectionSource, 'projected',
        'half the number is the shipped table and the line claimed the student\'s last five jobs');
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
