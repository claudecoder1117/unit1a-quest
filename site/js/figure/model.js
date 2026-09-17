// figure/model.js — T04. The ONE figure model that feeds both the pairs grader and the SVG renderer
// (COMPOSED S3 "Figure model", S5 "Figures", S6 figure schema), so they can never disagree.
//
// Two kinds:
//   fan  — rays from one vertex:  { id, kind:'fan', vertex:'F', center:[x,y], rays:[{n, deg, len?, free?}],
//          lines:[[X,Y]] (opposite rays: deg differ by 180 — collinearity by construction),
//          rightMarks:[[X,Y]] (drawn square; the two rays are 90° apart), arcs:[[X,Y]] (decorative arcs),
//          labels:[{angle:[X,Y], text}], labelOffsets:{angle:{'X-Y':[dx,dy]}, point:{A:[dx,dy]}},
//          angleNames:{UL:[X,Y]} (aliases for unlettered figures), dots:true|false, arrows:true|false }
//   poly — points joined by straight chains: { id, kind:'poly', points:{A:[x,y]}, segments:[[A,B,C],[A,E],…]
//          (a chain lists every named point along one straight stroke, in order — that is how
//          collinearity/betweenness is encoded), ticks:[[[C,B],[B,A]], …] (group k → k+1 marks),
//          labels:[{seg:[C,B], text} | {angle:[X,V,Y], text}], labelOffsets:{seg:{'B-C':[dx,dy]}, point:{}, angle:{}} }
//
// Angles are every ∠XVY with 0 < measure < 180 (composite ones included; straight angles excluded).
// Relations are STRUCTURAL: linearPair / vertical / adjacent from ray sharing and `lines`;
// supplementary / complementary from measures in GENERIC instances — every ray whose direction is
// not tied to the first ray by `lines` / `rightMarks` is nudged by a generic amount (F1's C, drawn at
// 26° on the scan, lands at 35.37° exactly as the spec says) so only relations that hold for every
// drawing of the figure survive. A sum counts only when it holds in TWO independent generic instances
// (different nudge sizes), so no single lucky nudge can fake a 90° / 180° sum. `measure()` always
// reports the DRAWN instance (what the arithmetic feedback shows).
//
// DOM-free; imports nothing; runs identically under node --test and in the browser.

export const GENERIC_DEG = 35.37;            // where F1's free ray C lands in the generic instance (COMPOSED S3)
export const GENERIC_NUDGE = 9.37;           // 26 (scan) + 9.37 = 35.37
const GENERIC_NUDGE_2 = 7.13;                // the second, independent instance
const GENERIC_DECAY = [0.7, 0.6];            // per extra free component, per instance
export const EPS = 1e-6;
export const RELATIONS = Object.freeze(['linearPair', 'vertical', 'adjacent', 'nonAdjacent', 'supplementary', 'complementary']);
/** The T-fig-pairs generator's angle set (COMPOSED S2): no two sum to 90 or 180, none is 45 or 90. */
export const GENERIC_ANGLE_SET = Object.freeze([23, 29, 41, 47, 71, 79]);

const RELATION_ALIASES = {
  linearpair: 'linearPair', linear: 'linearPair', 'linear-pair': 'linearPair', lp: 'linearPair',
  vertical: 'vertical', adjacent: 'adjacent',
  nonadjacent: 'nonAdjacent', 'non-adjacent': 'nonAdjacent', 'not-adjacent': 'nonAdjacent', notadjacent: 'nonAdjacent',
  supplementary: 'supplementary', supp: 'supplementary', complementary: 'complementary', comp: 'complementary',
};

/** 'supp' | 'linear-pair' | 'nonadjacent' … → canonical relation id, or null. */
export function normRelation(r) {
  if (typeof r !== 'string') return null;
  const k = r.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (RELATIONS.includes(r.trim())) return r.trim();
  return RELATION_ALIASES[k] ?? RELATION_ALIASES[k.replace(/-/g, '')] ?? null;
}

export const norm = (d) => ((d % 360) + 360) % 360;
const near = (a, b, tol = EPS) => Math.abs(a - b) < tol;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ------------------------------------------------------------------------------------------------
// rename / resolve

const mapName = (map, n) => (map && Object.prototype.hasOwnProperty.call(map, n) ? map[n] : n);
const mapArr = (map, arr) => (Array.isArray(arr) ? arr.map(x => (Array.isArray(x) ? mapArr(map, x) : mapName(map, x))) : arr);

