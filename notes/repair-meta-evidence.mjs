/**
 * notes/repair-meta-evidence.mjs — the META lane's verify-round-2 measurement, in the repo.
 *
 *     cd /Users/oliver/Projects/unit1a-quest && node notes/repair-meta-evidence.mjs
 *
 * WHY THIS FILE EXISTS. The verify-2 exploit finding against `COMPOSED-GAME.md` G3.7 proof 8 / G3.8
 * #4 / G9 #6 was measured by a critic in `/tmp`, and macOS reaps `/private/tmp` after ~3 days. The
 * numbers the document now publishes are these, so the reproduction lives beside the note that
 * quotes it — the same arrangement `notes/repair-call-evidence.mjs` already uses.
 *
 * It imports only from `site/`, writes nothing, and is NOT part of `node --test tests/` (the two
 * arms are 48 simulated jobs and take ~40 s). The fast, deterministic half of the same claim — the
 * two unit facts the simulation is built out of — is pinned in the suite, in
 * `tests/job-meta-constants.test.mjs` §"8 · the rank is bought with evidence the game does not price".
 *
 * §1  THE ARMS. Two students, identical start save, EVERY job target cleared in both, identical call
 *     policy (honest rung while climbing, then the top rung the rank unlocked). The ONLY difference
 *     is the `ok` flag on FREE STUDY sittings — sittings that are not job targets. No
 *     `schedule.applyOutcome` runs on them, so Leitner box / due / reps / lapses / ease / rarity,
 *     `skills` and `xp` are byte-identical between the arms; that identity is asserted and printed.
 *     The sandbagger therefore pays NOTHING the game layer prices — no carry, no chain, no rating,
 *     no XP, no bucket, no Readiness — and still moves `w = 4q̂(1−q̂)`, because `call.qHatFor` reads
 *     `save.cards[*].history` and `screens/card.js` pushes an entry there on every graded original,
 *     job or plain Today's Page.
 *
 * §2  THE CAP — CLOSED MID-ROUND, AND WHAT IT DOES NOT CLOSE. The finding also showed that
 *     `slotCeiling` resolved `w`'s two roots by taking the FLATTERING one, so a CHOSEN q̂ = 0.2 slot
 *     at the 85 call was priced exactly as an earned q̂ = 0.8 slot (measured before the change:
 *     q̂ = 0.2 reached Called 3/4, the same band as q̂ = 0.8). While this ticket was open the call
 *     lane landed the save-schema change that closes it — `callEntry` stores `q`, `slotCeiling` uses
 *     it when present — and the run below now shows q̂ ≤ 0.5 capped at 0.00 and ranked Called 2.
 *     **§1 is unchanged by that fix**, and the two runs are byte-for-byte the same, because the
 *     sandbagger's REPORT is honest about the evidence they manufactured. The cap prices the report;
 *     nothing yet prices the action. That is Request A in notes/repair-meta.md.
 */
import * as state from '../site/js/job/state.js';
import * as crew from '../site/js/job/crew.js';
import * as call from '../site/js/job/call.js';
import { fresh } from '../site/js/store.js';
import { rngFrom } from '../site/js/rng.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));

/** `seededSave`, the shape `tests/job-exploit.test.mjs` uses, with the history hit-rate injectable. */
function seededSave(i, { seedTag = 'exh', hitRate = null } = {}) {
  const rng = rngFrom(seedTag, i);
  const s = fresh(NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `exh-${i}`;
  s.settings.testDate = addDays(TODAY, 4 + rng.int(0, 12));
  const n = 28 + rng.int(0, 24);
  for (let k = 0; k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true; rec.rarity = 'gold';
    rec.due = NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({
      at: NOW - (20 - h) * DAY_MS,
      ok: hitRate == null ? rng.chance(0.75) : (h < Math.round(hitRate * 10)),
      attempt: 1, hints: 0, ms: 9000,
    }));
  }
  for (const k of crew.MAKES) {
    if (!rng.chance(0.75)) continue;
    s.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: rng.chance(0.4) ? NOW - DAY_MS : null };
  }
  return s;
}

