// figure/svg.js — T04. Figure model → SVG string (COMPOSED S5 "Figures"). Never the scan.
//
//   render(fig, opts)      → memoised SVG string, key = (figure id, rename, labels, notToScale, rotate, mirror, …)
//   renderModel(model)     → SVG string for an already-resolved model (no memo)
//   layout(model)          → every computed position (rays, dots, labels, arcs, wedge paths) — for tests/widgets
//   element(fig, opts)     → the SVG as a DOM element (browser only)
//   setWedgeState / clearWedgeStates / wedgeEl → the state classes on wedges (hover / selected / ok / bad / linked)
//
// viewBox 0 0 400 260. Rays are drawn by degree, lines get an arrowhead at both ends via <marker>
// (orient="auto-start-reverse"), rays one; 2 px round strokes in currentColor; points r 3.5 with a
// 12 px transparent hit circle; text labels carry a paint-order halo (css) and sit outward from
// their point, with per-figure `labelOffsets` overrides; angle labels ride the bisector at arc
// radius + 16 and are nudged outward until their text box clears every ray; nested arcs at 22 + 10k;
// right-angle mark 10 px; ticks for congruent segments; one transparent wedge per angle
// (<g class="fig-wedge" role="button" tabindex="0" aria-label="angle GFC" data-angle="C-G">) whose
// hit path is a full sector for atomic angles and an annular band for composite ones. fix:B3 — that
// hit path is SOLVED, not drawn: hitRegion() gives every angle — ∠AFC included — a bounding box of at
// least 44 px in BOTH directions at HIT_REF_W, the narrowest width the app draws a figure at, without
// moving the drawing by a byte; the "Not to scale" chip whenever expressions
// are present. Generated variants pass rotate (15° steps) / mirror / rename through resolve().
//
// DOM-free except element()/setWedgeState() (guarded). Imports only ./model.js.

import { resolve, angles, polyFans, rayByName, findAngle, describe, norm } from './model.js';

export const VIEW = Object.freeze({ w: 400, h: 260 });
const PAD = 6;                 // nothing (labels included) may cross this inset
const ARROW = 11;              // arrowhead length in viewBox units
const DOT_INSET = 22;          // dots sit this far inside the arrow tip on figures that draw dots
const LABEL_GAP = 16;          // point letter distance from its dot / tip
const PT_FS = 15, EXPR_FS = 13;
const WEDGE_MIN = 60, WEDGE_MAX = 140, BAND = 58, MIN_CHORD = 60;   // the DRAWN wedge: sector radius + ring pitch (unchanged since T04)
const RAY_MARGIN = 6, ARC_MARGIN = 4, LABEL_GAP_BOX = 6;   // expression labels keep this much clear air

// fix:B3 — the 44 px rule. The constants above size the DRAWING; these size the HIT path, which is
// solved separately per wedge (see hitRegion below). Two things were wrong before:
//   · the old rule sized a wedge by its CHORD (`MIN_CHORD / (2·sin(span/2))`), but a thumb — and the
//     auditor — get the axis-aligned BOUNDING BOX, and a sector whose span hugs an axis has a box only
//     `r·sin(span)` thick, not `2r·sin(span/2)`;
//   · it was calibrated against an assumed 343 px figure (a hard-coded px width — exactly the fault
//     notes/LAYOUT-ROOT.md names), and the app actually hosts the figure from 238 px to 650 px, so the
//     same viewBox geometry landed anywhere from 33.8 px to 67.5 px of hit box.
// HIT_REF_W is the narrowest the app EVER DRAWS a figure, measured in every host, both engines and all
// 16 audit widths by `node qa/fix-b3-wedges.mjs`. Note DRAWN, not the element box: `.card-figure .fig`
// carries a max-height and an <svg> letterboxes its viewBox, so at 320×568 a 238 × 150 element paints
// the 400 × 260 viewBox at 230.8 px wide, centred — the scale is min(w, h·400/260), never w alone.
// getBoundingClientRect() on an SVG shape ignores stroke in both engines, so the region has to be big
// in the path data itself — a transparent pad would grow the target and leave the auditor blind to it.
const HIT_MIN_PX = 44;         // COMPOSED S5: "wedge hit areas ≥ 44 px"
const HIT_PAD_PX = 2;          // headroom: the auditor fails under 43.5 and the engines disagree by ≈ 0.5 px
const HIT_REF_W = 230;         // px — the narrowest figure the app draws (qa/fix-b3-wedges.mjs re-checks it)
const HIT_MIN = ((HIT_MIN_PX + HIT_PAD_PX) * VIEW.w) / HIT_REF_W;   // 80 viewBox units
const HIT_RING = 24;           // a composite ring pushed off an enlarged atomic keeps this much depth
const HIT_SPILL = 24;          // how far past the viewBox an atomic wedge may reach when the box is too tight
const HIT_STEP = 4, HIT_TRIES = 48;   // how a ring grows when its box is still short
const CHIP_TEXT = 'Not to scale';
const RUN_ON = 34;             // fix5:gen — an arrowed poly chain runs this far past its end point to the arrowhead

const R = (d) => (d * Math.PI) / 180;
const dirOf = (deg) => [Math.cos(R(deg)), -Math.sin(R(deg))];      // screen y points down
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------------------------------------
// text metrics (no DOM): a mono expression is 0.62 em per glyph — spaces, superscripts and minus
// signs included (JetBrains Mono / Menlo / SF Mono advance 0.60–0.61 em); the UI font a little narrower