/** id for an angle from its two outer letters: sorted, joined by '-' ('C-D'). */
export function angleId(x, y) { return [x, y].sort(cmp).join('-'); }
/** canonical three-letter name, vertex in the middle, outer letters sorted ('CFD'). */
export function angleName(v, x, y) { const [p, q] = [x, y].sort(cmp); return `${p}${v}${q}`; }
export function pairKey(keyA, keyB) { return [keyA, keyB].sort(cmp).join('|'); }

function renameOffsets(map, offs, sortIds) {
  if (!offs) return offs;
  const out = {};
  for (const [id, v] of Object.entries(offs)) {
    const parts = id.split('-').map(p => mapName(map, p));
    out[sortIds ? parts.sort(cmp).join('-') : parts.join('-')] = v;
  }
  return out;
}

/** Deep-copies `fig` with every letter passed through `map` ({A:'G'}). Unmapped letters are kept. */
export function applyRename(fig, map) {
  const f = structuredClone(fig);
  if (!map || Object.keys(map).length === 0) return f;
  if (f.kind === 'fan') {
    f.vertex = mapName(map, f.vertex);
    f.rays = f.rays.map(r => ({ ...r, n: mapName(map, r.n), names: r.names ? r.names.map(n => mapName(map, n)) : undefined }));
    for (const k of ['lines', 'rightMarks', 'arcs']) if (f[k]) f[k] = mapArr(map, f[k]);
    if (f.angleNames) f.angleNames = Object.fromEntries(Object.entries(f.angleNames).map(([k, v]) => [k, mapArr(map, v)]));
  } else {
    f.points = Object.fromEntries(Object.entries(f.points).map(([k, v]) => [mapName(map, k), v]));
    if (f.segments) f.segments = mapArr(map, f.segments);
    if (f.ticks) f.ticks = mapArr(map, f.ticks);
    if (f.rightMarks) f.rightMarks = mapArr(map, f.rightMarks);
  }
  if (f.labels) f.labels = f.labels.map(l => ({ ...l, angle: l.angle ? mapArr(map, l.angle) : undefined, seg: l.seg ? mapArr(map, l.seg) : undefined, point: l.point ? mapName(map, l.point) : undefined, v: l.v ? mapName(map, l.v) : undefined }));
  if (f.labelOffsets) {
    f.labelOffsets = {
      angle: renameOffsets(map, f.labelOffsets.angle, true),
      seg: renameOffsets(map, f.labelOffsets.seg, true),
      point: f.labelOffsets.point ? Object.fromEntries(Object.entries(f.labelOffsets.point).map(([k, v]) => [mapName(map, k), v])) : undefined,
    };
  }
  return f;
}

function rotatePoint([x, y], [cx, cy], deg, mirror) {
  let dx = x - cx, dy = y - cy;
  if (mirror) dx = -dx;
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  // screen y points down: a positive (counter-clockwise on screen) rotation is x' = x cos + y sin, y' = −x sin + y cos
  return [cx + dx * c + dy * s, cy - dx * s + dy * c];
}

