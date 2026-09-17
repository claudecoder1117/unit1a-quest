// normalize.js — answer-text normalization, exact rationals, and the shared
// expression tokenizer/parser (COMPOSED S3 "Normalization", "Edge cases").
//
// Layering: this file imports nothing. poly.js builds polynomials on top of the
// tokenizer/parser/AST exported here; every grader normalises through the same
// code path, so a string fixture and a typed generator value grade identically.
//
// Pipeline (order matters — NFKC maps º→o, ˚→◌̊, ²→2, ½→1⁄2, so glyph rules run
// BEFORE NFKC):
//   trim · dashes→'-' · ×·→'*' · ⁄→'/' · superscripts→'^k' · [°º˚]→'°' ·
//   vulgar fractions (<digit>½ → (digit+(1/2)), bare ½ → (1/2)) · NFKC ·
//   lowercase · strip leading `x =`/`m =`/`m∠ABC =`/`=` · strip trailing '.' ·
//   strip '°' + deg words · strip unit words after a number · `a b/c` mixed ·
//   collapse whitespace.

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown by tokenize/parseExpr/evalAst/rational ops; graders map `code` to copy. */
export class ParseError extends Error {
  /**
   * @param {string} code   machine code ('syntax','char','variable','divzero','toolarge',
   *                        'exponent','equals','div-nonconst','degree','wrong-var','multi-var','empty')
   * @param {string} message student-facing default message
   * @param {object} [extra] extra fields (pos, got, want, vars …)
   */
  constructor(code, message, extra) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

// ---------------------------------------------------------------------------
// Rationals — {n, d} reduced, d > 0, both safe integers. Never floats.
// ---------------------------------------------------------------------------

/** @typedef {{n:number, d:number}} Rat */

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

export function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a / gcd(a, b) * b);
}

function checkSafe(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) {
    throw new ParseError('toolarge', 'that number is too large to check exactly');
  }
}

/**
 * rat(n, d) → reduced rational. Throws ParseError('divzero') when d === 0.
 * @param {number} n integer
 * @param {number} [d=1] integer
 * @returns {Rat}
 */
export function rat(n, d = 1) {
  if (d === 0) throw new ParseError('divzero', 'division by zero');
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    throw new ParseError('syntax', 'rat() needs integers');
  }
  checkSafe(n, d);
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  n = n / g; d = d / g;
  if (n === 0) n = 0; // never -0
  return { n, d };
}

export function isRat(v) {
  return v !== null && typeof v === 'object' && Number.isInteger(v.n) && Number.isInteger(v.d) && v.d > 0;
}

export const ratAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const ratSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const ratMul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const ratDiv = (a, b) => {
  if (b.n === 0) throw new ParseError('divzero', 'division by zero');
  return rat(a.n * b.d, a.d * b.n);
};
export const ratNeg = (a) => rat(-a.n, a.d);
export const ratAbs = (a) => rat(Math.abs(a.n), a.d);
export const ratEq = (a, b) => a.n === b.n && a.d === b.d;
export const ratIsInt = (a) => a.d === 1;
export const ratIsZero = (a) => a.n === 0;
export const ratSign = (a) => Math.sign(a.n);
export const ratToNumber = (a) => a.n / a.d;
/** -1, 0, 1 */
export const ratCmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);

/** integer power k ≥ 0 (k ≤ 40 guard; larger is never meaningful here) */
export function ratPow(a, k) {
  if (!Number.isInteger(k) || k < 0) throw new ParseError('exponent', 'the exponent must be a whole number');
  if (k > 40) throw new ParseError('toolarge', 'that exponent is too large');
  let out = rat(1);
  for (let i = 0; i < k; i++) out = ratMul(out, a);
  return out;
}

/** "5", "-1/2", "11/2" */
export function ratToString(a) {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}

/**
 * Decimal text → exact rational, or null when it has more than `maxPlaces`
 * decimal places (the caller falls back to a float). Accepts "5", "5.50",
 * ".5", "5." ; no sign, no exponent.
 * @param {string} text
 * @param {number} [maxPlaces=6]
 * @returns {Rat|null}
 */
