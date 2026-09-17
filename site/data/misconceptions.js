// Misconception catalogue (T06g) — the ONE place every misconception tag is named.
//
// Contract (COMPOSED S3, S4 "Patterns", S7 cheat sheet):
//   * Every string a grader puts in `tags:[]`, and every `tag` a card or generator lists under
//     `misconceptions:[{answer, tag, msg}]`, MUST be a key of MISCONCEPTIONS.
//     tests/misconceptions.test.mjs greps site/js and site/data for `tag:'…'` / `tag:"…"` /
//     `tags:[…]` literals and fails on any tag missing here. A grader that builds a tag
//     dynamically (`'gave-' + name`) declares the possible values in a comment such as
//     `// tags:['gave-angle','gave-complement']` so the test still covers them.
//   * Keys are kebab-case. Each entry is { title, fix, area }:
//       title — short label (≤ 40 chars) for the Patterns panel / error log
//       fix   — ONE student-facing line: what to do next time (no item numbers, no answers)
//       area  — grouping id from AREAS (the Night-Before sheet picks the most-missed tag per area)
//   * Add a tag by adding a key here; never rename one that a save file may already carry
//     (save.errors[].tags keeps old tags — lookup() degrades gracefully for unknown ones).
//
// Voice: second person, concrete, ≤ 140 characters, real notation (−, ∠, ≅, °).

export const AREAS = Object.freeze([
  Object.freeze({ id: 'comp-supp',  label: 'Complement & supplement' }),
  Object.freeze({ id: 'setup',      label: 'Setting up the equation' }),
  Object.freeze({ id: 'ratio',      label: 'Ratios' }),
  Object.freeze({ id: 'roots',      label: 'Roots & rejecting roots' }),
  Object.freeze({ id: 'factoring',  label: 'Factoring' }),
  Object.freeze({ id: 'figure',     label: 'Angle pairs in a figure' }),
  Object.freeze({ id: 'notation',   label: 'Notation' }),
  Object.freeze({ id: 'vocab',      label: 'Vocabulary' }),
  Object.freeze({ id: 'classify',   label: 'Classifying angles' }),
  Object.freeze({ id: 'reasoning',  label: 'Always / Sometimes / Never & justifying' }),
  Object.freeze({ id: 'general',    label: 'General' }),
]);

const entry = (title, fix, area) => Object.freeze({ title, fix, area });