/** A label text that is just a number of degrees ("31°", "31", "62.5 °") → that number; else null. */
function numericDegrees(text) {
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*[°º˚]?\s*$/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Card figure spec → concrete drawn model. opts (the card's `figure` object, S6): { rename:{A:'G'},
 * labels:[…] (replaces the figure's default labels when given), notToScale (default: auto — any label
 * text contains a letter, or a numeric angle label differs from the drawn measure by > 0.5°),
 * rotate (degrees, generated variants use multiples of 15), mirror (bool), ticks (poly only: replaces
 * the figure's tick groups, e.g. figures.F2_TICKS), arcs (fan only: decorative arcs [[X,Y], …]) }.
 * The returned model is what angles()/pairs()/measure()/svg render() consume.
 */
export function resolve(fig, opts = {}) {
  if (!fig || (fig.kind !== 'fan' && fig.kind !== 'poly')) throw new Error('resolve: figure must be kind fan or poly');
  const m = applyRename(fig, opts.rename);
  m.figId = fig.id;
  m.rename = { ...(opts.rename ?? {}) };
  m.labels = Array.isArray(opts.labels) ? structuredClone(opts.labels) : (m.labels ?? []);
  m.rotate = Number(opts.rotate) || 0;
  m.mirror = !!opts.mirror;
  if (m.kind === 'fan') {
    m.center = m.center ?? [200, 150];
    m.rays = m.rays.map(r => ({ ...r, deg: norm((m.mirror ? 180 - r.deg : r.deg) + m.rotate) }));
    m.lines = m.lines ?? []; m.rightMarks = m.rightMarks ?? [];
    m.arcs = Array.isArray(opts.arcs) ? structuredClone(opts.arcs) : (m.arcs ?? []);
  } else {
    const pts = Object.values(m.points);
    const c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    if (m.rotate || m.mirror) m.points = Object.fromEntries(Object.entries(m.points).map(([k, p]) => [k, rotatePoint(p, c, m.rotate, m.mirror)]));
    m.segments = m.segments ?? []; m.rightMarks = m.rightMarks ?? [];
    m.ticks = Array.isArray(opts.ticks) ? structuredClone(opts.ticks) : (m.ticks ?? []);
  }
  m.labelOffsets = { angle: {}, seg: {}, point: {}, ...(m.labelOffsets ?? {}) };
  if (opts.labelOffsets && typeof opts.labelOffsets === 'object') {   // a card may override single entries
    for (const cat of ['angle', 'seg', 'point']) if (opts.labelOffsets[cat]) m.labelOffsets[cat] = { ...m.labelOffsets[cat], ...structuredClone(opts.labelOffsets[cat]) };
  }
  if (opts.notToScale != null) m.notToScale = !!opts.notToScale;
  else {
    let nts = m.labels.some(l => /[a-z]/i.test(String(l.text ?? '')));
    for (const l of m.labels) {
      if (nts || !l.angle) continue;
      const val = numericDegrees(l.text);
      if (val == null) continue;
      const [x, v, y] = l.angle.length === 3 ? l.angle : [l.angle[0], m.kind === 'fan' ? m.vertex : undefined, l.angle[1]];
      const drawn = measure(m, x, y, v);
      if (Number.isFinite(drawn) && Math.abs(drawn - val) > 0.5) nts = true;
    }
    m.notToScale = nts;
  }
  return m;
}

// ------------------------------------------------------------------------------------------------
// validation (tests assert every shipped figure is clean)

/** Returns a list of human-readable problems; [] when the model is consistent. */
export function validate(model) {
  const bad = [];
  if (!model || typeof model !== 'object') return ['not an object'];
  const L = (n) => typeof n === 'string' && /^[A-Z]$/.test(n);
  if (model.kind === 'fan') {
    if (!L(model.vertex)) bad.push(`vertex "${model.vertex}" must be one capital letter`);
    if (!Array.isArray(model.rays) || model.rays.length < 2) bad.push('a fan needs at least two rays');
    const names = new Set();
    for (const r of model.rays ?? []) {
      if (!L(r.n)) bad.push(`ray name "${r.n}" must be one capital letter`);
      if (names.has(r.n) || r.n === model.vertex) bad.push(`duplicate letter ${r.n}`);
      names.add(r.n);
      if (!Number.isFinite(r.deg)) bad.push(`ray ${r.n}: deg is not a number`);
      for (const a of r.names ?? []) { if (a !== r.n) { if (names.has(a)) bad.push(`duplicate letter ${a}`); names.add(a); } }
    }
    const sorted = (model.rays ?? []).map(r => norm(r.deg)).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) if (near(sorted[i], sorted[i - 1], 0.5)) bad.push(`two rays coincide at ${sorted[i]}°`);
    const deg = (n) => { const r = rayByName(model, n); return r ? norm(r.deg) : NaN; };
    for (const [x, y] of model.lines ?? []) {
      if (!rayByName(model, x) || !rayByName(model, y)) bad.push(`line [${x},${y}] names an unknown ray`);
      else if (!near(norm(deg(x) - deg(y)), 180, 0.5)) bad.push(`line [${x},${y}]: rays are ${norm(deg(x) - deg(y))}° apart, not 180°`);
    }
    for (const [x, y] of model.rightMarks ?? []) {
      if (!rayByName(model, x) || !rayByName(model, y)) bad.push(`rightMark [${x},${y}] names an unknown ray`);
      else { const d = norm(deg(x) - deg(y)); if (!near(d, 90, 0.5) && !near(d, 270, 0.5)) bad.push(`rightMark [${x},${y}]: rays are ${Math.min(d, 360 - d)}° apart, not 90°`); }
    }
    for (const [x, y] of model.arcs ?? []) if (!rayByName(model, x) || !rayByName(model, y)) bad.push(`arc [${x},${y}] names an unknown ray`);
    for (const [alias, pair] of Object.entries(model.angleNames ?? {})) {
      if (!Array.isArray(pair) || pair.length !== 2 || !rayByName(model, pair[0]) || !rayByName(model, pair[1])) bad.push(`angleNames.${alias} must name two rays`);
    }
    for (const l of model.labels ?? []) {
      if (l.angle) {
        const [x, v, y] = l.angle.length === 3 ? l.angle : [l.angle[0], model.vertex, l.angle[1]];
        if (v !== model.vertex) bad.push(`label "${l.text}": vertex ${v} is not ${model.vertex}`);
        const a = findAngle(model, x, y);
        if (!a) bad.push(`label "${l.text}": no angle ${x}${model.vertex}${y}`);
        else if (a.straight) bad.push(`label "${l.text}": ${a.name} is a straight angle`);
      } else if (l.seg) bad.push(`label "${l.text}": seg labels belong to poly figures`);
    }
  } else if (model.kind === 'poly') {
    const pts = model.points ?? {};
    for (const [k, p] of Object.entries(pts)) {
      if (!L(k)) bad.push(`point "${k}" must be one capital letter`);
      if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) bad.push(`point ${k}: bad coordinates`);
    }
    const chains = model.segments ?? [];
    if (chains.length === 0) bad.push('a poly needs segments');
    for (const ch of chains) {
      if (!Array.isArray(ch) || ch.length < 2) { bad.push(`segment ${JSON.stringify(ch)} needs ≥ 2 points`); continue; }
      for (const n of ch) if (!pts[n]) bad.push(`segment ${ch.join('')} names unknown point ${n}`);
      if (ch.every(n => pts[n]) && ch.length > 2) {
        const [a, b] = [pts[ch[0]], pts[ch[ch.length - 1]]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let i = 1; i < ch.length - 1; i++) {
          const p = pts[ch[i]];
          const dist = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
          const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len);
          if (dist > 0.75) bad.push(`point ${ch[i]} is ${dist.toFixed(1)} px off the line ${ch[0]}${ch[ch.length - 1]}`);
          if (t <= 0 || t >= 1) bad.push(`point ${ch[i]} is not between ${ch[0]} and ${ch[ch.length - 1]}`);
        }
      }
    }
    const isSub = (p, q) => chains.some(ch => { const i = ch.indexOf(p), j = ch.indexOf(q); return i >= 0 && j >= 0 && Math.abs(i - j) === 1; });
    for (const group of model.ticks ?? []) for (const [p, q] of group) if (!isSub(p, q)) bad.push(`tick [${p},${q}] is not a drawn sub-segment`);
    for (const l of model.labels ?? []) {
      if (l.seg && !isSub(l.seg[0], l.seg[1])) bad.push(`label "${l.text}": [${l.seg}] is not a drawn sub-segment`);
      if (l.angle) {
        if (l.angle.length !== 3) bad.push(`label "${l.text}": poly angle labels need [X,V,Y]`);
        else if (!findAngle(model, l.angle[0], l.angle[2], l.angle[1])) bad.push(`label "${l.text}": no angle ${l.angle.join('')}`);
      }
    }
  } else bad.push(`kind "${model.kind}" must be fan or poly`);
  if (model.rename) {
    const vals = Object.values(model.rename);
    if (new Set(vals).size !== vals.length) bad.push('rename map is not injective');
    for (const [k, v] of Object.entries(model.rename)) if (!L(k) || !L(v)) bad.push(`rename ${k}→${v} must map single capital letters`);
  }
  return bad;
}