function textWidth(text, fs, mono) {
  let w = 0;
  for (const ch of String(text)) {
    if (/\p{M}/u.test(ch)) continue;                        // combining marks take no advance
    if (mono) w += 0.62;
    else if (ch === ' ') w += 0.3;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else w += 0.56;
  }
  return w * fs;
}
const boxOf = (x, y, w, h) => ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
const inView = (b) => b.x0 >= PAD && b.y0 >= PAD && b.x1 <= VIEW.w - PAD && b.y1 <= VIEW.h - PAD;
function clampBox(x, y, w, h) {
  const hx = w / 2, hy = h / 2;
  return [Math.min(Math.max(x, PAD + hx), VIEW.w - PAD - hx), Math.min(Math.max(y, PAD + hy), VIEW.h - PAD - hy)];
}
/** Liang–Barsky: does segment p→q cross the rectangle (grown by `grow`)? */
function segHitsBox(p, q, b, grow = 2) {
  const x0 = b.x0 - grow, y0 = b.y0 - grow, x1 = b.x1 + grow, y1 = b.y1 + grow;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  const clip = (den, num) => {
    if (den === 0) return num >= 0;                 // parallel to this edge: inside iff on the inner side
    const t = num / den;
    if (den < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, p[0] - x0) && clip(dx, x1 - p[0]) && clip(-dy, p[1] - y0) && clip(dy, y1 - p[1]);
}
const boxesOverlap = (a, b, gap = 2) => !(a.x1 + gap < b.x0 || b.x1 + gap < a.x0 || a.y1 + gap < b.y0 || b.y1 + gap < a.y0);
const boxToPoint = (b, p) => Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1));

// ------------------------------------------------------------------------------------------------
// geometry helpers

function sectorPath(c, r, start, span) {
  const [x0, y0] = pt(c, r, start), [x1, y1] = pt(c, r, start + span);
  return `M${f1(c[0])},${f1(c[1])} L${f1(x0)},${f1(y0)} A${r},${r} 0 ${span > 180 ? 1 : 0} 0 ${f1(x1)},${f1(y1)} Z`;
}
function bandPath(c, r0, r1, start, span) {
  const [ax, ay] = pt(c, r1, start), [bx, by] = pt(c, r1, start + span);
  const [cx, cy] = pt(c, r0, start + span), [dx, dy] = pt(c, r0, start);
  const L = span > 180 ? 1 : 0;
  return `M${f1(ax)},${f1(ay)} A${r1},${r1} 0 ${L} 0 ${f1(bx)},${f1(by)} L${f1(cx)},${f1(cy)} A${r0},${r0} 0 ${L} 1 ${f1(dx)},${f1(dy)} Z`;
}
function arcPath(c, r, start, span) {
  const [x0, y0] = pt(c, r, start), [x1, y1] = pt(c, r, start + span);
  return `M${f1(x0)},${f1(y0)} A${r},${r} 0 ${span > 180 ? 1 : 0} 0 ${f1(x1)},${f1(y1)}`;
}
function pt(c, r, deg) { const [ux, uy] = dirOf(deg); return [c[0] + r * ux, c[1] + r * uy]; }

// ---- wedge hit geometry (fix:B3) ----------------------------------------------------------------
// A wedge's hit region is a union of annular sectors sharing one outer radius; its bounding box is the
// union of theirs. Boxes are exact: the extremes of an arc are its two ends plus whichever axis
// directions it sweeps through, and a sector (r0 = 0) also owns the vertex.

/** Bounding box of the annular sector (c, r0..r1) over [start, start+span]. r0 = 0 → a full sector. */
function ringBox(c, r0, r1, start, span) {
  const xs = [], ys = [];
  const push = (r, deg) => { const [x, y] = pt(c, r, deg); xs.push(x); ys.push(y); };
  for (const r of [r0, r1]) { push(r, start); push(r, start + span); }
  for (const k of [0, 90, 180, 270]) if (norm(k - start) < span) push(r1, k);
  if (r0 === 0) { xs.push(c[0]); ys.push(c[1]); }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
const boxUnion = (a, b) => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b);
const boxFits = (b) => b && b.x1 - b.x0 >= HIT_MIN - 1e-6 && b.y1 - b.y0 >= HIT_MIN - 1e-6;
const partsBox = (c, parts) => parts.reduce((b, p) => boxUnion(b, ringBox(c, p.r0, p.r1, p.start, p.span)), null);

/**
 * The largest radius at which sector(c, r, start, span) still lies inside the viewBox grown by
 * HIT_SPILL — so an atomic wedge grows into the figure's OWN box and can never reach out across the
 * card the way the drawn rings do (a level-1 band on F1 already stands 41 units above the viewBox).
 * The HIT_SPILL of slack is the lesser evil for the handful of generated fans whose vertex sits close
 * to an edge: a target 1 px under the floor is a defect, 14 px of invisible overhang is not.
 */
function sectorRoom(c, start, span) {
  const u = ringBox([0, 0], 0, 1, start, span);
  const lim = [];
  if (u.x1 > 0) lim.push((VIEW.w + HIT_SPILL - c[0]) / u.x1);
  if (u.x0 < 0) lim.push((-HIT_SPILL - c[0]) / u.x0);
  if (u.y1 > 0) lim.push((VIEW.h + HIT_SPILL - c[1]) / u.y1);
  if (u.y0 < 0) lim.push((-HIT_SPILL - c[1]) / u.y0);
  return lim.length ? Math.max(0, Math.min(...lim)) : Infinity;
}

/**
 * The hit region for one angle: `{ parts, outer, box, d }`.
 *
 * Level 0 (atomic) is a sector whose radius is the smallest that clears HIT_MIN in BOTH directions —
 * capped by the room the viewBox has for it, and never smaller than the drawn wedge (the highlight
 * must never spill past its own target).
 *
 * A composite is the ring outside everything more specific than it. Because atomic radii now differ
 * per wedge, that inner boundary is a STAIRCASE — one sub-band per angular run — instead of one
 * circle, which is what keeps the rings disjoint without pushing every ring out to the widest of them.
 * The ring's outer radius starts at the drawn one and grows only while its box is short.
 */