export function ratFromDecimal(text, maxPlaces = 6) {
  const m = /^(\d*)\.?(\d*)$/.exec(text);
  if (!m || (m[1] === '' && m[2] === '')) throw new ParseError('syntax', `not a number: ${text}`);
  const ip = m[1] || '0';
  const fp = m[2] || '';
  if (fp.length > maxPlaces) return null;
  if (ip.length + fp.length > 15) throw new ParseError('toolarge', 'that number is too large to check exactly');
  const n = Number(ip + fp);
  const d = 10 ** fp.length;
  return rat(n, d);
}

/**
 * Anything → Rat when it can be exact: a Rat, an integer, a float with ≤ 6
 * decimal places, or a string that parseNumber reads as rational. Else null.
 * @param {*} x
 * @returns {Rat|null}
 */
export function toRat(x) {
  if (isRat(x)) return rat(x.n, x.d);
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) return null;
    const s = Math.abs(x).toString();
    if (/e/i.test(s)) return null;
    const r = ratFromDecimal(s, 6);
    return r ? (x < 0 ? ratNeg(r) : r) : null;
  }
  if (typeof x === 'string') {
    const p = parseNumber(x);
    return p.ok && p.kind === 'rational' ? p.value : null;
  }
  return null;
}

/** Rat | number → JS number */
export function toNumber(x) {
  if (isRat(x)) return x.n / x.d;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const p = parseNumber(x);
    return p.ok ? toNumber(p.value) : NaN;
  }
  return NaN;
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

const RE_DASH = /[−‐‑‒–—―⁃－ｰー⁻]/g; // − ‐ ‑ ‒ – — ― ⁃ － ｰ ー ⁻
const RE_TIMES = /[×·⋅∗•∙]/g; // × · ⋅ ∗ • ∙
const RE_FRACSLASH = /[⁄∕]/g; // ⁄ ∕
const RE_DEGREE_GLYPH = /[°º˚∘]/g; // ° º ˚ ∘  (º and ˚ do NOT survive NFKC)
// No regex lookbehind anywhere in site/js: older iOS Safari rejects it at parse time and would take every grader down.
const RE_DEG_WORD = /(^|[^a-z])deg(?:s|rees?)?(?![a-z])/gi;
const RE_SUPER = /[⁰¹²³⁴-⁹]+/g;
const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const VULGAR = {
  '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4],
  '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5], '⅙': [1, 6], '⅚': [5, 6],
  '⅐': [1, 7], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8], '⅑': [1, 9], '⅒': [1, 10],
};
const VULGAR_CLASS = '[' + Object.keys(VULGAR).join('') + ']';
const RE_MIXED_GLYPH = new RegExp('([+-]?)(\\d+)\\s*(' + VULGAR_CLASS + ')', 'g');
const RE_BARE_GLYPH = new RegExp(VULGAR_CLASS, 'g');
// "5 1/2" (space between the integer and the fraction) is a mixed number.
const RE_MIXED_SPACE = /(^|[^\d.])(\d+)[ \t]+(\d+)\s*\/\s*(\d+)(?![\d./])/g;
// leading `x =`, `m =`, `perimeter =`, `m∠ABC =`, `m<ABC =`, `angle ABC =`, bare `=`
const RE_PREFIX = /^\s*(?:(?:m\s*)?(?:[∠<]|angle)\s*[a-z]{1,3}|[a-z][a-z0-9_]*)?\s*=\s*/i;
const RE_TRAILING_DOT = /\.\s*$/;
const RE_UNITS = /([\d)])\s*(?:units?|u|cm|mm|in|inch|inches)(?![a-z])/gi;

/**
 * @typedef {object} NormalizeOptions
 * @property {boolean} [prefix=true]      strip a leading `x =` / `m∠… =` / `=`
 * @property {boolean} [trailingDot=true] strip one trailing '.'
 * @property {boolean} [degrees=true]     strip ° º ˚ and deg/degs/degrees
 * @property {boolean} [units=true]       strip units?/u/cm/mm/in after a number
 * @property {boolean} [fractions=true]   rewrite ½-style glyphs and `a b/c` mixed numbers
 * @property {boolean} [lower=true]       lowercase (variable letters are case-insensitive)
 */

/**
 * normalizeText — the S3 normalization. Pure string → string; never throws.
 * @param {*} raw
 * @param {NormalizeOptions} [opts]
 * @returns {string}
 */