// ------------------------------------------------------------------------------------------------
// rays

/** Ray by any of its names (a poly ray toward C through B answers to both). */
export function rayByName(fan, name) {
  if (!fan || !Array.isArray(fan.rays)) return null;
  return fan.rays.find(r => r.n === name || (r.names && r.names.includes(name))) ?? null;
}
export function rayDeg(fan, name) { const r = rayByName(fan, name); return r ? norm(r.deg) : NaN; }
/** Name of the ray opposite `name` (through `lines`), or null. */
export function opposite(fan, name) {
  const r = rayByName(fan, name);
  if (!r) return null;
  for (const [x, y] of fan.lines ?? []) {
    if (rayByName(fan, x) === r) return rayByName(fan, y)?.n ?? null;
    if (rayByName(fan, y) === r) return rayByName(fan, x)?.n ?? null;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// poly → one fan per vertex (so every angle routine is written once)

const fanCache = new WeakMap();
/** Fans at every point of a poly that has ≥ 2 directions. Ray names are the far endpoint of the chain;
 *  intermediate points are aliases (∠CAE and ∠BAE are the same angle of F2). */
export function polyFans(model) {
  if (model.kind !== 'poly') return [model];
  if (fanCache.has(model)) return fanCache.get(model);
  const out = [];
  for (const [P, pp] of Object.entries(model.points)) {
    const rays = [];
    const lines = [];
    for (const ch of model.segments) {
      const i = ch.indexOf(P);
      if (i < 0) continue;
      const mk = (Q, primary, aliases) => {
        const q = model.points[Q];
        const deg = norm((Math.atan2(-(q[1] - pp[1]), q[0] - pp[0]) * 180) / Math.PI);
        const existing = rays.find(r => near(r.deg, deg, 0.5));
        if (existing) { for (const a of [primary, ...aliases]) if (!existing.names.includes(a)) existing.names.push(a); return existing.n; }
        rays.push({ n: primary, deg, names: [primary, ...aliases] });
        return primary;
      };
      let back = null, fwd = null;
      if (i > 0) back = mk(ch[i - 1], ch[0], ch.slice(1, i).reverse());
      if (i < ch.length - 1) fwd = mk(ch[i + 1], ch[ch.length - 1], ch.slice(i + 1, ch.length - 1));
      if (back && fwd) lines.push([back, fwd]);
    }
    if (rays.length < 2) continue;
    const rm = (model.rightMarks ?? []).filter(m => m.length === 3 && m[1] === P).map(m => [m[0], m[2]]);
    out.push({ kind: 'fan', id: `${model.id}@${P}`, figId: model.figId, vertex: P, center: pp, rays, lines, rightMarks: rm, arcs: [], labels: [], labelOffsets: model.labelOffsets, poly: true });
  }
  fanCache.set(model, out);
  return out;
}

// ------------------------------------------------------------------------------------------------
// angles

const angleCache = new WeakMap();

function fanAngles(fan) {
  if (angleCache.has(fan)) return angleCache.get(fan);
  const rays = [...fan.rays].map(r => ({ ...r, deg: norm(r.deg) })).sort((a, b) => a.deg - b.deg);
  const out = [];
  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      const ri = rays[i], rj = rays[j];
      const d = norm(rj.deg - ri.deg);
      if (near(d, 180, 1e-4)) continue;                       // straight — not an angle of the figure
      const [a, b, start, span] = d < 180 ? [ri, rj, ri.deg, d] : [rj, ri, rj.deg, 360 - d];
      const inside = rays.filter(r => r !== a && r !== b && norm(r.deg - start) > 1e-4 && norm(r.deg - start) < span - 1e-4).map(r => r.n);
      const name = angleName(fan.vertex, a.n, b.n);
      const [x, y] = [a.n, b.n].sort(cmp);
      const ang = {
        key: name, name, v: fan.vertex, x, y,
        id: fan.poly ? `${x}-${y}@${fan.vertex}` : angleId(x, y),
        a: a.n, b: b.n, start, span, deg: span,
        inside, level: inside.length, atomic: inside.length === 0,
        alias: null, label: null,
      };
      out.push(ang);
    }
  }
  for (const [alias, [p, q]] of Object.entries(fan.angleNames ?? {})) {
    const ang = out.find(o => sameRays(fan, o, p, q));
    if (ang) { ang.alias = alias; ang.label = ALIAS_LABELS[alias] ?? alias; }
  }
  out.sort((p, q) => p.level - q.level || p.start - q.start || p.span - q.span);
  angleCache.set(fan, out);
  return out;
}
const ALIAS_LABELS = { UL: 'upper-left angle', UR: 'upper-right angle', LR: 'lower-right angle', LL: 'lower-left angle', T: 'top angle', B: 'bottom angle', L: 'left angle', R: 'right angle' };