export const MISCONCEPTIONS = Object.freeze({
  // ---- complement / supplement chains (num grader distractors, S3 `asks` chains) -------------
  'gave-angle':          entry('Stopped at the angle',
    'Solving for x is step one — reread the question and finish with what it asks for (90 − x, 180 − x, …).', 'comp-supp'),
  'gave-complement':     entry('Gave the complement',
    'You found the complement — reread what the question asks for and write that expression first (180 − x for a supplement).', 'comp-supp'),
  'gave-supplement':     entry('Gave the supplement',
    'You found the supplement — reread what the question asks for and write that expression first (90 − x for a complement).', 'comp-supp'),
  'gave-smaller':        entry('Gave the smaller angle',
    'When the question says "larger" or "the other angle", finish with that one — you stopped at the smaller.', 'comp-supp'),
  'gave-larger':         entry('Gave the larger angle',
    'The question wants the smaller angle (or its complement / supplement) — check which of the two it names.', 'comp-supp'),
  'stopped-early':       entry('Stopped one step early',
    '"Supplement of the complement" is two steps: 90 − x first, then 180 − (90 − x) — finish the chain.', 'comp-supp'),
  'used-90-for-supp':    entry('Used 90 for a supplement',
    'Supplementary angles add to 180 — the supplement of x is 180 − x; 90 − x is the complement.', 'comp-supp'),
  'used-180-for-comp':   entry('Used 180 for a complement',
    'Complementary angles add to 90 — the complement of x is 90 − x; 180 − x is the supplement.', 'comp-supp'),
  'confused-comp-supp':  entry('Complementary vs supplementary',
    'Add the two measures: 90 means complementary, 180 means supplementary — a linear pair is always supplementary.', 'comp-supp'),
  'sign-flip':           entry('Right size, wrong sign',
    'Your number is the negative of the answer — check the step where you moved a term across the equals sign.', 'general'),
  'arithmetic':          entry('Arithmetic slip',
    'The setup was right — redo the solving one operation per line, then substitute your x back in to check.', 'general'),

  // ---- equation setup (equation grader, FIG-ALG, BISECT, SEG-ALG) ---------------------------
  'wrong-side-supp':     entry('Supplement on the wrong side',
    '"The supplement is 10 more than 9 times the angle" is 180 − x = 9x + 10 — the supplement stands alone on its side.', 'setup'),
  'simplified-setup':    entry('Setup already simplified',
    'Write the equation as the sentence says it, with the 180 or 90 still visible — simplify on the next line.', 'setup'),
  'linear-pair-set-equal': entry('Linear pair set equal',
    'A linear pair adds to 180 — write a + b = 180, not a = b; only vertical angles and bisector halves are equal.', 'setup'),
  'vertical-set-180':    entry('Vertical angles summed to 180',
    'Vertical angles are congruent — write a = b; it is the adjacent pair on a line that adds to 180.', 'setup'),
  'assumed-bisects':     entry('Assumed the bisector',
    'Do not set the halves equal first — find x from the whole angle, then check whether the two halves come out equal.', 'setup'),
  'midpoint-not-equal':  entry('Midpoint halves not set equal',
    'A midpoint makes the two halves equal — set the two expressions equal to each other, do not add them.', 'setup'),
  'half-side-perimeter': entry('Perimeter from half-sides',
    'Perimeter uses whole sides — a bisected side is twice its half (CB + BA), so double before you add.', 'setup'),
  'ratio-as-measure':    entry('Ratio numbers used as degrees',
    '5:7 are parts, not degrees — add the parts (12), divide the total (180 or 90) by that, then multiply each part.', 'setup'),

  // ---- ratio grader --------------------------------------------------------------------------
  'unreduced-ratio':     entry('Ratio not reduced',
    'Divide both numbers by their GCF — 6:4 is the right relationship, but the answer is written 3:2.', 'ratio'),
  'reversed-ratio':      entry('Ratio reversed',
    'Order matters — "angle to complement" puts the angle first: 54:36 = 3:2, not 2:3.', 'ratio'),

  // ---- roots / reject / cases (rootcase chain) -----------------------------------------------
  'forgot-second-root':  entry('Missed the second root',
    'A factored quadratic has two factors — set each one to 0: (2x + 1)(x − 3) = 0 gives x = −½ and x = 3.', 'roots'),
  'extra-root':          entry('Extra value that is not a root',
    'Every root must make the equation true — plug it back in; the factor (x − 3) gives x = 3, not −3.', 'roots'),
  'typed-polynomial':    entry('Polynomial instead of roots',
    'The question wants the values of x — factor, set each factor to 0, and type the roots (for example 3, −1/2).', 'roots'),
  'rejected-valid-root': entry('Rejected a valid root',
    'A negative x is not automatically wrong — substitute it and reject only if a length or angle comes out negative or zero.', 'roots'),
  'kept-invalid-root':   entry('Kept an invalid root',
    'Substitute every root into the expressions — one that makes a length negative or an angle ≤ 0 is rejected, with that reason.', 'roots'),
  'wrong-reject-reason': entry('Right verdict, wrong reason',
    'Say why: "negative side length", "zero angle", or "both give positive measures" — the reason is what gets graded.', 'roots'),
  'missing-case':        entry('Only one case discussed',
    'Two roots means two cases — work out the measures for each x and state the verdict for both, even the silly one.', 'roots'),

  // ---- factoring (factored grader) -----------------------------------------------------------
  'sign-whole':          entry('Whole expression negated',
    'Your factors expand to the negative of the trinomial — with a negative leading term pull out −1 first: −(2a + 5)(3a + 5).', 'factoring'),
  'dropped-gcf':         entry('Dropped the common factor',
    'Your factors expand to the trinomial divided by a number — keep the GCF you pulled out in front: 3(3k + 1)(k + 7).', 'factoring'),
  'extra-factor':        entry('Extra constant factor',
    'Your factors expand to a multiple of the trinomial — drop the extra constant, then expand to check.', 'factoring'),
  'middle-term':         entry('Middle term wrong',
    'Outer + Inner must make the middle term — check the sign and size of the x-term when you expand.', 'factoring'),
  'wrong-factors':       entry('Factors do not expand back',
    'Always expand to check — First, Outer, Inner, Last must give back the original trinomial exactly.', 'factoring'),
  'gcf-incomplete':      entry('GCF left inside a factor',
    'A factor like (9k + 3) still has a common factor — pull it out: 3(3k + 1).', 'factoring'),
  'missing-gcf-strict':  entry('GCF not fully factored (scored)',
    'In a Boss or Mock a bracket with a common number still inside is marked wrong — factor the GCF out of every bracket.', 'factoring'),
  'reducible-factor':    entry('A factor still factors',
    'One of your factors is still a quadratic that factors — keep going until every factor is linear.', 'factoring'),
  'rational-coeff':      entry('Fraction inside a factor',
    'Use integer coefficients — multiply the constant into the fraction factor: 3(p − 5/3)(p + 1) = (3p − 5)(p + 1).', 'factoring'),
  'not-factored':        entry('Not a product',
    'The answer must be a product of factors — the original trinomial (or any sum) typed back is not factored.', 'factoring'),
  'typed-roots':         entry('Roots instead of factors',
    'This asks for the factored form, not the roots — write (3p − 5)(p + 1), not p = 5/3.', 'factoring'),
  'wrong-variable':      entry('Wrong variable',
    'Use the variable in the problem — a trinomial in n factors with n, not x.', 'factoring'),

  // ---- angle pairs in a figure (pairs grader; Boss "names the skill") ------------------------
  'vertex-not-middle':   entry('Vertex not in the middle',
    'Name an angle with the vertex as the middle letter — ∠GFC has its vertex at F.', 'figure'),
  'confused-vertical-linear': entry('Vertical vs linear pair',
    'Vertical angles sit across the X from each other and are congruent; a linear pair sits side by side on a line and adds to 180.', 'figure'),
  'not-adjacent':        entry('Not adjacent',
    'Adjacent angles share the vertex and one side and do not overlap — angles across the vertex from each other are not adjacent.', 'figure'),
  'adjacent-not-linear': entry('Adjacent but not a linear pair',
    'A linear pair needs its two outer sides to be opposite rays (a straight line) — sharing a side is not enough.', 'figure'),
  'adjacent-as-nonexample': entry('Adjacent pair given as a non-example',
    'A non-example of adjacent must break the definition — pick two angles with no common side, or ones that overlap.', 'figure'),

  // ---- notation (notation builder / mc) ------------------------------------------------------
  'ray-order':           entry('Ray endpoint not first',
    'A ray is named from its endpoint: ray FC starts at F — ray CF is a different ray.', 'notation'),
  'bar-on-length':       entry('Bar on a length',
    'AB with no bar is a number (the length); the bar means the segment itself — "AB = 7" has no bar.', 'notation'),
  'line-vs-segment':     entry('Line vs segment mark',
    'A double arrow (↔) means line — forever both ways; a plain bar means segment — two endpoints.', 'notation'),
  'segment-vs-ray':      entry('Segment vs ray mark',
    'A single arrow (→) means ray — one endpoint, forever the other way; a plain bar means segment.', 'notation'),
  'm-vs-angle':          entry('∠ vs m∠',
    'm∠ABC is a number of degrees; ∠ABC is the angle itself — use m∠ with = and a number, ∠ with ≅.', 'notation'),
  'congruent-vs-equal':  entry('≅ vs =',
    'Angles and segments are congruent (≅); their measures and lengths are equal (=): ∠A ≅ ∠B, m∠A = m∠B.', 'notation'),
  'plane-naming':        entry('Plane misnamed',
    'Name a plane by a script capital or by three non-collinear points — two points name a line, not a plane.', 'notation'),
  'wrong-decoration':    entry('Wrong notation mark',
    'Match the mark to the object: ↔ line, bar segment, → ray, nothing for a length, ∠ angle, m∠ its measure.', 'notation'),

  // ---- vocabulary confusable groups (mc / term / cloze) --------------------------------------
  'confused-ray-segment': entry('Ray vs segment',
    'A segment has two endpoints; a ray has one endpoint and goes on forever — "extends forever one way" is the ray.', 'vocab'),
  'confused-adjacent-linear': entry('Adjacent vs linear pair',
    'Adjacent = share a vertex and a side; linear pair = adjacent AND the outer sides form a line (so they add to 180).', 'vocab'),
  'confused-collinear-coplanar': entry('Collinear vs coplanar',
    'Collinear points lie on one line; coplanar points lie in one plane — collinear points are always coplanar too.', 'vocab'),

  // ---- classifying angles (classify grader) --------------------------------------------------
  'boundary-90':         entry('Exactly 90 is right',
    'Acute is less than 90 and obtuse is more than 90 — exactly 90° is a right angle, not either.', 'classify'),
  'boundary-180':        entry('Exactly 180 is straight',
    'Obtuse is between 90 and 180 — exactly 180° is a straight angle.', 'classify'),
  'misclassified':       entry('Angle type wrong',
    'Compare with 90 and 180: under 90 acute, exactly 90 right, between 90 and 180 obtuse, exactly 180 straight.', 'classify'),

  // ---- Always / Sometimes / Never and justification (asn / strip graders) --------------------
  'overgeneralised':     entry('Always/Never for Sometimes',
    'Before answering Always or Never, hunt for one counterexample — if you can draw a case each way, it is Sometimes.', 'reasoning'),
  'undergeneralised':    entry('Sometimes for Always/Never',
    'Sometimes needs a real example AND a real counterexample — if a definition or postulate forces the result, it is Always (or Never).', 'reasoning'),
  'flipped-verdict':     entry('Always and Never swapped',
    'Test the statement on one concrete picture — if it holds there it cannot be Never; if it fails there it cannot be Always.', 'reasoning'),
  'wrong-reason':        entry('Right verdict, wrong reason',
    'The reason must name the definition or postulate that decides it — not a true fact that leaves the question open.', 'reasoning'),
  'forbidden-reason':    entry('Justified with a false statement',
    'Only use statements that are true in this figure — check every claim (like "the angles add to 180") against the numbers.', 'reasoning'),
  'missing-reason':      entry('Verdict without the deciding reason',
    'The verdict needs the reason that decides it: the two halves are congruent (81° = 81°), so the ray bisects.', 'reasoning'),
  'wrong-verdict':       entry('Bisector verdict wrong',
    'Compute both halves from x, then compare — congruent halves mean it bisects; different halves mean it does not.', 'reasoning'),

  // ---- multi-field answers -------------------------------------------------------------------
  'swapped-fields':      entry('Answers in the wrong boxes',
    'Both numbers are right but swapped — read each label (angle / complement / supplement) before typing into the box.', 'general'),
});