function hitRegion(c, a, rFill, solved) {
  if (a.level === 0) {
    const room = sectorRoom(c, a.start, a.span);
    const u = ringBox([0, 0], 0, 1, a.start, a.span);
    const need = HIT_MIN / Math.min(u.x1 - u.x0, u.y1 - u.y0);
    const r = Math.max(rFill, Math.min(need, room));
    const parts = [{ r0: 0, r1: r, start: a.start, span: a.span }];
    return { parts, outer: r, box: partsBox(c, parts), d: sectorPath(c, r, a.start, a.span) };
  }
  const lower = solved.filter(s => s.level < a.level);
  const cuts = new Set([0, a.span]);
  for (const s of lower) for (const t of [s.start, s.start + s.span]) {
    const d = norm(t - a.start);
    if (d > 1e-6 && d < a.span - 1e-6) cuts.add(d);
  }
  const ks = [...cuts].sort((x, y) => x - y);
  const innerAt = (mid) => lower.reduce((r, s) => (norm(mid - s.start) <= s.span + 1e-6 ? Math.max(r, s.outer) : r), 0);
  const inners = [];
  for (let i = 0; i + 1 < ks.length; i++) inners.push(innerAt(a.start + (ks[i] + ks[i + 1]) / 2));
  const build = (outer) => {
    const parts = [];
    for (let i = 0; i + 1 < ks.length; i++) {
      if (inners[i] + 1e-6 >= outer) continue;                       // swallowed by a more specific wedge
      parts.push({ r0: inners[i], r1: outer, start: a.start + ks[i], span: ks[i + 1] - ks[i] });
    }
    return parts;
  };
  let outer = Math.max(rFill, Math.max(0, ...inners) + HIT_RING);
  let parts = build(outer);
  for (let i = 0; i < HIT_TRIES && !boxFits(partsBox(c, parts)); i++) { outer += HIT_STEP; parts = build(outer); }
  const d = parts.map(p => bandPath(c, p.r0, p.r1, p.start, p.span)).join(' ');
  return { parts, outer, box: partsBox(c, parts), d };
}

/** Largest angular gap between consecutive rays → the direction with the most room (vertex label). */
function freestDirection(degs) {
  const s = [...degs].map(norm).sort((a, b) => a - b);
  let best = 0, bestGap = -1;
  for (let i = 0; i < s.length; i++) {
    const a = s[i], b = i + 1 < s.length ? s[i + 1] : s[0] + 360;
    if (b - a > bestGap) { bestGap = b - a; best = (a + b) / 2; }
  }
  return norm(best);
}

// ------------------------------------------------------------------------------------------------
// layout

/**
 * Every drawn position for a resolved model. Fan → { kind, center, rays:{n:{deg, dir, tip, dot, label}},
 * strokes:[…], marks:[…], arcs:[…], exprLabels:[…], wedges:[…], pointLabels:[…], vertexLabel }.
 * Poly → { kind, points, strokes, ticks, segLabels, pointLabels, wedges (per-vertex fans), … }.
 */
export function layout(model, opts = {}) {
  return model.kind === 'poly' ? layoutPoly(model, opts) : layoutFan(model, opts);
}