function sameRays(fan, ang, p, q) {
  const rp = rayByName(fan, p), rq = rayByName(fan, q);
  if (!rp || !rq || rp === rq) return false;
  const ra = rayByName(fan, ang.a), rb = rayByName(fan, ang.b);
  return (ra === rp && rb === rq) || (ra === rq && rb === rp);
}

/** Every angle ∠XVY of the figure with 0 < measure < 180 (composite ones included), in the DRAWN instance. */
export function angles(model) {
  if (model.kind === 'poly') return polyFans(model).flatMap(fanAngles);
  return fanAngles(model);
}

/** Fan holding vertex `v` (the model itself for a fan). */
export function fanAt(model, v) {
  if (model.kind !== 'poly') return (v == null || v === model.vertex) ? model : null;
  return polyFans(model).find(f => f.vertex === v) ?? null;
}

/**
 * The angle with outer letters x, y at vertex v (default: the fan's vertex). Aliases resolve
 * (∠BAE ≡ ∠CAE on F2). Returns null for unknown letters; for opposite rays returns
 * { straight:true, deg:180, name, v, x, y } so callers can refuse it with a message.
 */
export function findAngle(model, x, y, v) {
  const fan = fanAt(model, v);
  if (!fan) return null;
  const rx = rayByName(fan, x), ry = rayByName(fan, y);
  if (!rx || !ry || rx === ry) return null;
  const hit = fanAngles(fan).find(a => sameRays(fan, a, x, y));
  if (hit) return hit;
  return { straight: true, deg: 180, name: angleName(fan.vertex, rx.n, ry.n), v: fan.vertex, x: rx.n, y: ry.n, key: angleName(fan.vertex, rx.n, ry.n) };
}

