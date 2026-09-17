// data/skills.js — the 19-skill graph (COMPOSED S1). Weights sum to 100.
// Prereqs are RECOMMENDATIONS only: they order the plan and the Page composer;
// they never lock anything (Global rule 1). Item-level `needs:[skillId]` lives on cards.
// Student-facing `name` is what the UI shows; `id` is internal and appears in saves.

export const skills = Object.freeze([
  { id: 'VOC',        name: 'Vocabulary',                                    w: 7, prereqs: [] },
  { id: 'NOTE',       name: 'Notation',                                      w: 8, prereqs: ['VOC'] },
  { id: 'CLASS',      name: 'Angle Types',                                   w: 3, prereqs: ['VOC'] },
  { id: 'CSARITH',    name: 'Complement & Supplement',                       w: 5, prereqs: ['CLASS'] },
  { id: 'PAIRS',      name: 'Pairs in a Figure',                             w: 8, prereqs: ['NOTE', 'CLASS'] },
  { id: 'ASN-PLP',    name: 'Always/Sometimes/Never: Points, Lines, Planes', w: 7, prereqs: ['VOC'] },
  { id: 'ASN-ANG',    name: 'Always/Sometimes/Never: Angles',                w: 7, prereqs: ['CSARITH'] },
  { id: 'CS-LIN',     name: 'Word Problems: Linear',                         w: 9, prereqs: ['CSARITH'] },
  { id: 'CS-RATIO',   name: 'Word Problems: Ratio',                          w: 5, prereqs: ['CS-LIN'] },
  { id: 'CS-QUAD',    name: 'Word Problems: Product',                        w: 4, prereqs: ['CS-LIN', 'QUAD-CTX'] },
  { id: 'SYS',        name: 'Systems',                                       w: 4, prereqs: [] },
  // FIG-ALG: tier-4 items (ang-10) additionally carry item-level `needs:["QUAD-SOLVE"]` on the card.
  { id: 'FIG-ALG',    name: 'Diagram Algebra',                               w: 8, prereqs: ['PAIRS', 'SYS'] },
  { id: 'BISECT-L',   name: 'Does It Bisect?',                               w: 4, prereqs: ['PAIRS'] },
  { id: 'BISECT-Q',   name: 'Does It Bisect? Two Cases',                     w: 3, prereqs: ['BISECT-L', 'QUAD-CTX'] },
  { id: 'SEG-ALG',    name: 'Midpoint Triangle',                             w: 3, prereqs: ['QUAD-CTX'] },
  { id: 'FAC1',       name: 'Factoring a = 1',                               w: 3, prereqs: [] },
  { id: 'FAC2',       name: 'Factoring a > 1',                               w: 6, prereqs: ['FAC1'] },
  { id: 'QUAD-SOLVE', name: 'Solve by Factoring',                            w: 4, prereqs: ['FAC2'] },
  { id: 'QUAD-CTX',   name: 'Reject the Root',                               w: 2, prereqs: ['QUAD-SOLVE'] },
].map(Object.freeze));

export const SKILL_IDS = Object.freeze(skills.map(s => s.id));

export const skillById = Object.freeze(Object.fromEntries(skills.map(s => [s.id, s])));

/** Sum of all weights — S4 Readiness divides by this (it is 100 by construction). */
export const TOTAL_WEIGHT = skills.reduce((t, s) => t + s.w, 0);

/**
 * Prereq-topological order of skill ids (Kahn's algorithm, ties broken by table order),
 * so the Page composer (S1 step 4: "new Cards in prereq-topological order") and the plan
 * can draw new work in a stable, deterministic sequence. No randomness.
 */
export function topoOrder(ids = SKILL_IDS) {
  const set = new Set(ids);
  const indeg = new Map();
  for (const id of ids) indeg.set(id, skillById[id].prereqs.filter(p => set.has(p)).length);
  const out = [];
  const done = new Set();
  while (out.length < ids.length) {
    const next = ids.find(id => !done.has(id) && indeg.get(id) === 0);
    if (!next) throw new Error('skills.js: prereq cycle detected');
    done.add(next);
    out.push(next);
    for (const id of ids) {
      if (!done.has(id) && skillById[id].prereqs.includes(next)) indeg.set(id, indeg.get(id) - 1);
    }
  }
  return out;
}

/** Every transitive prerequisite of a skill (recommendation graph only). */
export function prereqClosure(id) {
  const seen = new Set();
  const walk = (s) => { for (const p of skillById[s].prereqs) if (!seen.has(p)) { seen.add(p); walk(p); } };
  walk(id);
  return [...seen];
}

export default skills;
