// data/source-manifest.js — the literal id checklist of every SOURCE item (COMPOSED S2 coverage table, S8 #6f).
//
// One row per original, written out by hand — never generated from the card files, so the data can be
// checked AGAINST it (tests/coverage.test.mjs, tests/teacher-flag.test.mjs, tests/rarity.test.mjs).
// If an id is missing from data, sits in no module pool, carries the wrong skill or sheet, or has no Mock
// slot, the coverage test names it. Adding a card without a row here fails the same test on purpose.
//
//   { id, skill, sheet, module, src, mock, bonus }
//   skill   the PRIMARY skill the S2 manifest line assigns (`def-* → VOC`, `fact-* → ASN-PLP`, `cls-* → CLASS`,
//           `voc-* → VOC`, `not-* → NOTE`, ang-04 → SEG-ALG, …); the card's `skills[0]` must equal it
//   sheet   the Binder tab (data/sheets.js) the card's `sheet` field must equal
//   module  the module whose Original Set holds the id (data/modules.js `originals`)
//   src     the SOURCE.md locator the card's `src` field must equal (byte-for-byte)
//   mock    the S7 Mock section letters the id is eligible for — A vocab/notation · B figures · C ASN
//           (asn-*, qz-*, fact-*) · D angle algebra · E algebra review (fac-* via FAC1/FAC2, quad-* via
//           QUAD-SOLVE/QUAD-CTX) — null for the Bonus bank, which is never in the Mock
//   bonus   true only for bonus-* (M13): no skill, no XP toward the Packet, never in Mock/plan, no Foil path
//
// Family tiles (fam-*) are generated-only Binder tiles, not cards; they are listed separately so the rarity
// test can assert their Platinum path (S4: 6 Gold Variants across ≥ 2 days) without pretending they are ids.

const r = (id, skill, sheet, module, src, mock) => Object.freeze({ id, skill, sheet, module, src, mock, bonus: false });
const b = (id, src) => Object.freeze({ id, skill: null, sheet: 'BONUS', module: 'M13', src, mock: null, bonus: true });