/** Angle by canonical name 'CFD', id 'C-D' (fan) / 'C-D@F', alias 'UL', or an angle object. */
export function getAngle(model, ref) {
  if (ref && typeof ref === 'object') return ref.key ? (angles(model).find(a => a.key === ref.key) ?? ref) : null;
  if (typeof ref !== 'string') return null;
  const all = angles(model);
  return all.find(a => a.key === ref || a.id === ref || a.name === ref || (a.alias && a.alias === ref)) ?? null;
}

/** Measure of ∠XVY in the DRAWN instance (0–180; 180 for opposite rays; NaN for unknown letters). */
export function measure(model, x, y, v) {
  const fan = fanAt(model, v);
  if (!fan) return NaN;
  const a = rayDeg(fan, x), b = rayDeg(fan, y);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  const d = norm(a - b);
  return Math.min(d, 360 - d);
}

// ------------------------------------------------------------------------------------------------
// structure: which rays are tied to which, and the generic instance

const structCache = new WeakMap();
/**
 * Union-find over rays through `lines` and `rightMarks`. Component 0 holds rays[0]; every other
 * component is free and gets its own generic nudge in each of the two instances: 9.37° (then ×0.7
 * per extra component) and 7.13° (×0.6). A component's nudge is capped at half the smallest
 * counter-clockwise gap from one of its rays to a ray of ANOTHER component, so the cyclic order of
 * the rays — and with it every angle's identity — is the same in the drawn and generic instances.
 */
export function structure(fan) {
  if (structCache.has(fan)) return structCache.get(fan);
  const idx = new Map(fan.rays.map((r, i) => [r, i]));
  const parent = fan.rays.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (x, y) => { const rx = rayByName(fan, x), ry = rayByName(fan, y); if (rx && ry) parent[find(idx.get(rx))] = find(idx.get(ry)); };
  for (const [x, y] of fan.lines ?? []) union(x, y);
  for (const [x, y] of fan.rightMarks ?? []) union(x, y);
  const roots = [];
  const comp = new Map();
  const compOf = fan.rays.map((r, i) => { const root = find(i); if (!roots.includes(root)) roots.push(root); const k = roots.indexOf(root); comp.set(r.n, k); for (const a of r.names ?? []) comp.set(a, k); return k; });
  // safe shift per component: half the smallest ccw gap to a ray outside the component
  const order = fan.rays.map((r, i) => ({ deg: norm(r.deg), k: compOf[i] })).sort((a, b) => a.deg - b.deg);
  const maxShift = roots.map(() => 360);
  for (let i = 0; i < order.length; i++) {
    const me = order[i];
    for (let j = 1; j <= order.length; j++) {
      const o = order[(i + j) % order.length];
      if (o.k === me.k) continue;
      const gap = norm(o.deg - me.deg) || 360;
      maxShift[me.k] = Math.min(maxShift[me.k], gap / 2);
      break;
    }
  }
  const nudgeSet = (base, decay) => roots.map((_, k) => (k === 0 ? 0 : Math.min(base * Math.pow(decay, k - 1), maxShift[k])));
  const nudges = nudgeSet(GENERIC_NUDGE, GENERIC_DECAY[0]);
  const nudges2 = nudgeSet(GENERIC_NUDGE_2, GENERIC_DECAY[1]);
  const free = new Set([...comp.entries()].filter(([, c]) => c !== 0).map(([n]) => n));
  const s = { comp, nudges, nudges2, free, components: roots.length, maxShift };
  structCache.set(fan, s);
  return s;
}