export function normalizeText(raw, opts = {}) {
  const o = {
    prefix: true, trailingDot: true, degrees: true, units: true, fractions: true, lower: true,
    ...opts,
  };
  let s = raw == null ? '' : String(raw);
  s = s.replace(/ /g, ' ').trim();
  if (!s) return '';

  // 1. glyphs that NFKC would mangle or that need a canonical ASCII form
  s = s.replace(RE_DASH, '-')
    .replace(RE_TIMES, '*')
    .replace(RE_FRACSLASH, '/')
    .replace(/\*\*/g, '^')
    .replace(RE_SUPER, (m) => '^' + [...m].map((c) => SUPER[c]).join(''))
    .replace(RE_DEGREE_GLYPH, '°');

  // 2. vulgar fractions: <digit>½ is a mixed number, never 5(1/2)
  if (o.fractions) {
    s = s.replace(RE_MIXED_GLYPH, (m, sign, int, g) => {
      const [n, d] = VULGAR[g];
      return `${sign}(${int}+(${n}/${d}))`;
    });
    s = s.replace(RE_BARE_GLYPH, (g) => {
      const [n, d] = VULGAR[g];
      return `(${n}/${d})`;
    });
  }

  // 3. NFKC (fullwidth digits/letters/parens → ASCII), then case
  s = s.normalize('NFKC').replace(RE_FRACSLASH, '/');
  if (o.lower) s = s.toLowerCase();

  // 4. prefixes / suffixes
  if (o.prefix) s = s.replace(RE_PREFIX, '');
  if (o.trailingDot) s = s.replace(RE_TRAILING_DOT, '');
  if (o.degrees) s = s.replace(/°/g, '').replace(RE_DEG_WORD, '$1');
  if (o.units) s = s.replace(RE_UNITS, '$1');

  // 5. "5 1/2" mixed numbers (after prefix removal so `x = 5 1/2` works)
  if (o.fractions) {
    s = s.replace(RE_MIXED_SPACE, (m, before, a, b, c) => `${before}(${a}+(${b}/${c}))`);
  }

  // 6. whitespace
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * stripPrefix — just the leading `x =` / `m∠ABC =` / `=` rule (for per-token use
 * in the roots grader). Case-insensitive; returns the rest, trimmed.
 * @param {string} s
 * @returns {string}
 */
export function stripPrefix(s) {
  return String(s ?? '').replace(RE_PREFIX, '').trim();
}

// ---------------------------------------------------------------------------
// Tokenizer + recursive-descent parser → AST  (S3 `factored` grammar, plus
// unary '+', a term-level '/' and `**`; the algebra decides what '/' may divide)
//
//   expr  := term (('+'|'-') term)*
//   term  := unary (('*'|'/'|IMPL) unary)*
//   unary := ('-'|'+') unary | pow
//   pow   := atom ('^' INT)?
//   atom  := NUM | VAR | '(' expr ')'
//   IMPL  := NUM→VAR, NUM→'(', ')'→'(', ')'→VAR, VAR→'('    (nothing else)
// ---------------------------------------------------------------------------

/**
 * @typedef {{t:'num'|'var'|'op'|'lp'|'rp'|'eq'|'comma'|'end', v?:string, i:number}} Token
 */

/**
 * tokenize — normalized text → tokens. Throws ParseError('char') on anything
 * outside the grammar's alphabet. `=` and `,` are tokenized (not accepted by the
 * parser) so callers can give targeted messages.
 * @param {string} s
 * @returns {Token[]}
 */
export function tokenize(s) {
  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if ((c >= '0' && c <= '9') || (c === '.' && i + 1 < n && s[i + 1] >= '0' && s[i + 1] <= '9')) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      out.push({ t: 'num', v: m[0], i });
      i += m[0].length;
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) { out.push({ t: 'var', v: c, i }); i++; continue; }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') { out.push({ t: 'op', v: c, i }); i++; continue; }
    if (c === '(') { out.push({ t: 'lp', i }); i++; continue; }
    if (c === ')') { out.push({ t: 'rp', i }); i++; continue; }
    if (c === '=') { out.push({ t: 'eq', i }); i++; continue; }
    if (c === ',') { out.push({ t: 'comma', i }); i++; continue; }
    throw new ParseError('char', `unexpected character "${c}"`, { pos: i, got: c });
  }
  out.push({ t: 'end', i: n });
  return out;
}