function layoutFan(model, opts) {
  const c = model.center;
  const drawDots = model.dots === true || Array.isArray(model.dots);
  const dotsFor = Array.isArray(model.dots) ? new Set(model.dots) : null;
  const arrows = model.arrows !== false;
  const rays = {};
  for (const r of model.rays) {
    const deg = norm(r.deg), dir = dirOf(deg);
    // clamp the drawn length so the arrow tip and its letter stay inside the viewBox
    let len = r.len ?? 150;
    const room = LABEL_GAP + 10;
    const lim = (d, lo, hi, cv) => (d > 1e-9 ? (hi - cv) / d : d < -1e-9 ? (lo - cv) / d : Infinity);
    len = Math.min(len, lim(dir[0], PAD + room, VIEW.w - PAD - room, c[0]), lim(dir[1], PAD + room, VIEW.h - PAD - room, c[1]));
    const tip = [c[0] + len * dir[0], c[1] + len * dir[1]];
    const hasDot = drawDots && (!dotsFor || dotsFor.has(r.n));
    const dot = hasDot ? [c[0] + (len - DOT_INSET) * dir[0], c[1] + (len - DOT_INSET) * dir[1]] : null;
    rays[r.n] = { n: r.n, deg, dir, len, tip, dot, names: r.names ?? [r.n] };
  }
  // strokes: each line once (tip to tip), every other ray from the vertex
  const inLine = new Set();
  const strokes = [];
  for (const [x, y] of model.lines) {
    const rx = rays[rayByName(model, x)?.n], ry = rays[rayByName(model, y)?.n];
    if (!rx || !ry) continue;
    inLine.add(rx.n); inLine.add(ry.n);
    strokes.push({ kind: 'line', from: rx.tip, to: ry.tip, names: [rx.n, ry.n], arrows: arrows ? 'both' : 'none' });
  }
  for (const r of Object.values(rays)) if (!inLine.has(r.n)) strokes.push({ kind: 'ray', from: c, to: r.tip, names: [r.n], arrows: arrows ? 'end' : 'none' });
  const raySegs = Object.values(rays).map(r => [c, r.tip]);

  // right-angle marks
  const marks = model.rightMarks.map(([x, y]) => {
    const u = rays[rayByName(model, x)?.n]?.dir, v = rays[rayByName(model, y)?.n]?.dir;
    if (!u || !v) return null;
    const s = 10;
    return { names: [x, y], path: `M${f1(c[0] + s * u[0])},${f1(c[1] + s * u[1])} L${f1(c[0] + s * (u[0] + v[0]))},${f1(c[1] + s * (u[1] + v[1]))} L${f1(c[0] + s * v[0])},${f1(c[1] + s * v[1])}` };
  }).filter(Boolean);

  // arcs: decorative ones + one per labelled angle; nested radius 22 + 10k
  const all = angles(model);
  const arcAngles = new Map();
  for (const [x, y] of model.arcs) { const a = findAngle(model, x, y); if (a && !a.straight) arcAngles.set(a.key, a); }
  const exprLabels = [];
  for (const l of model.labels) {
    if (!l.angle) continue;
    const [x, v, y] = l.angle.length === 3 ? l.angle : [l.angle[0], model.vertex, l.angle[1]];
    const a = findAngle(model, x, y, v);
    if (!a || a.straight) continue;
    arcAngles.set(a.key, a);
    exprLabels.push({ angle: a, text: String(l.text) });
  }
  const arcs = [];
  const overlapsArc = (a, b) => {                       // angular intervals intersect, or touch at a shared ray
    const s0 = a.start, e0 = a.start + a.span, s1 = b.start, e1 = b.start + b.span;
    const inside = (t, s, e) => { const d = norm(t - s); return d > 1e-6 && d < (e - s) - 1e-6; };
    const touch = (t, u) => Math.abs(norm(t - u)) < 1e-6 || Math.abs(norm(t - u) - 360) < 1e-6;
    return inside(s1, s0, e0) || inside(e1, s0, e0) || inside(s0, s1, e1) || inside(e0, s1, e1)
      || (touch(s0, s1) && Math.abs(a.span - b.span) < 1e-6)
      || touch(e0, s1) || touch(e1, s0);               // two halves of a bisected angle stay visibly two arcs
  };
  for (const a of [...arcAngles.values()].sort((p, q) => p.span - q.span)) {
    let k = 0;
    for (const placed of arcs) if (overlapsArc(a, placed.angle)) k = Math.max(k, placed.k + 1);
    const r = 22 + 10 * k;
    arcs.push({ angle: a, k, r, center: c, path: arcPath(c, r, a.start, a.span) });
  }
  const arcR = (a) => arcs.find(p => p.angle.key === a.key)?.r ?? 22;

  // point letters (outward from the dot/tip, or the figure's own offset)
  const pointLabels = [];
  const offP = model.labelOffsets.point ?? {};
  const placedBoxes = [];               // expression labels + the vertex letter (ray letters may still flip)
  const letterBoxes = () => pointLabels.filter(p => !p.vertex).map(p => p.box);
  const placeLetter = (r, off) => {
    const anchor = r.dot ?? r.tip;
    let p = off ? [anchor[0] + off[0], anchor[1] + off[1]] : [anchor[0] + LABEL_GAP * r.dir[0], anchor[1] + LABEL_GAP * r.dir[1]];
    const w = textWidth(r.n, PT_FS, false), h = PT_FS * 1.15;
    p = clampBox(p[0], p[1], w, h);
    return { n: r.n, x: p[0], y: p[1], box: boxOf(p[0], p[1], w, h), anchor, off: off ?? [LABEL_GAP * r.dir[0], LABEL_GAP * r.dir[1]], ray: r };
  };
  if (!model.hideLetters) {
    for (const r of Object.values(rays)) pointLabels.push(placeLetter(r, offP[r.n]));
    // vertex letter: the freest direction unless the figure says where
    const vd = dirOf(freestDirection(Object.values(rays).map(r => r.deg)));
    let vp = offP[model.vertex] ? [c[0] + offP[model.vertex][0], c[1] + offP[model.vertex][1]] : [c[0] + LABEL_GAP * vd[0], c[1] + LABEL_GAP * vd[1]];
    const vw = textWidth(model.vertex, PT_FS, false), vh = PT_FS * 1.15;
    vp = clampBox(vp[0], vp[1], vw, vh);
    pointLabels.push({ n: model.vertex, x: vp[0], y: vp[1], box: boxOf(vp[0], vp[1], vw, vh), anchor: c, vertex: true });
    placedBoxes.push(pointLabels[pointLabels.length - 1].box);
  }

  // expression labels: on the bisector at arcR + 16, nudged outward until the box clears every ray;
  // a wide label in a narrow wedge may also slide off the bisector (±3 steps of span/10) so it hugs
  // one side instead of running out of the viewBox. Ray letters that collide with the natural spot
  // flip to the other side of their ray (the sheets do the same: A sits above AD on #10).
  const offA = model.labelOffsets.angle ?? {};
  const wedgeClear = (box, a) => !raySegs.some(([p, q]) => segHitsBox(p, q, box, RAY_MARGIN)) && boxToPoint(box, c) >= arcR(a) + ARC_MARGIN;
  const K_PENALTY = 16;                 // one angular step off the bisector costs as much as 16 units of radius
  const search = (a, w, h, blockers) => {
    const mid = a.start + a.span / 2;
    const r0 = arcR(a) + 16;
    let best = null;                    // lowest score = r + K_PENALTY·|k|
    for (const k of [0, -1, 1, -2, 2, -3, 3]) {
      const d = dirOf(mid + (k * a.span) / 10);
      for (let r = r0, i = 0; i < 48; r += 4, i++) {
        const score = r + K_PENALTY * Math.abs(k);
        if (best && score >= best.score) break;
        const x = c[0] + r * d[0], y = c[1] + r * d[1];
        const box = boxOf(x, y, w, h);
        if (!inView(box) || !wedgeClear(box, a) || blockers.some(b => boxesOverlap(box, b, LABEL_GAP_BOX))) continue;
        best = { x, y, box, r, k, nudged: i, ok: true, score };
        break;
      }
    }
    if (best) return best;
    // nothing fits: the nearest bisector spot that still clears the rays and stays in view, else arc + 16
    for (let r = r0, i = 0; i < 48; r += 4, i++) {
      const d = dirOf(mid); const x = c[0] + r * d[0], y = c[1] + r * d[1]; const box = boxOf(x, y, w, h);
      if (wedgeClear(box, a) && inView(box)) return { x, y, box, r, k: 0, nudged: i, ok: false };
    }
    const d = dirOf(mid); const x = c[0] + r0 * d[0], y = c[1] + r0 * d[1];
    return { x, y, box: boxOf(x, y, w, h), r: r0, k: 0, nudged: 0, ok: false };
  };
  for (const L of exprLabels) {
    const a = L.angle;
    const w = textWidth(L.text, EXPR_FS, true), h = EXPR_FS * 1.3;
    let res = search(a, w, h, [...placedBoxes, ...letterBoxes()]);
    if (!res.ok) {
      // try with ray letters out of the way: flip each colliding letter across its ray, keep flips that help
      const free = search(a, w, h, placedBoxes);
      if (free.ok) {
        for (const p of pointLabels) {
          if (p.vertex || !boxesOverlap(free.box, p.box, LABEL_GAP_BOX)) continue;
          const d = p.ray.dir, o = p.off, par = o[0] * d[0] + o[1] * d[1];
          const flipped = [2 * par * d[0] - o[0], 2 * par * d[1] - o[1]];
          const alt = placeLetter(p.ray, flipped);
          const altHits = boxesOverlap(alt.box, free.box, LABEL_GAP_BOX) || raySegs.some(([q1, q2]) => segHitsBox(q1, q2, alt.box, 2)) || pointLabels.some(q => q !== p && boxesOverlap(alt.box, q.box, 2));
          if (!altHits) Object.assign(p, alt, { flipped: true });
        }
        res = search(a, w, h, [...placedBoxes, ...letterBoxes()]);
      }
    }
    const o = offA[a.id] ?? offA[`${a.x}-${a.y}`] ?? [0, 0];
    const [x, y] = clampBox(res.x + o[0], res.y + o[1], w, h);
    const box = boxOf(x, y, w, h);
    L.x = x; L.y = y; L.box = box; L.r = res.r; L.k = res.k; L.nudged = res.nudged; L.fits = res.ok;
    placedBoxes.push(box);
  }

  // wedges. DRAWN (unchanged): atomic → sector [0, R1]; level k → sector out to R1 + k·BAND.
  // HIT (fix:B3): solved per wedge by hitRegion() so every one clears 44 px at HIT_REF_W, in ascending
  // level order so a composite ring knows the boundary of everything more specific beneath it.
  const wedgesOn = opts.wedges ?? !model.poly;
  const wedges = [];
  if (wedgesOn) {
    const atomic = all.filter(a => a.atomic);
    const R1 = Math.max(WEDGE_MIN, ...atomic.map(a => Math.min(WEDGE_MAX, MIN_CHORD / (2 * Math.sin(R(a.span / 2))))));
    const solved = [];
    for (const a of [...all].sort((p, q) => p.level - q.level)) {
      const r0 = a.level === 0 ? 0 : R1 + (a.level - 1) * BAND;
      const r1 = a.level === 0 ? R1 : R1 + a.level * BAND;
      const hit = hitRegion(c, a, r1, solved);
      solved.push({ level: a.level, start: a.start, span: a.span, outer: hit.outer });
      wedges.push({
        angle: a, r0, r1, center: c,
        hit: hit.d, hitParts: hit.parts, hitOuter: hit.outer, hitBox: hit.box,
        fill: sectorPath(c, r1, a.start, a.span),
        ariaLabel: a.label ? a.label : `angle ${a.name}`,
      });
    }
    wedges.sort((p, q) => all.indexOf(p.angle) - all.indexOf(q.angle));   // emit in model order (tab order)
  }

  const chip = model.notToScale ? chipLayout() : null;
  return { kind: 'fan', center: c, rays, strokes, marks, arcs, exprLabels, pointLabels, wedges, chip, arrows, angles: all, aria: describe(model) };
}

