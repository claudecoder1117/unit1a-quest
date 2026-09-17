// critic r2 (home): does "counts only where it raises M" inflate an all-clean, lopsided save?
const R = await import('../site/js/readiness.js');
const Ms = await import('../site/js/mastery.js');
const { skills } = await import('../site/data/skills.js');
const show = (tag, s) => { const rd = R.readiness(s); console.log(tag.padEnd(52), 'R', rd.r, rd.band.label.padEnd(16), 'M%', Math.round(rd.M*100), 'tested', rd.tested, 'scored', rd.scored, 'oldMean%', Math.round(100*oldMean(s)), 'rail', Object.entries(s.skills).map(([k,v])=>k+':'+Math.round(Ms.mShown(v))).join(' ')); };
function oldMean(s) { let a=0,w=0; for (const sk of skills) { const r=s.skills[sk.id]; if ((r?.n??0)>=1) { a+=sk.w*Ms.mShown(r); w+=sk.w; } } return w? a/w/100 : 0; }
console.log('weights', Object.fromEntries(skills.map(s=>[s.id,s.w])));
const now = Date.now();
// A: skipped placement; 12 clean VOC (e.g. a vocab BLITZ), one clean each on CLASS, NOTE, ASN-PLP
let s = { skills: {}, cards: {}, runs: [] };
for (let i=0;i<12;i++) Ms.applyOutcome(s.skills, ['VOC'], 100, { at: now+i });
for (const id of ['CLASS','NOTE','ASN-PLP']) Ms.applyOutcome(s.skills, [id], 100, { at: now });
show('A: 12 clean VOC + 1 clean on 3 others', s);
// B: same + 1 clean on 6 more skills (a first Page's spread)
for (const id of ['FAC1','FAC2','SYS','QUAD-SOLVE','CS-LIN','PAIRS']) Ms.applyOutcome(s.skills, [id], 100, { at: now });
show('B: + 1 clean on 6 more skills (10 tested)', s);
// C: 20 clean VOC, 1 clean on 9 others
for (let i=0;i<8;i++) Ms.applyOutcome(s.skills, ['VOC'], 100, { at: now+i });
show('C: VOC 20 clean, 9 others 1 clean', s);
// D: same but one of the 1-answer skills got a WRONG answer instead -> verdict skill at 0
let d = JSON.parse(JSON.stringify(s)); d.skills['SYS'] = Ms.updateSkill({}, 0, { at: now });
show('D: as C but SYS wrong once (verdict at 0)', d);