/**
 * @typedef {{t:'num', v:string, i:number}
 *   | {t:'var', v:string, i:number}
 *   | {t:'neg'|'pos', a:Ast}
 *   | {t:'add'|'sub'|'div', a:Ast, b:Ast}
 *   | {t:'mul', a:Ast, b:Ast, implicit:boolean}
 *   | {t:'pow', a:Ast, k:number}} Ast
 */

/**
 * parseExpr — tokens (or normalized text) → AST. Throws ParseError with codes
 * 'syntax' | 'char' | 'equals' | 'exponent' | 'empty'.
 * @param {Token[]|string} input
 * @returns {Ast}
 */
export function parseExpr(input) {
  const toks = typeof input === 'string' ? tokenize(input) : input;
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const fail = (code, msg, tok) => { throw new ParseError(code, msg, { pos: tok ? tok.i : 0 }); };

  if (toks.length === 1) fail('empty', 'type an answer', toks[0]);

  function expr() {
    let node = term();
    for (;;) {
      const t = peek();
      if (t.t === 'op' && (t.v === '+' || t.v === '-')) {
        next();
        const rhs = term();
        node = { t: t.v === '+' ? 'add' : 'sub', a: node, b: rhs };
      } else return node;
    }
  }

  function term() {
    let node = unary();
    for (;;) {
      const t = peek();
      if (t.t === 'op' && (t.v === '*' || t.v === '/')) {
        next();
        const rhs = unary();
        node = t.v === '*' ? { t: 'mul', a: node, b: rhs, implicit: false } : { t: 'div', a: node, b: rhs };
        continue;
      }
      // implicit multiplication: only the pairs the grammar allows
      const prev = toks[p - 1];
      if (t.t === 'var' || t.t === 'lp') {
        const ok = (prev.t === 'num' && (t.t === 'var' || t.t === 'lp'))
          || (prev.t === 'rp' && (t.t === 'lp' || t.t === 'var'))
          || (prev.t === 'var' && t.t === 'lp');
        if (ok) {
          const rhs = unary();
          node = { t: 'mul', a: node, b: rhs, implicit: true };
          continue;
        }
        if (prev.t === 'var' && t.t === 'var') fail('syntax', `"${prev.v}${t.v}" — use one variable, or put * between letters`, t);
        fail('syntax', 'missing an operator', t);
      }
      if (t.t === 'num') {
        if (prev.t === 'var') fail('syntax', `write ${t.v}${prev.v}, not ${prev.v}${t.v}`, t);
        fail('syntax', `missing an operator before ${t.v}`, t);
      }
      return node;
    }
  }

  function unary() {
    const t = peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) {
      next();
      const a = unary();
      return { t: t.v === '-' ? 'neg' : 'pos', a };
    }
    return pow();
  }

  function pow() {
    const base = atom();
    const t = peek();
    if (t.t === 'op' && t.v === '^') {
      next();
      const e = peek();
      if (e.t === 'num' && /^\d+$/.test(e.v)) {
        next();
        return { t: 'pow', a: base, k: Number(e.v) };
      }
      if (e.t === 'op' && e.v === '-') fail('exponent', 'negative exponents are not allowed here', e);
      fail('exponent', 'the exponent must be a whole number', e);
    }
    return base;
  }

  function atom() {
    const t = next();
    if (t.t === 'num') return { t: 'num', v: t.v, i: t.i };
    if (t.t === 'var') return { t: 'var', v: t.v, i: t.i };
    if (t.t === 'lp') {
      const inner = expr();
      const c = next();
      if (c.t !== 'rp') fail('syntax', 'missing a closing )', c);
      return inner;
    }
    if (t.t === 'rp') fail('syntax', 'unexpected )', t);
    if (t.t === 'eq') fail('equals', 'no = here — enter just the expression', t);
    if (t.t === 'comma') fail('syntax', 'unexpected comma', t);
    if (t.t === 'op') {
      if (t.v === '*' || t.v === '/') fail('syntax', `unexpected ${t.v}`, t);
      fail('syntax', `unexpected ${t.v}`, t);
    }
    if (t.t === 'end') fail('syntax', 'the expression ends too soon', t);
    fail('syntax', 'could not read that', t);
  }

  const ast = expr();
  const rest = peek();
  if (rest.t !== 'end') {
    if (rest.t === 'eq') fail('equals', 'no = here — enter just the expression', rest);
    if (rest.t === 'rp') fail('syntax', 'unexpected ) — check the parentheses', rest);
    if (rest.t === 'comma') fail('syntax', 'unexpected comma', rest);
    fail('syntax', 'could not read past here', rest);
  }
  return ast;
}

