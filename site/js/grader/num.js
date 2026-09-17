// num.js — the `num` grader (COMPOSED S3 "Parts · num") plus the small helpers every
// numeric grader of T03 shares (multi, roots, reject, cases, ratio, equation, factored
// import from here; this file imports only T02's normalize.js). DOM-free, never throws
// on student input.
//
// grade(part, raw, ctx) → { ok, kind:'correct'|'wrong'|'almost'|'malformed', credit:0|1, msg, tags:[],
//                           normalized:string|null, value:Rat|number|null, text:string|null, err?:string,
//                           via?:'misconception'|'distractor'|'sign'|'generic' (how a wrong was diagnosed) }
//   part { type:'num', answer:string|number|Rat|Array(any-of), tol?, label?,
//          asks?:['comp','supp'] (the chain, S3), distractors?:{angle, comp, supp, smaller, larger, …},
//          misconceptions?:[{answer, tag, msg, field?}], wrongMsg? }
//   raw  string | number | Rat | {value} | a parseNumber result
//   ctx  { misconceptions?, card?:{misconceptions}, tol? }
//
// Diagnosis order after a miss: card/generator `misconceptions[]` (by value) → every named
// intermediate of the `asks` chain and the other `distractors` (names the one it was, with the
// remaining step spelled out) → the 90/180 mix-ups → "sign?" (v == −answer) → a generic line.
// The answer is never in `msg`; it is returned as `answer` for the solution screen only.
//
// Misconception tags this file emits (all in data/misconceptions.js):
// tags:['gave-angle','gave-complement','gave-supplement','gave-smaller','gave-larger','stopped-early','used-90-for-supp','used-180-for-comp','sign-flip']

import {
  parseNumber, numEquals, numIsNegOf, tolFor, isRat, rat, ratToString, ratSub, ratNeg, toRat, formatNumber, DEFAULT_TOL,
} from './normalize.js';

// ---------------------------------------------------------------------------
// Shared helpers (exported for the sibling graders)
// ---------------------------------------------------------------------------

/** The S3 result shape with defaults; `kind` decides `ok` and `credit` unless overridden in `extra`. */
export function result(kind, msg, extra = {}) {
  return {
    ok: kind === 'correct',
    kind,
    credit: kind === 'correct' ? 1 : 0,
    msg: msg ?? '',
    tags: [],
    normalized: null,
    ...extra,
  };
}

/** true for null / '' / whitespace / [] / {} of blanks — a blank field is never an attempt. */
export function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return !v.trim();
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.every(isBlank);
  if (isRat(v)) return false;
  if (typeof v === 'object') {
    if ('ok' in v) return false;
    return Object.values(v).every(isBlank);
  }
  return false;
}

/**
 * parseValue — one value from anything a widget, a fixture or a generator hands us:
 * a string (T02's parseNumber), a JS number, a Rat, a parseNumber result, or {value}.
 * Always returns a parseNumber-shaped object; never throws.
 */
export function parseValue(raw, opts) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, err: 'toolarge', msg: 'that number is too large', normalized: String(raw) };
    const r = toRat(raw);
    const v = r ?? raw;
    return { ok: true, value: v, kind: r ? 'rational' : 'float', text: r ? ratToString(r) : String(raw), normalized: String(raw) };
  }
  if (isRat(raw)) return { ok: true, value: rat(raw.n, raw.d), kind: 'rational', text: ratToString(raw), normalized: ratToString(raw) };
  if (raw && typeof raw === 'object') {
    if ('ok' in raw) return raw;
    if ('value' in raw) return parseValue(raw.value, opts);
    return { ok: false, err: 'syntax', msg: 'could not read that', normalized: '' };
  }
  return parseNumber(raw, opts);
}

/** Anything → Rat | number | null (null when unparseable). */
export function toVal(x) {
  const p = parseValue(x);
  return p.ok ? p.value : null;
}