const CLEAN = Object.freeze({ cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true });

/** The study-layer write `screens/card.js` makes on every graded original, job or Today's Page. */
function writeStudyHistory(save, item, result, at) {
  if (!item || item.kind === 'variant') return null;
  const rec = state.unguard(save)?.cards?.[item.id];
  if (!rec) return null;
  if (!Array.isArray(rec.history)) rec.history = [];
  rec.history.push({ at, ok: result?.cleared === true, attempt: 1, hints: 0, ms: 9000 });
  return rec;
}

function runJob(save, { plan = () => CLEAN, callOf = () => 70, now = NOW, today = TODAY, study = true } = {}) {
  let t = now;
  const step = (ms) => (t += ms);
  state.startJob(save, { today, now: t });
  state.beginTargets(save, { now: step(6000) });
  for (let gN = 0; gN < 500; gN++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      if (g.stakes) state.lockCall(save, callOf(state.answered(save) + 1, save), { now: step(5000) });
      else state.beginAnswer(save, { now: step(1000) });
      continue;
    }
    if (g.phase === 'answer') {
      const it = state.currentItem(save);
      const result = plan(state.answered(save) + 1, save, it);
      const at = step(40000);
      if (study) writeStudyHistory(save, it, result, at);
      state.applyTarget(save, result, { now: at, cards: cardById });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') { state.push(save, { now: step(9000) }); continue; }
    if (g.phase === 'brief') { state.brief(save, {}, { now: step(20000) }); continue; }
    if (g.phase === 'getaway') { state.crack(save, { now: step(25000) }); continue; }
    break;
  }
}

/** A free study sitting on every card that has a history — NO `applyOutcome`, so the ledger is untouched. */
function studySit(save, rate, at, rng) {
  const raw = state.unguard(save);
  for (const id of Object.keys(raw.cards ?? {})) {
    const rec = raw.cards[id];
    if (!Array.isArray(rec.history) || rec.history.length === 0) continue;
    rec.history.push({ at, ok: rng.chance(rate), attempt: 1, hints: 0, ms: 9000 });
  }
}

/** Everything the STUDY layer owns, as one string — the arms must agree on all of it. */
const ledgerOf = (s) => JSON.stringify(Object.entries(state.unguard(s).cards ?? {})
  .map(([k, r]) => [k, r.box, r.due, r.reps, r.lapses, r.ease, r.cleared, r.rarity])
  .concat([['SKILLS', JSON.stringify(state.unguard(s).skills)], ['XP', state.unguard(s).xp]]));

const honestCallOf = (n, s) => {
  const it = state.currentItem(s);
  const q = call.qHatFor(s, it?.skills?.[0] ?? it?.skill, { cards: cardById });
  const legal = call.callsFor(s.player.rank);
  const h = q == null ? 50 : call.honestCall(q);
  return legal.includes(h) ? h : legal[legal.length - 1];
};
const topCallOf = (n, s) => { const c = call.callsFor(s.player.rank); return c[c.length - 1]; };

function play(seed, studyRate, jobs, climb) {
  const save = seededSave(seed, { hitRate: 1.0 });
  const rng = rngFrom(`meta-e12-${studyRate}`, seed);
  let t = NOW; const lootByPhase = [0, 0];
  for (let j = 0; j < jobs; j++) {
    studySit(save, studyRate, t - 3 * 3600e3, rng);
    studySit(save, studyRate, t - 2 * 3600e3, rng);
    const before = (save.game?.log ?? []).reduce((a, e) => a + (e.bagged ?? 0), 0);
    runJob(save, { now: t, today: addDays(TODAY, j), callOf: j < climb ? honestCallOf : topCallOf, plan: () => CLEAN, study: false });
    const after = (save.game?.log ?? []).reduce((a, e) => a + (e.bagged ?? 0), 0);
    lootByPhase[j < climb ? 0 : 1] += after - before;
    t += DAY_MS;
  }
  return { rank: save.player.rank, loot: lootByPhase[0] + lootByPhase[1], phase2: lootByPhase[1], save };
}