/**
 * evalAst — fold an AST through an algebra. The algebra supplies:
 *   num(text) · variable(name) · neg(v) · add(a,b) · sub(a,b) · mul(a,b,implicit) · div(a,b) · pow(v,k)
 * Any of them may throw ParseError.
 * @template V
 * @param {Ast} ast
 * @param {object} alg
 * @returns {V}
 */
export function evalAst(ast, alg) {
  switch (ast.t) {
    case 'num': return alg.num(ast.v);
    case 'var': return alg.variable(ast.v);
    case 'neg': return alg.neg(evalAst(ast.a, alg));
    case 'pos': return evalAst(ast.a, alg);
    case 'add': return alg.add(evalAst(ast.a, alg), evalAst(ast.b, alg));
    case 'sub': return alg.sub(evalAst(ast.a, alg), evalAst(ast.b, alg));
    case 'mul': return alg.mul(evalAst(ast.a, alg), evalAst(ast.b, alg), ast.implicit);
    case 'div': return alg.div(evalAst(ast.a, alg), evalAst(ast.b, alg));
    case 'pow': return alg.pow(evalAst(ast.a, alg), ast.k);
    default: throw new ParseError('syntax', 'bad expression');
  }
}

/** every variable letter that appears in an AST, in first-appearance order */
export function astVars(ast, out = []) {
  if (!ast) return out;
  if (ast.t === 'var') { if (!out.includes(ast.v)) out.push(ast.v); return out; }
  if (ast.a) astVars(ast.a, out);
  if (ast.b) astVars(ast.b, out);
  return out;
}

// ---------------------------------------------------------------------------
// NUM algebra: constant expressions over Rat | float. Rat op Rat stays exact;
// anything touching a float becomes a float.
// ---------------------------------------------------------------------------

const isF = (v) => typeof v === 'number';
const fl = (v) => (isF(v) ? v : v.n / v.d);

export const NUM = {
  num(text) {
    const r = ratFromDecimal(text, 6);
    return r === null ? parseFloat(text) : r;
  },
  variable(name) {
    throw new ParseError('variable', 'numbers only — no letters', { vars: [name] });
  },
  neg: (a) => (isF(a) ? -a : ratNeg(a)),
  add: (a, b) => (isF(a) || isF(b) ? fl(a) + fl(b) : ratAdd(a, b)),
  sub: (a, b) => (isF(a) || isF(b) ? fl(a) - fl(b) : ratSub(a, b)),
  mul: (a, b) => (isF(a) || isF(b) ? fl(a) * fl(b) : ratMul(a, b)),
  div: (a, b) => {
    if (isF(a) || isF(b)) {
      if (fl(b) === 0) throw new ParseError('divzero', 'division by zero');
      return fl(a) / fl(b);
    }
    return ratDiv(a, b);
  },
  pow: (a, k) => {
    if (k > 40) throw new ParseError('toolarge', 'that exponent is too large');
    return isF(a) ? a ** k : ratPow(a, k);
  },
};

// ---------------------------------------------------------------------------
// parseNumber / numEquals — the `num` contract every numeric grader uses.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} NumResult
 * @property {boolean} ok
 * @property {Rat|number} [value]     {n,d} when exact, a float otherwise
 * @property {'rational'|'float'} [kind]
 * @property {string} [text]          canonical spelling ("11/2", "171.0000001")
 * @property {string} normalized      the normalized input
 * @property {string} [err]           'empty'|'comma'|'sci'|'variable'|'syntax'|'char'|'equals'|'divzero'|'exponent'|'toolarge'
 * @property {string} [msg]           default student-facing message
 * @property {string[]} [vars]        letters seen (err 'variable')
 */