function layoutPoly(model, opts) {
  const pts = model.points;
  const names = Object.keys(pts);
  const cen = [names.reduce((s, n) => s + pts[n][0], 0) / names.length, names.reduce((s, n) => s + pts[n][1], 0) / names.length];
  const unit = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  // fix5:gen — optional `arrows` (parallel to segments): 'end' = ray from the first point through the last,
  // 'both' = line; the stroke runs RUN_ON past each arrowed end so the point's dot sits before the arrowhead.
  // Without `arrows` every chain is the plain segment it always was.
  const strokes = model.segments.map((ch, i) => {
    const a = Array.isArray(model.arrows) ? (model.arrows[i] ?? 'none') : 'none';
    const P = pts[ch[0]], Q = pts[ch[ch.length - 1]];
    if (a !== 'end' && a !== 'both') return { kind: 'seg', from: P, to: Q, names: [ch[0], ch[ch.length - 1]], chain: ch, arrows: 'none' };
    const u = unit(P, Q);
    const to = [Q[0] + RUN_ON * u[0], Q[1] + RUN_ON * u[1]];
    const from = a === 'both' ? [P[0] - RUN_ON * u[0], P[1] - RUN_ON * u[1]] : P;
    return { kind: a === 'both' ? 'line' : 'ray', from, to, names: [ch[0], ch[ch.length - 1]], chain: ch, arrows: a };
  });
  const segLines = [];
  for (const ch of model.segments) for (let i = 0; i + 1 < ch.length; i++) segLines.push([pts[ch[i]], pts[ch[i + 1]]]);
  const outline = Array.isArray(model.outline) ? model.outline.map(p => [p[0], p[1]]) : null;   // fix5:gen
  const outwardNormal = (p, q) => { const u = unit(p, q); const n = [-u[1], u[0]]; const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return ((m[0] - cen[0]) * n[0] + (m[1] - cen[1]) * n[1]) >= 0 ? n : [-n[0], -n[1]]; };

  const ticks = [];
  model.ticks.forEach((group, g) => {
    for (const [p, q] of group) {
      const P = pts[p], Q = pts[q];
      const u = unit(P, Q), n = [-u[1], u[0]], m = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
      const count = g + 1;
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 4.5;
        ticks.push({ group: g, seg: [p, q], x1: m[0] + off * u[0] - 4.5 * n[0], y1: m[1] + off * u[1] - 4.5 * n[1], x2: m[0] + off * u[0] + 4.5 * n[0], y2: m[1] + off * u[1] + 4.5 * n[1] });
      }
    }
  });

  const placedBoxes = [];
  const pointLabels = [];
  const offP = model.labelOffsets.point ?? {};
  // fix5:gen: optional `letterSize` (viewBox units) — sparse mini-figures print bigger letters so they stay
  // legible when a short phone caps the figure's height; the gap to the dot grows with the letter
  const ptFs = Number.isFinite(model.letterSize) ? model.letterSize : PT_FS;
  const ptGap = LABEL_GAP * (ptFs / PT_FS);
  if (!model.hideLetters) {
    for (const n of names) {
      const p = pts[n];
      const dirDeg = model.labelDirs?.[n];                              // fix5:gen: an explicit letter direction
      const d = Number.isFinite(dirDeg) ? dirOf(dirDeg) : unit(cen, p);
      let x = p[0] + ptGap * d[0], y = p[1] + ptGap * d[1];
      if (offP[n]) { x += offP[n][0]; y += offP[n][1]; }
      const w = textWidth(n, ptFs, false), h = ptFs * 1.15;
      [x, y] = clampBox(x, y, w, h);
      const box = boxOf(x, y, w, h);
      pointLabels.push({ n, x, y, box, anchor: p });
      placedBoxes.push(box);
    }
  }

  const segLabels = [];
  const offS = model.labelOffsets.seg ?? {};
  for (const l of model.labels) {
    if (!l.seg) continue;
    const P = pts[l.seg[0]], Q = pts[l.seg[1]];
    if (!P || !Q) continue;
    const n = outwardNormal(P, Q);
    const w = textWidth(l.text, EXPR_FS, true), h = EXPR_FS * 1.3;
    // offset so the text box (projected onto the normal) clears the segment, plus a 5 px margin
    let off = (w / 2) * Math.abs(n[0]) + (h / 2) * Math.abs(n[1]) + 5;
    const m = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
    let x, y, box;
    for (let i = 0; i < 20; i++) {
      x = m[0] + off * n[0]; y = m[1] + off * n[1];
      box = boxOf(x, y, w, h);
      if (!segLines.some(([p, q]) => segHitsBox(p, q, box, 4)) && !placedBoxes.some(b => boxesOverlap(box, b, LABEL_GAP_BOX))) break;
      off += 3;
    }
    const o = offS[[l.seg[0], l.seg[1]].sort().join('-')] ?? [0, 0];
    [x, y] = clampBox(x + o[0], y + o[1], w, h);
    box = boxOf(x, y, w, h);
    segLabels.push({ seg: l.seg, text: String(l.text), x, y, box });
    placedBoxes.push(box);
  }

  const dotsFor = model.dots === true ? new Set(names) : Array.isArray(model.dots) ? new Set(model.dots) : new Set();
  const dots = names.filter(n => dotsFor.has(n)).map(n => ({ n, x: pts[n][0], y: pts[n][1] }));

  // per-vertex fans give arcs/expr labels/wedges for angle labels on polys
  const fans = polyFans(model);
  const wedges = [], arcs = [], exprLabels = [];
  const wedgesOn = opts.wedges ?? false;
  for (const fan of fans) {
    const sub = { ...fan, labels: model.labels.filter(l => l.angle && l.angle.length === 3 && l.angle[1] === fan.vertex), labelOffsets: model.labelOffsets, hideLetters: true, arcs: [], notToScale: false, dots: false, arrows: false };
    sub.rays = sub.rays.map(r => ({ ...r, len: 40 }));
    const lf = layoutFan(sub, { wedges: wedgesOn });
    arcs.push(...lf.arcs); exprLabels.push(...lf.exprLabels); wedges.push(...lf.wedges);
  }
  const chip = model.notToScale ? chipLayout() : null;
  return { kind: 'poly', points: pts, centroid: cen, strokes, ticks, dots, pointLabels, segLabels, arcs, exprLabels, wedges, chip, angles: angles(model), aria: describe(model), ...(outline ? { outline } : {}) };
}