const JOBS = 24, CLIMB = 8, SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

console.log('§1  THE RANK IS BOUGHT OUTSIDE THE JOB');
console.log(`    jobs 0..${CLIMB - 1} honest rung, jobs ${CLIMB}..${JOBS - 1} the top rung the RANK unlocked.`);
console.log('    Both arms clear EVERY job target; the only difference is the `ok` flag on free study sittings.\n');
let A = 0, B = 0, A2 = 0, B2 = 0, both = 0, identical = 0;
for (const seed of SEEDS) {
  const a = play(seed, 1.0, JOBS, CLIMB);            // the honest master: clears everything
  const b = play(seed, 0.8, JOBS, CLIMB);            // the sandbagger: 1 free sitting in 5 marked wrong
  A += a.loot; B += b.loot; A2 += a.phase2; B2 += b.phase2;
  if (b.loot > a.loot && b.rank > a.rank) both++;
  const same = ledgerOf(a.save) === ledgerOf(b.save);
  if (same) identical++;
  console.log(`    seed ${seed}: MASTER rank=${a.rank} loot=${Math.round(a.loot)} (phase2 ${Math.round(a.phase2)})`
    + `  |  SANDBAG rank=${b.rank} loot=${Math.round(b.loot)} (phase2 ${Math.round(b.phase2)})`
    + `  → phase2 ${((b.phase2 / a.phase2 - 1) * 100).toFixed(2)}%   study ledger identical: ${same}`);
}
console.log(`\n    TOTAL loot ${Math.round(A)} → ${Math.round(B)} = ${((B / A - 1) * 100).toFixed(2)}%`);
console.log(`    POST-CLIMB ${Math.round(A2)} → ${Math.round(B2)} = ${((B2 / A2 - 1) * 100).toFixed(2)}%`
  + `   sandbag wins BOTH currencies on ${both}/${SEEDS.length}; study ledger identical on ${identical}/${SEEDS.length}`);
console.log(`    published bound before this round: "at most 2.5 % overall" (COMPOSED-GAME.md G3.7 proof 8).\n`);

console.log('§2  THE CAP — the student fails most free sittings, calls 85, and clears every job target anyway.');
console.log('    BEFORE the call lane stored q̂ in the entry: 0.2 → ceiling 5.40 / 7.86, Called 3/4 (the flattering root).');
console.log('    AFTER  it: a CHOSEN q̂ is priced as itself, so only the rate the student REPORTS honestly still pays.\n');
for (const rate of [0.2, 0.3, 0.5, 0.8]) {
  for (const seed of [1, 2]) {
    const save = seededSave(seed, { hitRate: 1.0 });
    const rng = rngFrom(`meta-e24|${rate}`, seed);
    let t = NOW;
    for (let j = 0; j < 24; j++) {
      studySit(save, rate, t - 3 * 3600e3, rng); studySit(save, rate, t - 2 * 3600e3, rng);
      runJob(save, { now: t, today: addDays(TODAY, j), callOf: () => 85, plan: () => CLEAN, study: false });
      t += DAY_MS;
    }
    const d = call.ratingDetail(save.player.rating.calls, 50, { rank: save.player.rank });
    console.log(`    study clear rate ${rate} seed ${seed}: value=${d.value.toFixed(2)} ceiling=${d.ceiling.toFixed(2)}`
      + ` earned=${d.earned.toFixed(2)} n=${d.n} → RANK ${save.player.rank} (${call.rankOf(save.player.rank).name}, ×${call.rankOf(save.player.rank).guardMult})`);
  }
}