/** Every catalogued tag, in catalogue order. */
export const TAGS = Object.freeze(Object.keys(MISCONCEPTIONS));

/** True iff `tag` is catalogued. Never throws (undefined/null/non-string → false). */
export function isKnownTag(tag) {
  return typeof tag === 'string' && Object.hasOwn(MISCONCEPTIONS, tag);
}

/**
 * lookup(tag) → { tag, title, fix, area, known }.
 * Unknown tags (an old save, a typo in a generator) return a readable fallback instead of crashing
 * the Patterns panel: title is the tag with dashes turned into spaces, fix is a generic line, area 'general'.
 */
export function lookup(tag) {
  const t = typeof tag === 'string' ? tag : String(tag ?? '');
  const hit = isKnownTag(t) ? MISCONCEPTIONS[t] : null;
  if (hit) return { tag: t, title: hit.title, fix: hit.fix, area: hit.area, known: true };
  return {
    tag: t,
    title: t ? t.replace(/-+/g, ' ') : 'unknown pattern',
    fix: 'Open the Errors list for this pattern and replay one — the worked solution shows the step to fix.',
    area: 'general',
    known: false,
  };
}

/**
 * patternLine(tag, count) → the S4 Patterns-panel line, e.g.
 *   "gave-complement ×4 — You found the complement — reread what the question asks for …"
 * `count` is coerced to a non-negative integer (bad input → 0).
 */