/**
 * show — a number the way a student reads it: integers plain, proper fractions as
 * fractions (−1/2, 5/3), improper ones as short decimals (68.5, 174.5) when they
 * terminate in ≤ 4 places, else fractions; unicode minus. Strings are echoed
 * (trimmed, ASCII '-' → '−' at the front) so a fixture's spelling survives.
 */
export function show(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x.trim().replace(/^-/, '−');
  const v = isRat(x) ? x : (typeof x === 'number' ? x : toVal(x));
  if (v === null) return String(x);
  let s;
  if (isRat(v)) {
    if (v.d === 1) s = String(v.n);
    else if (Math.abs(v.n) < v.d) s = ratToString(v);
    else {
      const dec = formatNumber(v, { style: 'decimal' });
      s = /\./.test(dec) && (dec.split('.')[1] || '').length <= 4 ? dec : ratToString(v);
    }
  } else {
    s = Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  }
  return s.replace(/^-/, '−');
}

/** part.tol ?? ctx.tol ?? 0.01 — the one rule (T02's tolFor with a ctx fallback). */
export function tolOf(part, ctx) {
  if (part && typeof part.tol === 'number' && part.tol >= 0) return part.tol;
  if (ctx && typeof ctx.tol === 'number' && ctx.tol >= 0) return ctx.tol;
  return tolFor(part);
}

/** Boss / Mock strictness: strictGCF, repeated-subset-is-wrong, no free second tries. */
export function isStrict(ctx) {
  return !!(ctx && (ctx.strict || ctx.strictGCF || ctx.mock || ctx.boss));
}

/**
 * escalate — the per-part submit counter behind "a second GCF-incomplete submit is wrong" and
 * "a second subset submit is wrong". Counts live on `ctx.state` (a plain object the caller keeps
 * per part across submits; the dispatcher creates it on the ctx when missing). Returns the count
 * AFTER this submit (1 = first). Without a state object every submit is a first one; in
 * `ctx.sandbox` (onboarding play) nothing ever escalates.
 */
export function escalate(ctx, key) {
  if (!ctx || ctx.sandbox) return 1;
  const s = ctx.state && typeof ctx.state === 'object' ? ctx.state : null;
  if (!s) return 1;
  s[key] = (Number.isInteger(s[key]) ? s[key] : 0) + 1;
  return s[key];
}

/** The card's / generator's misconception list, from the part, the ctx, or the card on the ctx. */
export function misconceptionsOf(part, ctx) {
  const list = (part && part.misconceptions) ?? (ctx && ctx.misconceptions) ?? (ctx && ctx.card && ctx.card.misconceptions) ?? [];
  return Array.isArray(list) ? list : [];
}

/**
 * inScope — does a misconception entry `{part?, field?|key?}` apply to `scope` {part?, field?}?
 * An entry scoped to a part/field matches only a query that names the same part/field; an
 * unscoped entry matches everything. (Content writes `{part:'answer', field:'angle', answer, tag, msg}`.)
 */
export function inScope(m, scope) {
  const sc = scope == null ? {} : (typeof scope === 'object' ? scope : { part: scope });
  if (m.part != null && (sc.part == null || String(m.part) !== String(sc.part))) return false;
  const mf = m.field ?? m.key ?? null;
  if (mf != null && (sc.field == null || String(mf) !== String(sc.field))) return false;
  return true;
}

/**
 * matchMisconception — the first in-scope `{answer, tag, msg}` whose answer equals `v` (tolerance).
 * `scope` is {part, field} (or a part id string).
 */
export function matchMisconception(list, v, tol = DEFAULT_TOL, scope = null) {
  for (const m of list) {
    if (!m || typeof m !== 'object' || !inScope(m, scope)) continue;
    const a = toVal(m.answer);
    if (a !== null && numEquals(v, a, tol)) return { tag: m.tag ?? null, msg: m.msg ?? '', entry: m };
  }
  return null;
}

/** Capitalise the first letter of a parser message ("type an answer" → "Type an answer"); a message that
 *  starts with a symbol like "m∠CFD" or a variable ("x = 3") is left alone. */
