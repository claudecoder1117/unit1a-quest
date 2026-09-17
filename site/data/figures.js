// data/figures.js — T04. The five hand-modeled figures (COMPOSED S5 "Figures", S6 figure schema),
// redrawn from the teacher's sheets as described in content/transcript.md "Figures" and
// content/SOURCE.md §1/§2. Coordinates live in the 400 × 260 viewBox. Nothing here is a scan.
//
// Fan rays: `deg` is the direction from the vertex (0° = right, counter-clockwise positive, as on
// the printed sheets); `len` is the distance to the drawn end (the arrow tip). Cards reference a
// figure by id and pass { rename, labels, notToScale } (S6 card schema) to figure/model.js resolve().

/** F1 — Angles Practice warm-up / #10: lines AD and EC cross at F, ray FB straight up.
 *  Warm-up cards use rename {A:'G'} (the printed sheet labels the left point G; the teacher's key
 *  writes A). #10 (ang-10) adds the two expression labels. C at 31° (spec), E opposite at 211°.
 *  The printed right-angle square sits in the upper-left corner, between FB and FA (∠BFA = 90°). */
export const F1 = {
  id: 'F1', kind: 'fan', vertex: 'F', center: [200, 150],
  rays: [
    { n: 'D', deg: 0, len: 170 },
    { n: 'C', deg: 31, len: 178, free: true },
    { n: 'B', deg: 90, len: 122 },
    { n: 'A', deg: 180, len: 170 },
    { n: 'E', deg: 211, len: 156 },
  ],
  lines: [['A', 'D'], ['E', 'C']],
  rightMarks: [['B', 'A']],
  arcs: [],
  dots: true, arrows: true,
  labels: [],
  // point labels as printed: G/A and D below their dots, C above-left, E below-right, B left, F below-right
  labelOffsets: {
    point: { A: [0, 18], D: [0, 18], C: [-14, -13], E: [15, 12], B: [-15, 2], F: [13, 15] },
    angle: { 'B-C': [0, 0], 'A-E': [0, 0], 'C-D': [0, 0], 'D-E': [0, 0] },
  },
};

/** F2 — Angles Practice #4: triangle ACE, B the midpoint of AC, D the midpoint of CE, BD drawn.
 *  Chains encode collinearity (B is between A and C). Ticks show the two pairs of congruent halves.
 *  Default labels are the printed ones (CD carries no printed label — the 19 in the key is derived). */
export const F2 = {
  id: 'F2', kind: 'poly',
  points: { C: [200, 30], A: [100, 225], E: [300, 225], B: [150, 127.5], D: [250, 127.5] },
  segments: [['A', 'B', 'C'], ['C', 'D', 'E'], ['A', 'E'], ['B', 'D']],
  ticks: [[['C', 'B'], ['B', 'A']], [['C', 'D'], ['D', 'E']]],
  dots: ['B', 'D'],
  labels: [
    { seg: ['C', 'B'], text: '3m + 4' },
    { seg: ['B', 'A'], text: 'n − 1' },
    { seg: ['D', 'E'], text: 'm² − 6' },
    { seg: ['A', 'E'], text: '8' },
  ],
  labelOffsets: {
    point: { C: [0, -2], A: [-4, 2], E: [4, 2], B: [-6, 0], D: [6, 0] },
    seg: { 'B-C': [-2, 0], 'A-B': [-2, 0], 'D-E': [2, 0], 'A-E': [0, 0] },
  },
};

/** D5 — study-guide doc #5: rays from B — BC right, BD up (slightly right), BA up-left.
 *  Expression labels sit inside the two halves; no arcs, marks or dots on the print. */
export const D5 = {
  id: 'D5', kind: 'fan', vertex: 'B', center: [160, 210],
  rays: [
    { n: 'C', deg: 0, len: 200 },
    { n: 'D', deg: 78, len: 175 },
    { n: 'A', deg: 160, len: 140 },
  ],
  lines: [], rightMarks: [], arcs: [],
  dots: false, arrows: true,
  labels: [
    { angle: ['A', 'D'], text: '5x + 16' },
    { angle: ['D', 'C'], text: '8x − 23' },
  ],
  labelOffsets: {
    point: { B: [0, 17], C: [-12, -14], D: [16, 12], A: [10, 18] },
    angle: { 'A-D': [-6, -4], 'C-D': [6, 0] },   // the two halves flank BD: a little extra air each side
  },
};

/** D7 — study-guide doc #7: a horizontal line and a line falling from upper-left to lower-right
 *  crossing it at 32°; no point letters printed, so the four angles carry position names
 *  (UL / UR / LR / LL) that cards use as wedge ids. Rays are lettered internally only. */
export const D7 = {
  id: 'D7', kind: 'fan', vertex: 'P', center: [200, 130],
  rays: [
    { n: 'R', deg: 0, len: 170 },
    { n: 'Q', deg: 148, len: 165 },
    { n: 'L', deg: 180, len: 170 },
    { n: 'S', deg: 328, len: 165 },
  ],
  lines: [['R', 'L'], ['Q', 'S']],
  rightMarks: [], arcs: [],
  angleNames: { UL: ['L', 'Q'], UR: ['Q', 'R'], LR: ['R', 'S'], LL: ['S', 'L'] },
  hideLetters: true, dots: false, arrows: false,
  labels: [
    { angle: ['L', 'Q'], text: '3x + y' },
    { angle: ['Q', 'R'], text: '4y + x − 5' },
    { angle: ['R', 'S'], text: '4x + y + 10' },
  ],
  labelOffsets: { angle: { 'L-Q': [0, 0], 'Q-R': [0, 0], 'R-S': [0, 0], 'L-S': [0, 0] } },
};

/** AH — Angles Practice #5: rays from A — AM up (a little left), AH up-right, AC down-right.
 *  The print carries no expression labels (they are in the stem); ang-05 may pass its own. */
export const AH = {
  id: 'AH', kind: 'fan', vertex: 'A', center: [110, 170],
  rays: [
    { n: 'M', deg: 101, len: 135 },
    { n: 'H', deg: 36, len: 205 },
    { n: 'C', deg: 334, len: 135 },
  ],
  lines: [], rightMarks: [], arcs: [],
  dots: false, arrows: true,
  labels: [],
  labelOffsets: {
    point: { A: [-14, 14], M: [-16, 8], H: [14, 12], C: [-15, 12] },
    angle: { 'H-M': [0, 0], 'C-H': [0, 0], 'C-M': [0, 0] },
  },
};

export const figures = Object.freeze({ F1, F2, D5, D7, AH });
export const byId = figures;
export function getFigure(id) { return figures[id] ?? null; }
export default figures;
