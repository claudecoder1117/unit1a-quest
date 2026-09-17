// critic r3 (home): does a wrong OPTIONAL setup followed by a first-try clean clear lower R / list weak?
import { readFileSync } from 'node:fs';
import { byId } from '../site/data/cards.js';
import { manifest } from '../site/data/source-manifest.js';
import { readiness, weakSpots, masteryTermTested } from '../site/js/readiness.js';
import { applyOutcome, scoreFor } from '../site/js/mastery.js';
const base = JSON.parse(readFileSync('qa/screenshots/s9/after-ace.json', 'utf8'));
const prim = new Map(manifest.filter(r => r.skill).map(r => [r.id, r.skill]));
const withSetup = Object.values(byId).filter(c => (c.parts || []).some(p => p.type === 'equation' && p.optional));
console.log('cards with optional setup:', withSetup.map(c => `${c.id}:${prim.get(c.id)}:[${c.skills}]`).join(' '));
for (const c of withSetup) {
  const s = structuredClone(base);
  const now = Date.now();
  const r0 = readiness(s);
  // wrong setup: logError only (card.js afterSetup) — no skill update
  s.errors.push({ item: c.id, seed: null, t: now, got: 'x=1', tags: [], cleared: false, part: 'setup', template: null, forCard: null });
  const rMid = readiness(s);
  // clean first-try clear
  applyOutcome(s.skills, c.skills, scoreFor({ firstTry: true, hints: 0, attempt: 1 }), { at: now });
  s.cards[c.id] = { ...(s.cards[c.id] || {}), cleared: true, history: [{ at: now, ok: true, attempt: 1, hints: 0 }] };
  const r1 = readiness(s);
  const w = weakSpots(s).map(x => `${x.name} ${Math.round(x.mShown)}`);
  const flag = (r1.r < r0.r || Math.round(r1.M * 100) < Math.round(r0.M * 100)) ? 'DROP' : 'ok';
  console.log(flag, c.id, 'R', r0.r, '->', r1.r, 'M%', Math.round(r0.M * 100), '->', Math.round(r1.M * 100), 'weak:', w.join(', ') || '-');
}