function chipLayout() {
  const w = textWidth(CHIP_TEXT, 11, false) + 14, h = 18;
  return { x: VIEW.w - PAD - w, y: PAD, w, h, text: CHIP_TEXT };
}

// ------------------------------------------------------------------------------------------------
// SVG emission

function emitStroke(s, markerId) {
  const cls = s.kind === 'line' ? 'fig-line' : s.kind === 'ray' ? 'fig-ray' : 'fig-seg';
  const ms = s.arrows === 'both' ? ` marker-start="url(#${markerId})" marker-end="url(#${markerId})"` : s.arrows === 'end' ? ` marker-end="url(#${markerId})"` : '';
  return `<line class="${cls}" data-names="${s.names.join('')}" x1="${f1(s.from[0])}" y1="${f1(s.from[1])}" x2="${f1(s.to[0])}" y2="${f1(s.to[1])}" pathLength="1"${ms}/>`;
}

/** SVG string for a resolved model (see render() for the memoised card-facing entry). */
export function renderModel(model, opts = {}) {
  const L = layout(model, opts);
  const uid = `fig-${(model.figId ?? model.id ?? 'x')}`.replace(/[^A-Za-z0-9_-]/g, '');
  const markerId = `${uid}-arrow`;
  const out = [];
  out.push(`<svg class="fig fig-${model.kind}" viewBox="0 0 ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc('Figure: ' + L.aria)}" data-figure="${esc(model.figId ?? model.id ?? '')}">`);
  out.push(`<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="${ARROW}" markerHeight="${ARROW}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`);

  if (L.outline) out.push(`<g class="fig-planes"><path class="fig-plane" d="M${L.outline.map(p => `${f1(p[0])},${f1(p[1])}`).join(' L')} Z"/></g>`);   // fix5:gen
  out.push('<g class="fig-strokes">');
  for (const s of L.strokes) out.push(emitStroke(s, markerId));
  out.push('</g>');

  if (L.marks?.length) {
    out.push('<g class="fig-marks">');
    for (const m of L.marks) out.push(`<path class="fig-mark" data-names="${m.names.join('')}" d="${m.path}"/>`);
    out.push('</g>');
  }
  if (L.ticks?.length) {
    out.push('<g class="fig-ticks">');
    for (const t of L.ticks) out.push(`<line class="fig-tick" data-seg="${t.seg.join('')}" x1="${f1(t.x1)}" y1="${f1(t.y1)}" x2="${f1(t.x2)}" y2="${f1(t.y2)}"/>`);
    out.push('</g>');
  }
  if (L.arcs.length) {
    out.push('<g class="fig-arcs">');
    for (const a of L.arcs) out.push(`<path class="fig-arc" data-angle="${a.angle.id}" data-name="${a.angle.name}" d="${a.path}"/>`);
    out.push('</g>');
  }

  // wedges first so letters and dots stay on top for pointer hits. The transparent hit <path> is the
  // button (role/tabindex/aria-label); the fill path after it paints the state and never takes hits.
  if (L.wedges.length) {
    out.push('<g class="fig-wedges">');
    for (const w of L.wedges) {
      const a = w.angle;
      const data = `data-angle="${a.id}" data-name="${a.name}"${a.alias ? ` data-alias="${a.alias}"` : ''} data-deg="${f1(a.deg)}" data-level="${a.level}"`;
      out.push(`<g class="fig-wedge" ${data}>` +
        `<path class="fig-wedge-hit" role="button" tabindex="0" aria-label="${esc(w.ariaLabel)}" aria-pressed="false" ${data} d="${w.hit}"/>` +
        `<path class="fig-wedge-fill" d="${w.fill}"/></g>`);
    }
    out.push('</g>');
  }

  out.push('<g class="fig-points">');
  if (L.kind === 'fan') {
    // the vertex dot follows `dots` (D5 / AH / D7 print none); the 12 px hit circle is always there for letter taps
    if (model.dots !== false) out.push(`<circle class="fig-pt-dot" data-point="${model.vertex}" cx="${f1(L.center[0])}" cy="${f1(L.center[1])}" r="3.5"/>`);
    out.push(`<circle class="fig-pt-hit" data-point="${model.vertex}" cx="${f1(L.center[0])}" cy="${f1(L.center[1])}" r="12"/>`);
    for (const r of Object.values(L.rays)) {
      if (r.dot) out.push(`<circle class="fig-pt-dot" data-point="${r.n}" cx="${f1(r.dot[0])}" cy="${f1(r.dot[1])}" r="3.5"/>`);
      const h = r.dot ?? r.tip;
      out.push(`<circle class="fig-pt-hit" data-point="${r.n}" cx="${f1(h[0])}" cy="${f1(h[1])}" r="12"/>`);
    }
  } else {
    for (const d of L.dots) out.push(`<circle class="fig-pt-dot" data-point="${d.n}" cx="${f1(d.x)}" cy="${f1(d.y)}" r="3.5"/>`);
    for (const [n, p] of Object.entries(L.points)) out.push(`<circle class="fig-pt-hit" data-point="${n}" cx="${f1(p[0])}" cy="${f1(p[1])}" r="12"/>`);
  }
  out.push('</g>');

  out.push('<g class="fig-labels">');
  const ptStyle = L.kind === 'poly' && Number.isFinite(model.letterSize) ? ` style="font-size:${f1(model.letterSize)}px"` : '';   // fix5:gen
  for (const p of L.pointLabels) out.push(`<text class="fig-label fig-pt" data-point="${p.n}" x="${f1(p.x)}" y="${f1(p.y)}"${ptStyle}>${esc(p.n)}</text>`);
  for (const s of L.segLabels ?? []) out.push(`<text class="fig-label fig-expr" data-seg="${s.seg.join('')}" x="${f1(s.x)}" y="${f1(s.y)}">${esc(s.text)}</text>`);
  for (const e of L.exprLabels) out.push(`<text class="fig-label fig-expr" data-angle="${e.angle.id}" data-name="${e.angle.name}" x="${f1(e.x)}" y="${f1(e.y)}">${esc(e.text)}</text>`);
  out.push('</g>');

  if (L.chip) out.push(`<g class="fig-chip" aria-label="${CHIP_TEXT}"><rect x="${f1(L.chip.x)}" y="${f1(L.chip.y)}" width="${f1(L.chip.w)}" height="${L.chip.h}" rx="4"/><text x="${f1(L.chip.x + L.chip.w / 2)}" y="${f1(L.chip.y + L.chip.h / 2 + 0.5)}">${CHIP_TEXT}</text></g>`);
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------------------------------------------
// memoised entry

const cache = new Map();
const CACHE_MAX = 200;
function memoKey(fig, opts) {
  return JSON.stringify([fig.id, opts.rename ?? null, opts.labels ?? null, opts.notToScale ?? null, opts.rotate ?? 0, !!opts.mirror, opts.wedges ?? null, opts.hideLetters ?? null, opts.ticks ?? null, opts.arcs ?? null, opts.labelOffsets ?? null]);
}

/**
 * Figure data (data/figures.js entry) + card figure opts → SVG string, memoised by
 * (id, rename, labels, notToScale, rotate, mirror). opts.wedges forces wedges on/off
 * (default: on for fans, off for polys). Returns the same string for the same inputs.
 */
export function render(fig, opts = {}) {
  const key = memoKey(fig, opts);
  const hit = cache.get(key);
  if (hit) return hit;
  const model = resolve(fig, opts);
  if (opts.hideLetters != null) model.hideLetters = !!opts.hideLetters;
  const svg = renderModel(model, opts);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, svg);
  return svg;
}
export function clearCache() { cache.clear(); }