const genericCache = new WeakMap();
const genericCache2 = new WeakMap();
function makeGeneric(model, which) {
  const cacheMap = which === 2 ? genericCache2 : genericCache;
  if (cacheMap.has(model)) return cacheMap.get(model);
  let g;
  if (model.kind === 'poly') {
    g = { ...model, generic: which };
    const fans = polyFans(model).map(f => makeGeneric(f, which));
    fanCache.set(g, fans);
  } else {
    const s = structure(model);
    const n = which === 2 ? s.nudges2 : s.nudges;
    g = { ...model, generic: which, rays: model.rays.map(r => ({ ...r, deg: norm(r.deg + n[s.comp.get(r.n)]), free: s.free.has(r.n) })) };
  }
  cacheMap.set(model, g);
  return g;
}
/** The generic instance: same structure, free components nudged so only structural sums hit 90/180.
 *  (F1's C lands at 35.37°.) A generic model is its own generic instance. */
export function generic(model) {
  if (model.generic) return model;
  return makeGeneric(model, 1);
}
/** The second, independent generic instance (different nudge sizes) — a sum is structural only if it
 *  holds in both. */
export function generic2(model) {
  if (model.generic) return model;
  return makeGeneric(model, 2);
}

// ------------------------------------------------------------------------------------------------
// relations between two angles

/**
 * Everything the grader needs about a pair. A and B: angle objects, keys, ids or aliases.
 * Structural booleans: adjacent, linearPair, vertical, supplementary, complementary, nonAdjacent,
 * overlap (share a side but interiors overlap), sameAngle, contains (one inside the other);
 * plus shared (ray name or null), sum (drawn measures), sumGeneric.
 */
export function relate(model, A, B) {
  const a = getAngle(model, A), b = getAngle(model, B);
  if (!a || !b) return null;
  const fan = fanAt(model, a.v);
  const sameVertex = a.v === b.v;
  const sameAngle = a.key === b.key;
  const raysA = [a.a, a.b], raysB = [b.a, b.b];
  const shared = sameVertex ? raysA.filter(r => raysB.includes(r)) : [];
  const sharedRay = shared.length === 1 ? shared[0] : null;
  const adjacent = !!sharedRay && ((a.a === sharedRay && b.b === sharedRay) || (a.b === sharedRay && b.a === sharedRay));
  let linearPair = false;
  if (adjacent) {
    const restA = a.a === sharedRay ? a.b : a.a, restB = b.a === sharedRay ? b.b : b.a;
    linearPair = opposite(fan, restA) === restB;
  }
  const oa = opposite(fan, a.a), ob = opposite(fan, a.b);
  const vertical = sameVertex && !sameAngle && shared.length === 0 && !!oa && !!ob && raysB.includes(oa) && raysB.includes(ob);
  const g1 = generic(model), g2 = generic2(model);
  const ga = getAngle(g1, a.key), gb = getAngle(g1, b.key);
  const ga2 = getAngle(g2, a.key), gb2 = getAngle(g2, b.key);
  const sum = a.deg + b.deg;
  const sumGeneric = (ga?.deg ?? a.deg) + (gb?.deg ?? b.deg);
  const sumGeneric2 = (ga2?.deg ?? a.deg) + (gb2?.deg ?? b.deg);
  // measure relations are only defined between angles at ONE vertex: the fans of a poly are
  // structurally independent (F2's co-interior angles at A and D sum to 180 only because BD ∥ AE,
  // a fact this unit never asks about), so cross-vertex pairs are never supplementary/complementary.
  // A sum is structural only when BOTH generic instances agree (and the drawn one, which they imply).
  const structuralSum = (t) => near(sumGeneric, t, 1e-4) && near(sumGeneric2, t, 1e-4);
  const supplementary = sameVertex && !sameAngle && structuralSum(180);
  const complementary = sameVertex && !sameAngle && structuralSum(90);
  const within = (t, s, span) => norm(t - s) <= span + 1e-4;
  const contains = sameVertex && !sameAngle && ((within(b.start, a.start, a.span) && within(b.start + b.span, a.start, a.span)) || (within(a.start, b.start, b.span) && within(a.start + a.span, b.start, b.span)));
  return {
    a, b, sameVertex, sameAngle, shared: sharedRay, sharedCount: shared.length,
    adjacent, linearPair, vertical, supplementary, complementary,
    nonAdjacent: sameVertex && !sameAngle && !adjacent,
    overlap: !sameAngle && !!sharedRay && !adjacent,
    contains, sum, sumGeneric,
  };
}

/** true iff angles A and B stand in `relation` (any alias spelling) on this figure. */
export function isPair(model, A, B, relation) {
  const rel = normRelation(relation);
  const r = relate(model, A, B);
  return !!(rel && r && r[rel]);
}