export const manifest = Object.freeze([
  // ---- §0 the 23 terms (VOC) --------------------------------------------------------------------------
  r('voc-01', 'VOC', 'VOC', 'M1', '§0 term 1 of 23: point', 'A'),
  r('voc-02', 'VOC', 'VOC', 'M1', '§0 term 2 of 23: line', 'A'),
  r('voc-03', 'VOC', 'VOC', 'M1', '§0 term 3 of 23: plane', 'A'),
  r('voc-04', 'VOC', 'VOC', 'M1', '§0 term 4 of 23: collinear', 'A'),
  r('voc-05', 'VOC', 'VOC', 'M1', '§0 term 5 of 23: coplanar', 'A'),
  r('voc-06', 'VOC', 'VOC', 'M1', '§0 term 6 of 23: segment', 'A'),
  r('voc-07', 'VOC', 'VOC', 'M1', '§0 term 7 of 23: ray', 'A'),
  r('voc-08', 'VOC', 'VOC', 'M1', '§0 term 8 of 23: opposite rays', 'A'),
  r('voc-09', 'VOC', 'VOC', 'M1', '§0 term 9 of 23: angle', 'A'),
  r('voc-10', 'VOC', 'VOC', 'M1', '§0 term 10 of 23: side', 'A'),
  r('voc-11', 'VOC', 'VOC', 'M1', '§0 term 11 of 23: vertex', 'A'),
  r('voc-12', 'VOC', 'VOC', 'M1', '§0 term 12 of 23: acute', 'A'),
  r('voc-13', 'VOC', 'VOC', 'M1', '§0 term 13 of 23: straight', 'A'),
  r('voc-14', 'VOC', 'VOC', 'M1', '§0 term 14 of 23: right', 'A'),
  r('voc-15', 'VOC', 'VOC', 'M1', '§0 term 15 of 23: obtuse', 'A'),
  r('voc-16', 'VOC', 'VOC', 'M1', '§0 term 16 of 23: angle bisector', 'A'),
  r('voc-17', 'VOC', 'VOC', 'M1', '§0 term 17 of 23: complementary', 'A'),
  r('voc-18', 'VOC', 'VOC', 'M1', '§0 term 18 of 23: supplementary', 'A'),
  r('voc-19', 'VOC', 'VOC', 'M1', '§0 term 19 of 23: complement', 'A'),
  r('voc-20', 'VOC', 'VOC', 'M1', '§0 term 20 of 23: supplement', 'A'),
  r('voc-21', 'VOC', 'VOC', 'M1', '§0 term 21 of 23: adjacent', 'A'),
  r('voc-22', 'VOC', 'VOC', 'M1', '§0 term 22 of 23: linear pair', 'A'),
  r('voc-23', 'VOC', 'VOC', 'M1', '§0 term 23 of 23: vertical angles', 'A'),
  // ---- §0 notation (NOTE) — read items A; the write/build items not-03..06 also serve section A "write 1";
  //      not-06 (name the angle) doubles as section B "classify/name" -----------------------------------
  r('not-01', 'NOTE', 'VOC', 'M1', '§0 notation: line', 'A'),
  r('not-02', 'NOTE', 'VOC', 'M1', '§0 notation: segment', 'A'),
  r('not-03', 'NOTE', 'VOC', 'M1', '§0 notation: length (no bar) — trap', 'A'),
  r('not-04', 'NOTE', 'VOC', 'M1', '§0 notation: ray, endpoint first — trap (Boss B1 elite)', 'A'),
  r('not-05', 'NOTE', 'VOC', 'M1', '§0 notation: opposite rays', 'A'),
  r('not-06', 'NOTE', 'VOC', 'M1', '§0 notation: ∠ABC, vertex in the middle', 'AB'),
  r('not-07', 'NOTE', 'VOC', 'M1', '§0 notation: m∠ vs ∠', 'A'),
  r('not-08', 'NOTE', 'VOC', 'M1', '§0 notation: ≅ vs =', 'A'),
  r('not-09', 'NOTE', 'VOC', 'M1', '§0 notation: naming a plane', 'A'),
  // ---- §0 standard definitions, one per bullet (VOC) --------------------------------------------------
  r('def-01', 'VOC', 'VOC', 'M1', '§0 definition: point', 'A'),
  r('def-02', 'VOC', 'VOC', 'M1', '§0 definition: line', 'A'),
  r('def-03', 'VOC', 'VOC', 'M1', '§0 definition: plane', 'A'),
  r('def-04', 'VOC', 'VOC', 'M1', '§0 definition: collinear', 'A'),
  r('def-05', 'VOC', 'VOC', 'M1', '§0 definition: coplanar', 'A'),
  r('def-06', 'VOC', 'VOC', 'M1', '§0 definition: segment', 'A'),
  r('def-07', 'VOC', 'VOC', 'M1', '§0 definition: ray', 'A'),
  r('def-08', 'VOC', 'VOC', 'M1', '§0 definition: angle (sides, vertex)', 'A'),
  r('def-09', 'VOC', 'VOC', 'M1', '§0 definition: angle bisector', 'A'),
  r('def-10', 'VOC', 'VOC', 'M1', '§0 definition: complementary', 'A'),
  r('def-11', 'VOC', 'VOC', 'M1', '§0 definition: supplementary', 'A'),
  r('def-12', 'VOC', 'VOC', 'M1', '§0 definition: adjacent angles', 'A'),
  r('def-13', 'VOC', 'VOC', 'M1', '§0 definition: linear pair', 'A'),
  r('def-14', 'VOC', 'VOC', 'M1', '§0 definition: vertical angles', 'A'),
  // ---- §0 intersection facts + the two "exactly one" postulates (ASN-PLP; Mock section C as verdicts) ---
  r('fact-01', 'ASN-PLP', 'VOC', 'M1', '§0 intersection fact: two distinct lines', 'C'),
  r('fact-02', 'ASN-PLP', 'VOC', 'M1', '§0 intersection fact: two distinct planes', 'C'),
  r('fact-03', 'ASN-PLP', 'VOC', 'M1', '§0 intersection fact: a line and a plane', 'C'),
  r('fact-04', 'ASN-PLP', 'VOC', 'M1', '§0 postulate: two points, exactly one line', 'C'),
  r('fact-05', 'ASN-PLP', 'VOC', 'M1', '§0 postulate: three non-collinear points, exactly one plane', 'C'),
  // ---- §0 acute / right / obtuse / straight (CLASS; Mock section B "classify/name") --------------------
  r('cls-01', 'CLASS', 'VOC', 'M1', '§0 classification: acute', 'B'),
  r('cls-02', 'CLASS', 'VOC', 'M1', '§0 classification: right', 'B'),
  r('cls-03', 'CLASS', 'VOC', 'M1', '§0 classification: obtuse', 'B'),
  r('cls-04', 'CLASS', 'VOC', 'M1', '§0 classification: straight', 'B'),
  // ---- §1 Angles Practice: F1 warm-up (PAIRS; Mock section B `pairs` on F1A) ---------------------------
  r('ang-wu-1', 'PAIRS', 'AP-1', 'M2', '§1 warm-up 1', 'B'),
  r('ang-wu-2', 'PAIRS', 'AP-1', 'M2', '§1 warm-up 2', 'B'),
  r('ang-wu-3', 'PAIRS', 'AP-1', 'M2', '§1 warm-up 3', 'B'),
  r('ang-wu-4', 'PAIRS', 'AP-1', 'M2', '§1 warm-up 4', 'B'),
  r('ang-wu-5', 'PAIRS', 'AP-1', 'M2', '§1 warm-up 5', 'B'),
  // ---- §1 Angles Practice #2–#11 (Mock section D) ------------------------------------------------------
  r('ang-02', 'CS-LIN', 'AP-1', 'M4', '§1 #2', 'D'),
  r('ang-03', 'CS-LIN', 'AP-1', 'M4', '§1 #3', 'D'),
  r('ang-04', 'SEG-ALG', 'AP-2', 'M8', '§1 #4', 'D'),
  r('ang-05', 'BISECT-Q', 'AP-2', 'M7', '§1 #5', 'D'),
  r('ang-06', 'CS-LIN', 'AP-3', 'M4', '§1 #6', 'D'),
  r('ang-07', 'CS-RATIO', 'AP-3', 'M4', '§1 #7', 'D'),
  r('ang-08', 'CS-RATIO', 'AP-3', 'M4', '§1 #8', 'D'),
  r('ang-09', 'CS-QUAD', 'AP-3', 'M5', '§1 #9', 'D'),
  r('ang-10', 'FIG-ALG', 'AP-4', 'M6', '§1 #10', 'D'),
  r('ang-11', 'CS-LIN', 'AP-4', 'M4', '§1 #11', 'D'),
  // ---- §2 doc #5–#7 (Mock section D) --------------------------------------------------------------------
  r('doc-05', 'BISECT-L', 'DOC', 'M7', '§2 doc #5', 'D'),
  r('doc-06', 'CS-LIN', 'DOC', 'M4', '§2 doc #6', 'D'),
  r('doc-07', 'FIG-ALG', 'DOC', 'M6', '§2 doc #7', 'D'),
  // ---- §3 comp/supp word problems 1–16 (Mock section D) ----------------------------------------------
  r('wp-01', 'CS-LIN', 'WP', 'M4', '§3 #1', 'D'),
  r('wp-02', 'CS-LIN', 'WP', 'M4', '§3 #2', 'D'),
  r('wp-03', 'CS-LIN', 'WP', 'M4', '§3 #3', 'D'),
  r('wp-04', 'CS-LIN', 'WP', 'M4', '§3 #4', 'D'),
  r('wp-05', 'CS-RATIO', 'WP', 'M4', '§3 #5', 'D'),
  r('wp-06', 'CS-LIN', 'WP', 'M4', '§3 #6', 'D'),
  r('wp-07', 'CS-LIN', 'WP', 'M4', '§3 #7', 'D'),
  r('wp-08', 'CS-LIN', 'WP', 'M4', '§3 #8', 'D'),
  r('wp-09', 'CS-LIN', 'WP', 'M4', '§3 #9', 'D'),
  r('wp-10', 'CS-RATIO', 'WP', 'M4', '§3 #10', 'D'),
  r('wp-11', 'CS-RATIO', 'WP', 'M4', '§3 #11', 'D'),
  r('wp-12', 'CS-QUAD', 'WP', 'M5', '§3 #12', 'D'),
  r('wp-13', 'CS-LIN', 'WP', 'M4', '§3 #13', 'D'),
  r('wp-14', 'CS-RATIO', 'WP', 'M4', '§3 #14', 'D'),
  r('wp-15', 'CS-LIN', 'WP', 'M4', '§3 #15', 'D'),
  r('wp-16', 'CS-RATIO', 'WP', 'M4', '§3 #16', 'D'),
  // ---- §4 ASN 1–36 (ASN-PLP: 3,4,5,7,8,9,11,14,15,17,19,22,24,27,28,31,32,33,35; ASN-ANG: the rest) -----
  r('asn-01', 'ASN-ANG', 'ASN', 'M9', '§4 #1', 'C'),
  r('asn-02', 'ASN-ANG', 'ASN', 'M9', '§4 #2', 'C'),
  r('asn-03', 'ASN-PLP', 'ASN', 'M9', '§4 #3', 'C'),
  r('asn-04', 'ASN-PLP', 'ASN', 'M9', '§4 #4', 'C'),
  r('asn-05', 'ASN-PLP', 'ASN', 'M9', '§4 #5', 'C'),
  r('asn-06', 'ASN-ANG', 'ASN', 'M9', '§4 #6', 'C'),
  r('asn-07', 'ASN-PLP', 'ASN', 'M9', '§4 #7', 'C'),
  r('asn-08', 'ASN-PLP', 'ASN', 'M9', '§4 #8', 'C'),
  r('asn-09', 'ASN-PLP', 'ASN', 'M9', '§4 #9', 'C'),
  r('asn-10', 'ASN-ANG', 'ASN', 'M9', '§4 #10', 'C'),
  r('asn-11', 'ASN-PLP', 'ASN', 'M9', '§4 #11', 'C'),
  r('asn-12', 'ASN-ANG', 'ASN', 'M9', '§4 #12', 'C'),
  r('asn-13', 'ASN-ANG', 'ASN', 'M9', '§4 #13', 'C'),
  r('asn-14', 'ASN-PLP', 'ASN', 'M9', '§4 #14', 'C'),
  r('asn-15', 'ASN-PLP', 'ASN', 'M9', '§4 #15', 'C'),
  r('asn-16', 'ASN-ANG', 'ASN', 'M9', '§4 #16', 'C'),
  r('asn-17', 'ASN-PLP', 'ASN', 'M9', '§4 #17', 'C'),
  r('asn-18', 'ASN-ANG', 'ASN', 'M9', '§4 #18', 'C'),
  r('asn-19', 'ASN-PLP', 'ASN', 'M9', '§4 #19', 'C'),
  r('asn-20', 'ASN-ANG', 'ASN', 'M9', '§4 #20', 'C'),
  r('asn-21', 'ASN-ANG', 'ASN', 'M9', '§4 #21', 'C'),
  r('asn-22', 'ASN-PLP', 'ASN', 'M9', '§4 #22', 'C'),
  r('asn-23', 'ASN-ANG', 'ASN', 'M9', '§4 #23', 'C'),
  r('asn-24', 'ASN-PLP', 'ASN', 'M9', '§4 #24', 'C'),
  r('asn-25', 'ASN-ANG', 'ASN', 'M9', '§4 #25', 'C'),
  r('asn-26', 'ASN-ANG', 'ASN', 'M9', '§4 #26', 'C'),
  r('asn-27', 'ASN-PLP', 'ASN', 'M9', '§4 #27', 'C'),
  r('asn-28', 'ASN-PLP', 'ASN', 'M9', '§4 #28', 'C'),
  r('asn-29', 'ASN-ANG', 'ASN', 'M9', '§4 #29', 'C'),
  r('asn-30', 'ASN-ANG', 'ASN', 'M9', '§4 #30', 'C'),
  r('asn-31', 'ASN-PLP', 'ASN', 'M9', '§4 #31', 'C'),
  r('asn-32', 'ASN-PLP', 'ASN', 'M9', '§4 #32', 'C'),
  r('asn-33', 'ASN-PLP', 'ASN', 'M9', '§4 #33', 'C'),
  r('asn-34', 'ASN-ANG', 'ASN', 'M9', '§4 #34', 'C'),
  r('asn-35', 'ASN-PLP', 'ASN', 'M9', '§4 #35', 'C'),
  r('asn-36', 'ASN-ANG', 'ASN', 'M9', '§4 #36', 'C'),
  // ---- §5 Quizlet in scope 1–18 (PLP: 01–10, 12; ANG: 11, 13–18); qz-04 ⚑ graded S -----------------------
  r('qz-01', 'ASN-PLP', 'QZ', 'M9', '§5 #1', 'C'),
  r('qz-02', 'ASN-PLP', 'QZ', 'M9', '§5 #2', 'C'),
  r('qz-03', 'ASN-PLP', 'QZ', 'M9', '§5 #3', 'C'),
  r('qz-04', 'ASN-PLP', 'QZ', 'M9', '§5 #4', 'C'),
  r('qz-05', 'ASN-PLP', 'QZ', 'M9', '§5 #5', 'C'),
  r('qz-06', 'ASN-PLP', 'QZ', 'M9', '§5 #6', 'C'),
  r('qz-07', 'ASN-PLP', 'QZ', 'M9', '§5 #7', 'C'),
  r('qz-08', 'ASN-PLP', 'QZ', 'M9', '§5 #8', 'C'),
  r('qz-09', 'ASN-PLP', 'QZ', 'M9', '§5 #9', 'C'),
  r('qz-10', 'ASN-PLP', 'QZ', 'M9', '§5 #10', 'C'),
  r('qz-11', 'ASN-ANG', 'QZ', 'M9', '§5 #11', 'C'),
  r('qz-12', 'ASN-PLP', 'QZ', 'M9', '§5 #12', 'C'),
  r('qz-13', 'ASN-ANG', 'QZ', 'M9', '§5 #13', 'C'),
  r('qz-14', 'ASN-ANG', 'QZ', 'M9', '§5 #14', 'C'),
  r('qz-15', 'ASN-ANG', 'QZ', 'M9', '§5 #15', 'C'),
  r('qz-16', 'ASN-ANG', 'QZ', 'M9', '§5 #16', 'C'),
  r('qz-17', 'ASN-ANG', 'QZ', 'M9', '§5 #17', 'C'),
  r('qz-18', 'ASN-ANG', 'QZ', 'M9', '§5 #18', 'C'),
  // ---- §5 out of scope — the Bonus bank (M13, no skill, never in the Mock, no Foil path) -----------------
  b('bonus-01', '§5 bonus #1'),  b('bonus-02', '§5 bonus #2'),  b('bonus-03', '§5 bonus #3'),
  b('bonus-04', '§5 bonus #4'),  b('bonus-05', '§5 bonus #5'),  b('bonus-06', '§5 bonus #6'),
  b('bonus-07', '§5 bonus #7'),  b('bonus-08', '§5 bonus #8'),  b('bonus-09', '§5 bonus #9'),
  b('bonus-10', '§5 bonus #10'), b('bonus-11', '§5 bonus #11'), b('bonus-12', '§5 bonus #12'),
  b('bonus-13', '§5 bonus #13'), b('bonus-14', '§5 bonus #14'), b('bonus-15', '§5 bonus #15'),
  b('bonus-16', '§5 bonus #16'), b('bonus-17', '§5 bonus #17'), b('bonus-18', '§5 bonus #18'),
  b('bonus-19', '§5 bonus #19'), b('bonus-20', '§5 bonus #20'), b('bonus-21', '§5 bonus #21'),
  b('bonus-22', '§5 bonus #22'), b('bonus-23', '§5 bonus #23'), b('bonus-24', '§5 bonus #24'),
  b('bonus-25', '§5 bonus #25'), b('bonus-26', '§5 bonus #26'), b('bonus-27', '§5 bonus #27'),
  b('bonus-28', '§5 bonus #28'), b('bonus-29', '§5 bonus #29'), b('bonus-30', '§5 bonus #30'),
  b('bonus-31', '§5 bonus #31'), b('bonus-32', '§5 bonus #32'), b('bonus-33', '§5 bonus #33'),
  // ---- §6 Kuta "Factoring Trinomials (a > 1)" 1–18 (FAC2; Mock section E) ------------------------------
  r('fac-01', 'FAC2', 'FAC', 'M10', '§6 #1', 'E'),
  r('fac-02', 'FAC2', 'FAC', 'M10', '§6 #2', 'E'),
  r('fac-03', 'FAC2', 'FAC', 'M10', '§6 #3', 'E'),
  r('fac-04', 'FAC2', 'FAC', 'M10', '§6 #4', 'E'),
  r('fac-05', 'FAC2', 'FAC', 'M10', '§6 #5', 'E'),
  r('fac-06', 'FAC2', 'FAC', 'M10', '§6 #6', 'E'),
  r('fac-07', 'FAC2', 'FAC', 'M10', '§6 #7', 'E'),
  r('fac-08', 'FAC2', 'FAC', 'M10', '§6 #8', 'E'),
  r('fac-09', 'FAC2', 'FAC', 'M10', '§6 #9', 'E'),
  r('fac-10', 'FAC2', 'FAC', 'M10', '§6 #10', 'E'),
  r('fac-11', 'FAC2', 'FAC', 'M10', '§6 #11', 'E'),
  r('fac-12', 'FAC2', 'FAC', 'M10', '§6 #12', 'E'),
  r('fac-13', 'FAC2', 'FAC', 'M10', '§6 #13', 'E'),
  r('fac-14', 'FAC2', 'FAC', 'M10', '§6 #14', 'E'),
  r('fac-15', 'FAC2', 'FAC', 'M10', '§6 #15', 'E'),
  r('fac-16', 'FAC2', 'FAC', 'M10', '§6 #16', 'E'),
  r('fac-17', 'FAC2', 'FAC', 'M10', '§6 #17', 'E'),
  r('fac-18', 'FAC2', 'FAC', 'M10', '§6 #18', 'E'),
  // ---- §7 the three named quadratics (QUAD-SOLVE; Mock section E) ---------------------------------------
  r('quad-01', 'QUAD-SOLVE', 'ALG', 'M11', '§7 · x² + 9x + 8 = 0', 'E'),
  r('quad-02', 'QUAD-SOLVE', 'ALG', 'M11', '§7 · 2x² − 5x − 3 = 0', 'E'),
  r('quad-03', 'QUAD-SOLVE', 'ALG', 'M11', '§7 · m² − 3m − 10 = 0', 'E'),
]);

