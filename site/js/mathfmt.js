// mathfmt.js — mini-markup → safe HTML for geometry notation (COMPOSED S5 "Type", S9 #3).
//
//   {line AB}  → AB with a double-arrow overline   (line)
//   {seg AB}   → AB with a plain bar                (segment)
//   {ray AB}   → AB with a right arrow              (ray, endpoint first)
//   {len AB}   → AB, no decoration                  (the length — a number)
//   {ang ABC}  → ∠ABC                               (vertex in the middle)
//   {m ABC}    → m∠ABC                              (the measure)
//   {plane P} / {plane ABC} → plane P / plane ABC
//   x^2, x^{12}, x^-1 → superscript exponent
//   ≅ ° − and every other character pass through, HTML-escaped.
//   \n → <br>.
//
// Overlines are border-top on an inline-block span with ::before/::after arrowheads
// (CSS in site/css/components.css, block /* === T05 === */), so the decoration spans
// the letters at every font size. No MathML, no KaTeX.
//
// Everything is escaped: `mathfmt('<script>')` is inert. Unknown {kw …} groups are
// left as literal (escaped) text so authoring mistakes stay visible instead of vanishing.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape a string (exported for widgets that mix text with mathfmt output). */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

// kind → {cls, label (plain-text word), pre (glyph prefix), decorated (has an overline)}
const KINDS = {
  line: { cls: 'mf-line', label: 'line', pre: '', decorated: true },
  seg: { cls: 'mf-seg', label: 'segment', pre: '', decorated: true },
  ray: { cls: 'mf-ray', label: 'ray', pre: '', decorated: true },
  len: { cls: 'mf-len', label: '', pre: '', decorated: false },
  ang: { cls: 'mf-ang', label: '', pre: '∠', decorated: false },
  m: { cls: 'mf-m', label: '', pre: 'm∠', decorated: false },
  plane: { cls: 'mf-plane', label: 'plane', pre: '', decorated: false },
};
const ALIAS = { segment: 'seg', length: 'len', angle: 'ang', measure: 'm', pt: 'len' };

// {kind body}  |  ^{…}  |  ^-12  |  ^x
const TOKEN = /\{\s*([A-Za-z]+)\s+([^{}]*?)\s*\}|\^(?:\{([^{}]*)\}|(-?\d+|[A-Za-z]))/g;

const SUP_DIGITS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '−': '⁻', '+': '⁺' };

function kindOf(word) {
  const k = word.toLowerCase();
  return KINDS[k] ? k : (ALIAS[k] && KINDS[ALIAS[k]] ? ALIAS[k] : null);
}

/** Letters of a notation body: "A B" → "AB" (spaces dropped, nothing else touched). */
function letters(body) {
  return body.replace(/\s+/g, '');
}

/** Plain-text spelling of one notation group (what a screen reader / the copy text gets). */
function plainGroup(kind, body) {
  const k = KINDS[kind];
  const pts = letters(body);
  if (k.label) return `${k.label} ${pts}`;
  return `${k.pre}${pts}`;
}

function supPlain(exp) {
  return exp.split('').map((c) => SUP_DIGITS[c] ?? c).join('');
}

/**
 * Render mini-markup to safe HTML.
 * @param {string} src
 * @returns {string} HTML
 */
export function mathfmt(src) {
  const s = String(src ?? '');
  let out = '';
  let last = 0;
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(s))) {
    out += escapeHtml(s.slice(last, m.index)).replace(/\n/g, '<br>');
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      const kind = kindOf(m[1]);
      if (!kind || !letters(m[2]).length) {
        out += escapeHtml(m[0]); // unknown group → literal, visible
        continue;
      }
      const k = KINDS[kind];
      const pts = escapeHtml(letters(m[2]));
      if (k.decorated) {
        // role="img" + aria-label: the meaning lives in the CSS decoration, so name it for AT.
        out += `<span class="mf ${k.cls}" role="img" aria-label="${escapeHtml(plainGroup(kind, m[2]))}">${pts}</span>`;
      } else if (kind === 'plane') {
        out += `<span class="mf ${k.cls}">plane ${pts}</span>`;
      } else {
        out += `<span class="mf ${k.cls}">${k.pre}${pts}</span>`;
      }
    } else {
      const exp = (m[3] !== undefined ? m[3] : m[4]).replace(/-/g, '−');
      out += `<sup class="mf-sup">${escapeHtml(exp)}</sup>`;
    }
  }
  out += escapeHtml(s.slice(last)).replace(/\n/g, '<br>');
  return out;
}

/**
 * Mini-markup → plain text (aria labels, copyable prose, test fixtures):
 * {line AB} → "line AB", {seg AB} → "segment AB", {ray AB} → "ray AB", {len AB} → "AB",
 * {ang ABC} → "∠ABC", {m ABC} → "m∠ABC", {plane P} → "plane P", x^2 → "x²".
 * @param {string} src
 * @returns {string}
 */
export function stripMarkup(src) {
  const s = String(src ?? '');
  let out = '';
  let last = 0;
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(s))) {
    out += s.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      const kind = kindOf(m[1]);
      out += kind && letters(m[2]).length ? plainGroup(kind, m[2]) : m[0];
    } else {
      out += supPlain(m[3] !== undefined ? m[3] : m[4]);
    }
  }
  return out + s.slice(last);
}

/** True when the string contains any mathfmt group or exponent (widgets use it to decide whether to route through mathfmt). */
export function hasMarkup(src) {
  TOKEN.lastIndex = 0;
  return TOKEN.test(String(src ?? ''));
}

export default mathfmt;
