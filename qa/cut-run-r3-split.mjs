// qa/cut-run-r3-split.mjs — THE CUT, lane "run", round 3, finding R3-1: what the SHIPPED split
// meter can print. No test and no fix — evidence for the editorial decision CUT-SPEC §8 hands back
// to CUT-BRIEF's owner. Read-only: it drives `site/js/job/state.js` in plain node and prints three
// tables. Usage: node qa/cut-run-r3-split.mjs
const SITE = new URL('../site', import.meta.url).pathname;
const { fresh } = await import(`${SITE}/js/store.js`);
const { pageOpts } = await import(`${SITE}/js/plan.js`);
const JOB = await import(`${SITE}/js/job/state.js`);

const T0 = Date.parse('2026-09-21T16:00:00Z');

/** One session: n questions, d ms deciding on the face-down card, a ms answering. Returns the % printed. */
function run(n, d, a) {
  const s = fresh(T0 - 5 * 86_400_000);
  s.profileId = 'split';
  s.settings.testDate = '2026-09-24';
  JOB.startJob(s, { ...pageOpts(s), now: T0 });
  let t = T0;
  const N = Math.min(n, s.inProgress.queue.length);
  for (let i = 0; i < N; i++) {
    t += d; JOB.call(s, 'not sure', { now: t, ms: d });
    t += a; JOB.answer(s, { cleared: true }, { now: t });
  }
  const g = JOB.stateOf(s);
  return { n: N, pct: JOB.splitOf(g), tGame: g.tGame, tAnswer: g.tAnswer };
}

const pct = (x) => Number(x).toFixed(0);

// 1. the measured session: 4.18 s deciding, 34.7 s answering (critic round 3: tGame 75,251 / 18,
//    tAnswer 623,954 / 18) — at every question count from 1 to 14.
console.log('A. the ratio does not move with the question count (d = 4.18 s, a = 34.7 s)');
console.log('   n   split');
for (const n of [1, 2, 3, 4, 6, 8, 10, 12, 14]) {
  const r = run(n, 4180, 34_664);
  console.log(`  ${String(r.n).padStart(2)}   ${pct(r.pct)} %`);
}

// 2. the CEILING: `deliberation` credits nothing past DELIBERATION_MS, so the most the game half can
//    ever take from one question is just under 24 s. Sweep the deciding time at the measured a.
console.log('\nB. the most the meter can print at the measured answering time (a = 34.7 s, n = 12)');
console.log('   deciding   split');
for (const d of [3000, 6000, 12_000, 18_000, 23_900, 24_100, 30_000, 60_000]) {
  const r = run(12, d, 34_664);
  console.log(`   ${(d / 1000).toFixed(1).padStart(6)} s   ${pct(r.pct)} %`);
}

// 3. the ONE lever CUT-BRIEF names: cut answering time. What must `a` fall to for 45 %?
console.log('\nC. what answering time 45 % needs (n = 12)');
console.log('   deciding   answering at which the print first reaches 45 %');
for (const d of [4180, 6000, 12_000, 23_900]) {
  let found = null;
  for (let a = 500; a <= 60_000; a += 100) {
    const r = run(12, d, a);
    const v = Number(r.pct);
    if (v >= 45) found = a; else break;
  }
  console.log(`   ${(d / 1000).toFixed(1).padStart(6)} s   ${found == null ? 'never' : (found / 1000).toFixed(1) + ' s'}`);
}