export const MANIFEST_IDS = Object.freeze(manifest.map(m => m.id));
export const manifestById = Object.freeze(Object.fromEntries(manifest.map(m => [m.id, m])));

/** The four generated-only family tiles (S2 M11/M12, S4 family rarity). Not cards; on the ALG tab. */
export const FAMILY_TILES = Object.freeze(['fam-quad-a1', 'fam-quad-a2', 'fam-quad-ctx', 'fam-sys']);

/** The S7 Mock sections a manifest row's `mock` letters refer to. */
export const MOCK_SECTIONS = Object.freeze({
  A: 'Vocab / Notation',
  B: 'Figures',
  C: 'Always / Sometimes / Never',
  D: 'Angle algebra',
  E: 'Algebra review',
});

/** The S2 manifest line "skill per id prefix" — the same rule the rows above spell out. */
export const SKILL_BY_PREFIX = Object.freeze({
  voc: 'VOC', not: 'NOTE', def: 'VOC', fact: 'ASN-PLP', cls: 'CLASS', fac: 'FAC2', quad: 'QUAD-SOLVE', bonus: null,
});

/** Expected primary skill for an id (null for the Bonus bank, undefined for an unknown id). */
export function expectedSkill(id) {
  const row = manifestById[id];
  return row ? row.skill : undefined;
}

/** Expected Binder tab for an id (undefined for an unknown id). */
export function expectedSheet(id) {
  const row = manifestById[id];
  return row ? row.sheet : undefined;
}

/** Is this id in the Bonus bank (no skill, no XP, never in the Mock)? Unknown ids are not bonus. */
export function isBonus(id) {
  return manifestById[id]?.bonus === true;
}

/** Mock section letters an id is eligible for, as an array (`[]` for bonus / unknown). */
export function mockSections(id) {
  const m = manifestById[id]?.mock;
  return m ? m.split('') : [];
}

/** Every manifest id, optionally without the Bonus bank. */
export function manifestIds({ bonus = true } = {}) {
  return manifest.filter(m => bonus || !m.bonus).map(m => m.id);
}

export default manifest;