export function cap(s) {
  s = String(s ?? '');
  if (!/^[a-z][a-z]/.test(s)) return s;
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// The asks chain
// ---------------------------------------------------------------------------

const BASES = new Set(['angle', 'smaller', 'larger']);
const NAMES = {
  angle: 'the angle itself', comp: 'the complement', supp: 'the supplement',
  smaller: 'the smaller angle', larger: 'the larger angle',
};
const STEP = { comp: 'complement', supp: 'supplement' };
// tags:['gave-angle','gave-complement','gave-supplement','gave-smaller','gave-larger']
const GAVE = { angle: 'gave-angle', comp: 'gave-complement', supp: 'gave-supplement', smaller: 'gave-smaller', larger: 'gave-larger' };

function normName(n) {
  const s = String(n ?? '').trim().toLowerCase();
  if (s === 'complement' || s === 'complementary') return 'comp';
  if (s === 'supplement' || s === 'supplementary') return 'supp';
  if (s === 'x' || s === 'the angle') return 'angle';
  return s;
}

/** ['comp','supp'] → ['angle','comp','supp']; ['smaller','comp'] stays; [] → ['angle'] */
export function chainOf(asks) {
  const list = (Array.isArray(asks) ? asks : asks ? [asks] : []).map(normName).filter(Boolean);
  if (!list.length) return ['angle'];
  return BASES.has(list[0]) ? list : ['angle', ...list];
}

/** ['angle','comp','supp'] → "the supplement of the complement"; ['smaller','comp'] → "the complement of the smaller angle" */
export function describeChain(chain) {
  const c = chainOf(chain);
  if (c.length === 1) return c[0] === 'angle' ? 'the angle' : NAMES[c[0]] ?? `the ${c[0]}`;
  const rev = c.slice().reverse();
  if (rev[rev.length - 1] === 'angle') rev.pop();
  return rev.map((n) => NAMES[n] ?? `the ${n}`).join(' of ');
}

function opText(step, vText) {
  if (step === 'comp') return `90 − ${vText}`;
  if (step === 'supp') return `180 − ${vText}`;
  return null;
}

function stepValue(step, prev) {
  if (prev === null) return null;
  if (step === 'comp') return isRat(prev) ? ratSub(rat(90), prev) : 90 - prev;
  if (step === 'supp') return isRat(prev) ? ratSub(rat(180), prev) : 180 - prev;
  return null;
}

/**
 * diagnoseDistractors — the S3 chain diagnosis. Returns {msg, tags} or null.
 * Named intermediates come from `distractors` (a name → value map, the solver's numbers);
 * the chain is `asks`. Values equal to the answer are never reported as distractors.
 */
export function diagnoseDistractors(part, v, ans, tol) {
  const chain = chainOf(part.asks);
  const dist = part.distractors && typeof part.distractors === 'object' ? part.distractors : {};
  const named = [];
  for (const [k, val] of Object.entries(dist)) {
    const nv = toVal(val);
    if (nv === null) continue;
    if (ans !== null && numEquals(nv, ans, tol)) continue;
    named.push({ name: normName(k), raw: k, value: nv, text: typeof val === 'string' ? val : show(nv) });
  }
  const last = chain[chain.length - 1];
  const desc = describeChain(chain);
  const tags = [];
  let msg = null;

  // 1. an earlier stage of the chain (latest stage first)
  for (let i = chain.length - 2; i >= 0 && msg === null; i--) {
    const hit = named.find((d) => d.name === chain[i] && numEquals(v, d.value, tol));
    if (!hit) continue;
    const remaining = chain.slice(i + 1);
    const vText = show(hit.text);
    if (remaining.length === 1) {
      const op = opText(remaining[0], vText);
      msg = `That's ${NAMES[hit.name] ?? hit.raw} — the question asks for ${desc}${op ? ` (${op})` : ''}.`;
    } else {
      const steps = remaining.map((s, j) => (j === 0 ? (STEP[s] ?? NAMES[s] ?? s) : `its ${STEP[s] ?? NAMES[s] ?? s}`));
      msg = `That's ${NAMES[hit.name] ?? hit.raw} — keep going: ${steps.join(', then ')}.`;
    }
    // stopping at the sentence's angle (or the smaller / larger one) is "gave-…"; stopping mid-chain is "stopped-early"
    const stage = BASES.has(hit.name) ? GAVE[hit.name] : 'stopped-early';
    tags.push(stage);
  }

  // 2. a named distractor off the chain
  if (msg === null) {
    const hit = named.find((d) => !chain.includes(d.name) && numEquals(v, d.value, tol));
    if (hit) {
      msg = `That's ${NAMES[hit.name] ?? `the ${hit.raw}`} — the question asks for ${desc}.`;
      if (GAVE[hit.name]) tags.push(GAVE[hit.name]);
    }
  }

  // 3. 90 used for a supplement / 180 for a complement on the final step (only when nothing above matched)
  if (msg === null && (last === 'supp' || last === 'comp')) {
    const prevName = chain[chain.length - 2];
    const prev = named.find((d) => d.name === prevName);
    const prevVal = prev ? prev.value : null;
    if (prevVal !== null) {
      const wrongOp = last === 'supp' ? stepValue('comp', prevVal) : stepValue('supp', prevVal);
      if (wrongOp !== null && numEquals(v, wrongOp, tol)) {
        const pv = show(prev.text);
        if (last === 'supp') {
          if (msg === null) msg = `Supplementary angles add to 180 — the supplement of ${pv} is 180 − ${pv}, not 90 − ${pv}.`;
          if (!tags.includes('used-90-for-supp')) tags.push('used-90-for-supp');
        } else {
          if (msg === null) msg = `Complementary angles add to 90 — the complement of ${pv} is 90 − ${pv}, not 180 − ${pv}.`;
          if (!tags.includes('used-180-for-comp')) tags.push('used-180-for-comp');
        }
      }
    }
  }
  return msg === null ? null : { msg, tags };
}

// ---------------------------------------------------------------------------
// The grader
// ---------------------------------------------------------------------------

function answersOf(part) {
  const a = part.answer ?? part.answers ?? part.value;
  const list = Array.isArray(a) ? a : [a];
  return list.map((x) => ({ raw: x, value: toVal(x) })).filter((x) => x.value !== null);
}

/** Human message for a parse failure in a plain number field. */
export function parseFailMessage(p, raw) {
  switch (p.err) {
    case 'empty': return 'Type an answer.';
    case 'variable': return 'Numbers only here — no letters.';
    case 'comma': {
      const parts = String(raw ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2 && parts.every((s) => parseNumber(s).ok)) return 'One number here — this field takes a single answer.';
      return 'No commas inside a number — write 1000, not 1,000.';
    }
    case 'sci': return 'Write the number out — no scientific notation.';
    case 'toolong': return 'That answer is too long to read.';
    default: return p.msg ? `${cap(p.msg)}.` : 'Could not read that number.';
  }
}

/**
 * grade — see the header. `ok` iff the value equals the answer (tolerance); every miss
 * gets one specific line; unparseable input is `malformed` (free).
 */
export function grade(part = {}, raw, ctx = {}) {
  const tol = tolOf(part, ctx);
  if (Array.isArray(part.bonus) && part.bonus.length && raw && typeof raw === 'object' && !isRat(raw) && !('ok' in raw)) {
    return gradeWithBonus(part, raw, ctx);
  }
  if (isBlank(raw)) return result('malformed', 'Type an answer.', { err: 'empty', value: null, text: null });
  const p = parseValue(raw);
  if (!p.ok) {
    return result('malformed', parseFailMessage(p, raw), { err: p.err, normalized: p.normalized ?? null, value: null, text: null, vars: p.vars });
  }
  const v = p.value;
  const base = { normalized: p.normalized ?? p.text ?? null, value: v, text: p.text ?? null };
  const answers = answersOf(part);
  if (!answers.length) {
    return result('malformed', 'This item has no answer key yet.', { ...base, err: 'bad-part' });
  }
  const hit = answers.find((a) => numEquals(v, a.value, tol));
  if (hit) return result('correct', part.okMsg ?? '✓', { ...base, answer: show(hit.raw) });

  const ans = answers[0].value;
  const answerText = show(answers[0].raw);

  // 1. card / generator misconceptions (typed answers)
  const mis = matchMisconception(misconceptionsOf(part, ctx), v, tol, { part: part.id ?? null, field: part.key ?? part.field ?? null });
  if (mis) return result('wrong', mis.msg || 'Not quite — check the step the question asks for.', { ...base, tags: mis.tag ? [mis.tag] : [], answer: answerText, via: 'misconception' });

  // 2. the asks chain / named distractors
  const d = diagnoseDistractors(part, v, ans, tol);
  if (d) return result('wrong', d.msg, { ...base, tags: d.tags, answer: answerText, via: 'distractor' });

  // 3. sign?
  if (ans !== null && !numEquals(ans, 0, 0) && numIsNegOf(v, ans, tol)) {
    return result('wrong', 'Sign? Right size, wrong sign — check the step where a term crossed the equals sign.', { ...base, tags: ['sign-flip'], answer: answerText, via: 'sign' });
  }

  // 4. generic
  const msg = part.wrongMsg ?? `${show(v)} isn't it — recheck the setup, then the arithmetic.`;
  return result('wrong', msg, { ...base, answer: answerText, via: 'generic' });
}

/**
 * A `num` part with `bonus:[{key,label,answer}]` fields (ang-09, ang-11: the teacher's key also lists the
 * complement and supplement) submitted as an object: { value | answer | main | [part.id]: mainRaw, [bonusKey]: … }
 * or { value, bonus:{ [key]: … } }. A blank bonus never blocks `ok`; a wrong one makes the part `almost`
 * (free retry) with the main value still marked right; `credit` follows the main value only.
 */
function gradeWithBonus(part, raw, ctx) {
  const main = raw.value ?? raw.answer ?? raw.main ?? raw[part.id] ?? raw[part.key] ?? null;
  const src = raw.bonus && typeof raw.bonus === 'object' ? raw.bonus : raw;
  const r = grade({ ...part, bonus: undefined }, main, ctx);
  const bonus = part.bonus.map((b) => {
    const label = String(b.label ?? b.key).replace(/\s*[=:]\s*$/, '');
    const bv = src[b.key];
    if (isBlank(bv)) return { key: b.key, label, state: 'blank', ok: false, kind: 'malformed', msg: '', tags: [], normalized: null };
    const g = grade({ ...b, id: part.id, key: b.key }, bv, ctx);
    return { key: b.key, label, state: g.ok ? 'ok' : g.kind === 'malformed' ? 'malformed' : 'wrong', ok: g.ok, kind: g.kind, msg: g.msg, tags: g.tags ?? [], normalized: g.normalized };
  });
  const out = { ...r, bonus, main: { ok: r.ok, kind: r.kind, msg: r.msg } };
  if (!r.ok) return out;
  const wrong = bonus.find((b) => b.state === 'wrong');
  const bad = bonus.find((b) => b.state === 'malformed');
  if (wrong) return { ...out, ok: false, kind: 'almost', msg: `✓ — bonus ${wrong.label}: ${wrong.msg}`, tags: [...new Set([...(r.tags ?? []), ...wrong.tags])] };
  if (bad) return { ...out, ok: false, kind: 'almost', msg: `✓ — bonus ${bad.label}: ${bad.msg}` };
  const blank = bonus.filter((b) => b.state === 'blank').length;
  return { ...out, msg: blank ? `✓ (${blank} bonus field${blank > 1 ? 's' : ''} left blank)` : '✓' };
}

export default grade;