/** Browser: render() as a live <svg> element. */
export function element(fig, opts = {}) {
  if (typeof document === 'undefined') throw new Error('element() needs a DOM; use render() in Node');
  const host = document.createElement('div');
  host.innerHTML = render(fig, opts);
  return host.firstElementChild;
}

// ------------------------------------------------------------------------------------------------
// wedge states (widget helpers; DOM only)

export const WEDGE_STATES = Object.freeze(['hover', 'selected', 'ok', 'bad', 'linked']);
export const WEDGE_SELECTOR = '.fig-wedge';

/** The wedge <g> for an angle id ('C-D'), name ('CFD'), alias ('UL') or a wedge/button element
 *  (an event target inside a wedge resolves to its group); null when absent. */
export function wedgeEl(root, ref) {
  if (ref && typeof ref === 'object' && ref.closest) return ref.closest(WEDGE_SELECTOR);
  if (!root?.querySelectorAll) return null;
  for (const el of root.querySelectorAll(WEDGE_SELECTOR)) {
    if (el.dataset.angle === ref || el.dataset.name === ref || (el.dataset.alias && el.dataset.alias === ref)) return el;
  }
  return null;
}
/** The focusable button <path role="button"> of a wedge (for focus() / aria); null when absent. */
export function wedgeButton(root, ref) {
  return wedgeEl(root, ref)?.querySelector('.fig-wedge-hit') ?? null;
}
/** Toggle one state class (`is-selected`, …) on a wedge; `selected` also mirrors aria-pressed on the button. */
export function setWedgeState(root, ref, state, on = true) {
  if (!WEDGE_STATES.includes(state)) throw new Error(`unknown wedge state ${state}`);
  const el = wedgeEl(root, ref);
  if (!el) return null;
  el.classList.toggle(`is-${state}`, !!on);
  if (state === 'selected') el.querySelector('.fig-wedge-hit')?.setAttribute('aria-pressed', on ? 'true' : 'false');
  return el;
}
/** Remove the given states (default: all) from every wedge under root. */
export function clearWedgeStates(root, states = WEDGE_STATES) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll(WEDGE_SELECTOR)) {
    for (const s of states) el.classList.remove(`is-${s}`);
    if (states.includes('selected')) el.querySelector('.fig-wedge-hit')?.setAttribute('aria-pressed', 'false');
  }
}