/**
 * parseNumber — one number from student text: integer, decimal, fraction,
 * mixed number, negative, unicode fraction, degree/unit suffix, `x =` prefix,
 * or a constant expression such as `180-55`, `(1/2)`, `-(1/2)`, `2*30`, `90/4`.
 * Never throws.
 * @param {*} raw
 * @param {NormalizeOptions} [opts]
 * @returns {NumResult}
 */
export function parseNumber(raw, opts = {}) {
  const normalized = normalizeText(raw, opts);
  const fail = (err, msg, extra) => ({ ok: false, err, msg, normalized, ...(extra || {}) });
  if (!normalized) return fail('empty', 'type an answer');
  if (normalized.includes(',')) {
    return fail('comma', 'no commas inside a number — write 1000, not 1,000');
  }
  if (/[a-z]/i.test(normalized)) {
    if (/^[+-]?(\d+\.?\d*|\.\d+)\s*e\s*[+-]?\d+$/i.test(normalized)) {
      return fail('sci', 'scientific notation is not accepted — write the number out');
    }
    const vars = [...new Set(normalized.match(/[a-z]/gi))];
    return fail('variable', 'numbers only — no letters', { vars });
  }
  let v;
  try {
    v = evalAst(parseExpr(tokenize(normalized)), NUM);
  } catch (e) {
    if (e instanceof ParseError) return fail(e.code, e.message, { pos: e.pos, vars: e.vars });
    throw e;
  }
  if (isRat(v)) {
    return { ok: true, value: v, kind: 'rational', text: ratToString(v), normalized };
  }
  if (!Number.isFinite(v)) return fail('toolarge', 'that number is too large');
  if (Object.is(v, -0)) v = 0;
  return { ok: true, value: v, kind: 'float', text: String(v), normalized };
}

/** the one tolerance rule: `part.tol ?? 0.01` (no integer special case) */
export const DEFAULT_TOL = 0.01;
export function tolFor(part) {
  const t = part && part.tol;
  return typeof t === 'number' && t >= 0 ? t : DEFAULT_TOL;
}

function asValue(x) {
  if (x == null) return null;
  if (isRat(x)) return x;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x === 'object' && 'ok' in x) return x.ok ? x.value : null;
  if (typeof x === 'string') {
    const p = parseNumber(x);
    return p.ok ? p.value : null;
  }
  return null;
}

/**
 * numEquals — the one rule: equal when the two values are the same exact
 * rational (reduced forms are canonical, so 5.5 ≡ 11/2 with no float noise,
 * even at tol = 0) OR |a − b| ≤ tol (tol = part.tol ?? 0.01, no integer
 * special case — 171.0000001 and 171.004 both pass for 171). Accepts Rat,
 * number, a parseNumber result, or a string (parsed with defaults).
 * Unparseable → false.
 * @param {*} a
 * @param {*} b
 * @param {number} [tol=0.01]
 * @returns {boolean}
 */
export function numEquals(a, b, tol = DEFAULT_TOL) {
  const x = asValue(a);
  const y = asValue(b);
  if (x === null || y === null) return false;
  if (isRat(x) && isRat(y) && x.n === y.n && x.d === y.d) return true;
  if (!(tol >= 0)) tol = DEFAULT_TOL;
  return Math.abs(fl(x) - fl(y)) <= tol;
}

/** true when v is exactly the negation of w (sign diagnosis helper) */
export function numIsNegOf(v, w, tol = DEFAULT_TOL) {
  const x = asValue(v);
  const y = asValue(w);
  if (x === null || y === null) return false;
  return numEquals(isF(x) ? -x : ratNeg(x), y, tol);
}

/**
 * formatNumber — display spelling for a Rat | number: "5", "-1/2", "5.5".
 * `style: 'decimal'` prints rationals as decimals when they terminate within 6 places.
 * @param {Rat|number} v
 * @param {{style?:'fraction'|'decimal'}} [opts]
 */
export function formatNumber(v, opts = {}) {
  if (isRat(v)) {
    if (opts.style === 'decimal') {
      const f = v.n / v.d;
      const s = f.toString();
      if (!/e/i.test(s) && (s.split('.')[1] || '').length <= 6 && ratEq(toRat(f) || rat(0), v)) return s;
    }
    return ratToString(v);
  }
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  return String(v);
}
