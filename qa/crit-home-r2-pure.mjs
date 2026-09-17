// critic r2 (home) pure scenarios — not part of the artifact
import { readFileSync } from 'node:fs';
const R = await import('../site/js/readiness.js');
const Ms = await import('../site/js/mastery.js');
const OB = await import('../site/js/screens/onboard.js');
const save0 = JSON.parse(readFileSync(new URL('./screenshots/s9/after-ace.json', import.meta.url)));
const clone = (x) => JSON.parse(JSON.stringify(x));
const show = (tag, s) => { const rd = R.readiness(s); console.log(tag.padEnd(46), 'R', rd.r, 'M%', Math.round(rd.M*100), 'prov', rd.provisional, 'weak', R.weakSpots(s).map(w=>w.id+':'+Math.round(w.mShown)).join(','), 'started', R.startedSkills(s).map(w=>w.id+':'+Math.round(w.mShown)).join(',')); return rd; };
console.log('after-ace skills', Object.fromEntries(Object.entries(save0.skills).map(([k,v])=>[k, [Math.round(v.m), v.n, !!v.placedAt, v.misses, v.helped]])));
let s = clone(save0); show('after-ace', s);
const now = Date.now();
// Scenario J: JUMP M1 after 10 clean answers on VOC/NOTE/CLASS
const ids = ['VOC','NOTE','CLASS'];
for (let i = 0; i < 10; i++) Ms.applyOutcome(s.skills, [ids[i%3]], 100, { at: now + i });
const a = show('after 10 clean M1 answers', s);
OB.applyJump(s, 'M1', { correct: 10, total: 10, skills: ids, now: now + 20 });
const b = show('after JUMP M1 passed 10/10 (onboard.applyJump)', s);
console.log('JUMP drop?', b.r < a.r || b.M < a.M ? `YES R ${a.r}->${b.r} M ${Math.round(a.M*100)}->${Math.round(b.M*100)}` : 'no');
// run.js applyJump
const RUN = await import('../site/js/screens/run.js').catch(e => (console.log('run import fail', e.message), null));
if (RUN) { let s2 = clone(save0); for (let i = 0; i < 10; i++) Ms.applyOutcome(s2.skills, [ids[i%3]], 100, { at: now + i }); const a2 = show('run: after 10 clean', s2); RUN.applyJump(s2, 'M1', { correct: 10, total: 10, at: now+20 }); const b2 = show('run: after applyJump', s2); console.log('run JUMP drop?', b2.r < a2.r ? `YES ${a2.r}->${b2.r}` : 'no'); }
// Scenario W: one retry (s=40) on new skill FAC1 -> weak?
s = clone(save0); Ms.applyOutcome(s.skills, ['SYS'], 40, { at: now }); show('one retry(40) on SYS', s);
// Scenario D: legacy decayed-then-answered clean-only record, no misses field
s = clone(save0); s.skills['VOC'] = { m: 66.04, n: 3, lastAt: now - 1000, decayDays: 0 }; show('legacy VOC m66 n3 no misses field', s);
// Scenario M: 4 clean on a verdict-free new skill mixing with a missed low skill
s = clone(save0); Ms.applyOutcome(s.skills, ['SYS'], 0, { at: now }); let prev = show('SYS wrong', s);
for (let i = 0; i < 6; i++) { Ms.applyOutcome(s.skills, ['SYS'], 100, { at: now + 1000*i }); const c = show(`SYS clean ${i+1}`, s); if (c.r < prev.r || c.M < prev.M - 1e-12) console.log('DROP!'); prev = c; }
// Scenario L: locked (after a Mock) — clean answers
s = clone(save0); s.runs = [...(s.runs||[]), { kind: 'mock', status: 'done', accuracy: 0.9, submittedAt: now }]; prev = show('locked mock 90%', s);
for (const id of ['VOC','SYS','PAIRS']) { Ms.applyOutcome(s.skills, [id], 100, { at: now + 5 }); const c = show('locked clean '+id, s); if (c.r < prev.r) console.log('DROP!'); prev = c; }
// Provisional -> locked switch for a perfect Baseline / Mock
s = clone(save0); const p = show('prov before perfect mock', s); s.runs = [...(s.runs||[]), { kind: 'mock', status: 'done', accuracy: 1, submittedAt: now }]; show('after PERFECT mock (switch)', s);
s = clone(save0); s.runs = [...(s.runs||[]), { kind: 'baseline', status: 'done', accuracy: 1, submittedAt: now }]; show('after PERFECT baseline (switch)', s);