// ------------------------------------------------------------------------------------------------
// layout lint (DOM-free): what the dev page checks in the browser, computable in node --test

/**
 * Layout problems for a resolved model, as human-readable strings ([] when clean): text boxes
 * outside the viewBox inset, a label box crossed by a stroke, two text boxes (or a text box and the
 * chip) overlapping, a wedge whose HIT box is under `minPx` (default 44) CSS px when the SVG is
 * `widthPx` wide. Opts also reach layout() (wedges on/off).
 *
 * fix:B3 — `widthPx` now defaults to HIT_REF_W (238: the narrowest the app ever renders a figure,
 * measured by qa/fix-b3-wedges.mjs), not to a 375 px phone's content width; and BOTH sides of the box
 * have to clear the floor. The old rule passed anything whose longest side reached 44 px and whose
 * area reached 44², which is exactly how a 93 × 41 wedge shipped: a 93 × 41 box is not a 44 px target
 * in the direction your thumb is short. It also measures the hit path the renderer really emits
 * (`w.hitBox`) rather than re-deriving a sector from the drawn radius.
 */
export function lint(model, opts = {}) {
  const L = layout(model, opts);
  const scale = (opts.widthPx ?? HIT_REF_W) / VIEW.w;
  const minPx = opts.minPx ?? HIT_MIN_PX;
  const issues = [];
  const texts = [
    ...L.pointLabels.map(p => ({ text: p.n, box: p.box, kind: 'letter' })),
    ...(L.segLabels ?? []).map(s => ({ text: s.text, box: s.box, kind: 'expr' })),
    ...L.exprLabels.map(e => ({ text: e.text, box: e.box, kind: 'expr' })),
  ];
  for (const t of texts) if (!inView(t.box)) issues.push(`clipped: "${t.text}"`);
  const segs = L.strokes.map(s => [s.from, s.to]);
  if (L.outline) L.outline.forEach((p, i) => segs.push([p, L.outline[(i + 1) % L.outline.length]]));   // fix5:gen: a plane's edges count as strokes
  for (const t of texts) if (segs.some(([p, q]) => segHitsBox(p, q, t.box, 1))) issues.push(`label on a stroke: "${t.text}"`);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    if (boxesOverlap(texts[i].box, texts[j].box, 0)) issues.push(`overlap: "${texts[i].text}" × "${texts[j].text}"`);
  }
  if (L.chip) {
    const cb = { x0: L.chip.x, y0: L.chip.y, x1: L.chip.x + L.chip.w, y1: L.chip.y + L.chip.h };
    for (const t of texts) if (boxesOverlap(t.box, cb, 0)) issues.push(`chip overlaps "${t.text}"`);
  }
  for (const a of L.arcs) {
    // an expression label box must clear its own arc (the text would sit on the curve)
    for (const e of L.exprLabels) if (e.angle.key === a.angle.key && a.center && boxToPoint(e.box, a.center) < a.r - 0.5) issues.push(`label on its arc: "${e.text}"`);
  }
  for (const w of L.wedges) {
    const b = w.hitBox ?? (w.center ? ringBox(w.center, w.r0, w.r1, w.angle.start, w.angle.span) : null);
    if (!b) continue;
    const wpx = (b.x1 - b.x0) * scale, hpx = (b.y1 - b.y0) * scale;
    if (wpx < minPx || hpx < minPx) issues.push(`small wedge: ${w.angle.name} ${wpx.toFixed(0)}×${hpx.toFixed(0)} px`);
  }
  return issues;
}