export function patternLine(tag, count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const e = lookup(tag);
  return `${e.tag} ×${n} — ${e.fix}`;
}

/**
 * groupByArea(counts) → [{ id, label, tags:[{tag, count, title, fix}] }] in AREAS order, areas with
 * no counted tag omitted, tags sorted by count desc then catalogue order. `counts` is
 * { [tag]: number } (e.g. tallied from save.errors[].tags). Unknown tags land in 'general'.
 */
export function groupByArea(counts) {
  const src = counts && typeof counts === 'object' ? counts : {};
  const order = new Map(TAGS.map((t, i) => [t, i]));
  const buckets = new Map(AREAS.map(a => [a.id, []]));
  for (const [tag, raw] of Object.entries(src)) {
    const count = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    if (!count) continue;
    const e = lookup(tag);
    buckets.get(e.area).push({ tag: e.tag, count, title: e.title, fix: e.fix });
  }
  const out = [];
  for (const a of AREAS) {
    const tags = buckets.get(a.id);
    if (!tags.length) continue;
    tags.sort((x, y) => y.count - x.count || (order.get(x.tag) ?? 1e9) - (order.get(y.tag) ?? 1e9) || (x.tag < y.tag ? -1 : 1));
    out.push({ id: a.id, label: a.label, tags });
  }
  return out;
}

export default MISCONCEPTIONS;