/** Every valid pair for a relation: sorted [[keyA, keyB], …] with keyA < keyB, no duplicates. */
export function pairs(model, relation) {
  const rel = normRelation(relation);
  if (!rel) throw new Error(`pairs: unknown relation "${relation}"`);
  const all = angles(model);
  const out = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].v !== all[j].v) continue;                 // pairs live at one vertex
      const r = relate(model, all[i], all[j]);
      if (r && r[rel]) out.push([all[i].key, all[j].key].sort(cmp));
    }
  }
  return out.sort((p, q) => cmp(p[0], q[0]) || cmp(p[1], q[1]));
}

// ------------------------------------------------------------------------------------------------
// accidental sums (generator gate for T-fig-pairs; the tests run it on every shipped figure)

/** Pairs whose DRAWN measures sum to 90 or 180 without the relation being structural. */
export function accidentalSums(model) {
  const all = angles(model);
  const out = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].v !== all[j].v) continue;
      const r = relate(model, all[i], all[j]);
      if (near(r.sum, 180, 1e-3) && !r.supplementary) out.push({ a: all[i].key, b: all[j].key, sum: 180 });
      if (near(r.sum, 90, 1e-3) && !r.complementary) out.push({ a: all[i].key, b: all[j].key, sum: 90 });
    }
  }
  return out;
}

/** Throws (listing the offending pairs) when the drawn figure has a non-structural 90/180 sum. */
export function assertNoAccidentalSums(model) {
  const bad = accidentalSums(model);
  if (bad.length) throw new Error(`accidental sums in ${model.id ?? model.figId ?? 'figure'}: ${bad.map(p => `${p.a} + ${p.b} = ${p.sum}`).join('; ')}`);
  return true;
}

/** Sums to 90 or 180 among a raw angle set (i ≤ j). 90 + 90 = 180 is skipped unless allowRight:false —
 *  two right angles in one fan are always a structural linear pair. */
export function accidentalSumsInSet(degs, { allowRight = true } = {}) {
  const out = [];
  for (let i = 0; i < degs.length; i++) {
    for (let j = i; j < degs.length; j++) {
      const s = degs[i] + degs[j];
      if (allowRight && degs[i] === 90 && degs[j] === 90) continue;
      if (near(s, 90, 1e-9) || near(s, 180, 1e-9)) out.push([degs[i], degs[j]]);
    }
  }
  return out;
}

/** Plain-English description of a fan/poly for aria-label. */
export function describe(model) {
  if (model.kind === 'fan' && model.hideLetters) {
    // no printed letters (D7): describe by position names, never by the internal ray letters
    const parts = [`${model.lines.length === 2 ? 'two lines crossing' : `${model.rays.length} rays from one point`}`];
    const alias = (x, y) => Object.entries(model.angleNames ?? {}).find(([, [p, q]]) => (p === x && q === y) || (p === y && q === x))?.[0];
    const names = Object.keys(model.angleNames ?? {}).map(k => ALIAS_LABELS[k] ?? k);
    if (names.length) parts.push(`angles ${names.join(', ')}`);
    for (const l of model.labels) if (l.angle) { const [x, y] = l.angle.length === 3 ? [l.angle[0], l.angle[2]] : l.angle; const a = alias(x, y); parts.push(`${a ? (ALIAS_LABELS[a] ?? a) : 'an angle'} labelled ${l.text}`); }
    return parts.join('; ');
  }
  if (model.kind === 'fan') {
    const lines = model.lines.map(([x, y]) => `line ${x}${y}`);
    const inLine = new Set(model.lines.flat());
    const rays = model.rays.filter(r => !inLine.has(r.n)).map(r => `ray ${model.vertex}${r.n}`);
    const parts = [];
    if (lines.length) parts.push(`${lines.join(' and ')} meet at ${model.vertex}`);
    if (rays.length) parts.push(rays.join(', ') + (lines.length ? '' : ` from ${model.vertex}`));
    for (const [x, y] of model.rightMarks) parts.push(`right angle ${x}${model.vertex}${y}`);
    for (const l of model.labels) if (l.angle) { const [x, v, y] = l.angle.length === 3 ? l.angle : [l.angle[0], model.vertex, l.angle[1]]; parts.push(`angle ${x}${v}${y} labelled ${l.text}`); }
    return parts.join('; ');
  }
  const chains = model.segments.map(ch => `${ch[0]}${ch[ch.length - 1]}${ch.length > 2 ? ` through ${ch.slice(1, -1).join(', ')}` : ''}`);
  const parts = [`segments ${chains.join(', ')}`];
  for (const l of model.labels) if (l.seg) parts.push(`${l.seg.join('')} = ${l.text}`);
  return parts.join('; ');
}
