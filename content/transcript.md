# Unit 1A — verbatim transcript of every original problem (T00)

Authority for **wording**: this file. Authority for **answers/coverage**: `content/SOURCE.md`. T06a–e copy `stem` and `srcFile` from the blocks below byte-for-byte and never re-type them.

## Conventions (read once)

- One block per card id: `### <id>` followed by `- key: value` lines. Every id in the COMPOSED S2 coverage table has a block (index at the end of this file).
- `stem` is the exact printed wording. The only substitutions are glyphs that cannot be typed:
  - `{line AB}` = the letters AB with a double-arrow overline (↔) in the original;
  - `{seg AB}` = AB with a plain bar overline;
  - `{ray AB}` = AB with a right-pointing arrow overline (endpoint = first letter);
  - `{ang ABC}` = the ∠ glyph followed by ABC; `{m ABC}` = "m∠ABC" (measure);
  - `°` = a degree sign that the original typesets as a superscript letter "o" (angles.pdf "70o", wordprobs "17o");
  - `²` = a superscript 2 in the original (angles.pdf "x2", factoring.pdf "p2").
  - Everything else is literal: ASCII hyphen-minus `-` where the original prints a hyphen (angles.pdf, doc figures), U+2212 `−` where the original prints a true minus (factoring.pdf), the teacher's `m<` for "m∠" on Angles #10, double spaces after periods, missing final periods and the typos in the ASN sheet (marked `sic`).
  - Line breaks inside a printed problem are joined with a single space; leading/trailing whitespace (including `&nbsp;`) is trimmed.
- `teacherNo` = the number exactly as printed on the sheet. `sheet` = the Binder tab id from S2. `srcFile` = file + page (+ item) the wording was read from; PDF pages are 1-based; `render` = the page PNG under `source/pages/` used to check anything the text layer garbles.
- `teacherAnswer` = the teacher's/Kuta's answer as printed or handwritten in the key (never altered; disagreements are flagged, see notes/T00.md). `printed` = the part of the source line that is not the stem (word-problem answers printed in parentheses).
- `figure` lines describe the drawing so the SVG modeler needs no scan. Ray directions are measured on the scans (0° = to the right, counter-clockwise positive, ±2°). All expression figures are **not to scale**.
- Blocks marked `origin: SOURCE.md` (qz-*, bonus-*, voc-*, not-*, def-*, fact-*, cls-*, quad-*) have no teacher-printed stem: the Quizlet set is not exported locally (fetch returned 403; Chrome extension not connected) and the M1/§7 items are the app's own, built from SOURCE.md §0/§7. Their wording is copied from SOURCE.md verbatim.

---

## Figures (shared descriptions)

### FIG F1G — Angles Practice warm-up figure (angles.pdf p.1, upper-left quadrant; render angles-p1.png)
- kind: fan of 5 rays from F (two full lines + one ray)
- lines: line GD horizontal through F, arrowheads at both ends; line EC through F rising to the right, arrowheads at both ends
- ray: FB from F straight up (90°), arrowhead beyond B
- points (dots) and label placement: G dot on the left of F, label "G" below the dot; D dot right of F, label "D" below the dot; F is the crossing, label "F" just below-right of the crossing; C dot up-right on line EC, label "C" above-left of the dot; E dot down-left on line EC, label "E" below-right of the dot; B dot on the vertical ray, label "B" left of the dot
- ray directions from F: D 0°, C ≈ 26°, B 90°, G 180°, E ≈ 206° (C and E are opposite rays)
- right-angle mark: exactly one, a small red square at F in the **upper-left** corner, between ray FB and ray FG (marks ∠BFG = 90°; ∠BFD is not marked but follows)
- arcs / measures / expressions: none
- note: the stem says "Point F is on {line EC} and {line AD}" but the printed figure labels the left point **G**; the teacher's handwritten key relabels it A and writes every pair with A (∠EFA, ∠AFC, ∠AFE, ∠BFA). The key page also has arcs and a tiny square drawn by hand at F.

### FIG F1A — Angles Practice #10 figure (angles.pdf p.2, lower-left quadrant; render angles-p2.png)
- same drawing as F1G with the left point labeled **A** (label "A" above-left of its dot) and two expression labels added:
- label "-x + 84": printed in the upper-right quadrant, just right of ray FB and below B, i.e. inside ∠BFC (between ray FB and ray FC)
- label "2x²- 4x + 3": printed just below line AD and left of F, inside ∠AFE (between ray FA and ray FE)
- right-angle mark: one red square at F in the upper-left corner between ray FB and ray FA (∠BFA = 90°)
- ray directions from F: D 0°, C ≈ 26°, B 90°, A 180°, E ≈ 206°
- what is asked (printed in blue to the left of the figure, three lines): "x", "m< CFD", "m<DFE"

### FIG F2 — Angles Practice #4 triangle (angles.pdf p.1, lower-left quadrant; render angles-p1.png)
- kind: triangle ACE with a horizontal midsegment BD
- vertices: C at the top (apex), A bottom-left, E bottom-right; base AE horizontal; the triangle is drawn isosceles (AC and CE equal length on the page, apex angle ≈ 51°, base angles ≈ 64°); height ≈ 1.04 × base
- B is on side AC at its midpoint (drawn there), D is on side CE at its midpoint; segment BD is horizontal and parallel to AE
- dots: only B and D are drawn as dots; A, C, E are plain vertices
- labels: "C" above the apex; "A" left of the bottom-left vertex; "E" right of the bottom-right vertex; "B" left of its dot; "D" right of its dot
- expression labels (all outside the triangle, next to the side they measure): "3m + 4" along CB (upper-left side, between C and B); "n - 1" along BA (lower-left side, between B and A); "m² - 6" along DE (lower-right side, between D and E); "8" centered below AE
- NO label on CD (the "19" that appears on CD in SOURCE.md §1 #4 and in the key is the teacher's handwritten derived value, not a printed label)
- tick marks / right-angle marks / arcs: none printed (the key adds hand-drawn ticks)

### FIG AH — Angles Practice #5 figure (angles.pdf p.1, lower-right quadrant; render angles-p1.png)
- kind: fan of 3 rays from A
- rays and directions from A: AM ≈ 101° (up, a little left of vertical); AH ≈ 36° (up-right); AC ≈ −26° (334°, down-right); arrowheads at the three ends
- labels: "A" below-left of the vertex; "M" left of ray AM near its end; "H" right of / just below ray AH near its end; "C" left of / just below ray AC near its end
- as drawn ∠MAH ≈ 65°, ∠HAC ≈ 62° (looks bisected; not to scale). No dots, no arcs, no expression labels on the figure (the expressions are in the stem line above it)

### FIG D5 — study-guide doc #5 (embedded PNG 683×213, = content/doc-fig-5-bisect.png; the stem is printed inside the image)
- kind: fan of 3 rays from B
- rays and directions from B: BC ≈ 0° (to the right, arrowhead at the right end); BD ≈ 78° (up, slightly right, arrowhead at the top); BA ≈ 160° (up-left, arrowhead at the left end)
- labels: "B" below the vertex; "C" above ray BC near its right end; "D" right of ray BD near its top; "A" below ray BA near its left end
- expression labels: "5x + 16" inside ∠ABD (left of ray BD, just above ray BA); "8x - 23" inside ∠DBC (right of ray BD, above ray BC)
- as drawn ∠ABD ≈ 82°, ∠DBC ≈ 77° (not to scale). No arcs, no marks, no dots
- text inside the image, above the drawing: "1. If m∠ABC = 11x + 19, does {ray BD} bisect ∠ABC? Show work and explain why or why not." (the "1." is the numbering of the worksheet the image was clipped from; the doc numbers it 5.)

### FIG D7 — study-guide doc #7 (embedded PNG 368×203, = content/doc-fig-7-lines.png)
- kind: two intersecting lines, no point labels
- line 1: horizontal, spanning the image, no arrowheads
- line 2: from the upper-left corner down to the lower-right, crossing line 1 at ≈ 32° (acute angles ≈ 32°, obtuse ≈ 148°); no arrowheads
- expression labels: "3x + y" in the upper-left angle (larger font); "4y + x - 5" in the upper-right angle (small font, just right of the crossing); "4x + y + 10" in the lower-right angle (small font); the lower-left angle is unlabeled
- no arcs, no marks, no dots

---

## Sheet AP-1 — "Angles Practice" p.1 of the packet pages 13–14 (source/angles.pdf p.1; key: source/angles-key.pdf p.1 = content/angles-key-p1.png)

Page header (both pages): "Name: ______________________________   Angles Practice". Warm-up heading printed in orange: "Warm up!" (the key page reads "Warm Up!").

Shared warm-up stem (printed once above the five items): "Given the following diagram, where Point F is on {line EC} and {line AD}, identify:" — each `ang-wu-*` block below is that sentence + its own item line.

### ang-wu-1
- sheet: AP-1
- teacherNo: Warm up! — item 1
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (upper-left)
- stem: Given the following diagram, where Point F is on {line EC} and {line AD}, identify: 3 pairs of supplementary angles
- figure: FIG F1G
- teacherAnswer: ∠EFA + ∠AFC, ∠AFC + ∠CFD, ∠AFE + ∠EFD (handwritten; the teacher uses A for the printed G)
- note: any linear pair or ∠BFA + ∠BFD-type sum to 180° is structurally valid (S2)

### ang-wu-2
- sheet: AP-1
- teacherNo: Warm up! — item 2
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (upper-left)
- stem: Given the following diagram, where Point F is on {line EC} and {line AD}, identify: 1 pair of complementary angles
- figure: FIG F1G
- teacherAnswer: ∠BFC + ∠CFD (handwritten)

### ang-wu-3
- sheet: AP-1
- teacherNo: Warm up! — item 3
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (upper-left)
- stem: Given the following diagram, where Point F is on {line EC} and {line AD}, identify: 1 pair of vertical angles
- figure: FIG F1G
- teacherAnswer: ∠AFE, ∠CFD (handwritten; the key also writes ∠AFC + ∠DFE on this line with an arrow pointing it down to "2 linear pairs")

### ang-wu-4
- sheet: AP-1
- teacherNo: Warm up! — item 4
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (upper-left)
- stem: Given the following diagram, where Point F is on {line EC} and {line AD}, identify: 2 linear pairs
- figure: FIG F1G
- teacherAnswer: the key draws a curly arrow from the supplementary pairs (∠AFC + ∠CFD, ∠EFA + ∠AFC, ∠AFE + ∠EFD) to this line — i.e. the same adjacent pairs; no separate answer is written

### ang-wu-5
- sheet: AP-1
- teacherNo: Warm up! — item 5
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (upper-left)
- stem: Given the following diagram, where Point F is on {line EC} and {line AD}, identify: 2 non-examples of adjacent angles
- figure: FIG F1G
- teacherAnswer: ∠BFA + ∠CFD; "non-adjacent complementary" ∠BFC + ∠AFE (handwritten)
- note: the PDF text layer renders the hyphen in "non-examples" as a soft hyphen (U+00AD); the print shows "non-examples"

### ang-02
- sheet: AP-1
- teacherNo: 2)
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (upper-right)
- stem: One of two complementary angles is twice the other.  Find the measures of the angles.
- figure: none
- teacherAnswer: 30°, 60° (key: smaller ∠ = x, larger ∠ = 2x, 3x = 90, x = 30)

### ang-03
- sheet: AP-1
- teacherNo: 3)
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (upper-right)
- stem: One of two supplementary angles is 70° greater than the second.  Find the measure of the larger angle.
- figure: none
- teacherAnswer: 125° (key: ∠1 = x, ∠2 = x + 70, 2x + 70 = 180, x = 55, ∠1 = 55°, ∠2 = 125°)

---

## Sheet AP-2 — "Angles Practice" p.2 (source/angles.pdf p.1, lower half; key: content/angles-key-p2.png)

### ang-04
- sheet: AP-2
- teacherNo: 4)
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (lower-left)
- stem: In the following diagram, {seg AC} ≅ {seg CE} and {seg BD} bisects {seg AC} and {seg CE}. Find m, n, and the perimeter of triangle ACE.
- figure: FIG F2 — labels CB "3m + 4", BA "n - 1", DE "m² - 6", AE "8"; no label on CD; no tick marks printed
- teacherAnswer: m = 5 (−2 "does not make sense!" / "makes neg. side length"), n = 20, P = 84 u (key: m² − 6 = 3m + 4 → m² − 3m − 10 = 0 → (m − 5)(m + 2) = 0; handwritten 19 on CB, CD, DE and "n − 1 = 19")
- note: the text layer drops the ≅ glyph ("AC   CE"); it is clearly ≅ on the render

### ang-05
- sheet: AP-2
- teacherNo: 5)
- srcFile: source/angles.pdf p.1
- render: source/pages/angles-p1.png (lower-right)
- stem: {m MAH} = x² + 3, {m HAC} = 11 - 7x, and {m MAC} = 6 -16x Does {ray AH} bisect {ang MAC}? Explain why or why not.
- layout: the first sentence is printed on one line above the figure; "Does {ray AH} bisect {ang MAC}? Explain why or why not." is printed in larger type below the figure. The spacing "6 -16x" (no space after the minus) is the original's.
- figure: FIG AH
- teacherAnswer: x² + 3 + 11 − 7x = 6 − 16x → x² + 9x + 8 = 0 → (x + 8)(x + 1) = 0 → x = −8, x = −1. x = −8: m∠MAH = 67, m∠HAC = 67, "yes! ∠MAH ≅ ∠HAC". x = −1: m∠MAH = 4, m∠HAC = 18, "no! ∠MAH not ≅ ∠HAC". (both cases written)

---

## Sheet AP-3 — "Angles Practice" p.3 (source/angles.pdf p.2, upper half; key: content/angles-key-p3.png)

### ang-06
- sheet: AP-3
- teacherNo: 6)
- srcFile: source/angles.pdf p.2
- render: source/pages/angles-p2.png (upper-left)
- stem: The measure of the supplement of an angle is 30° less than five times the measure of the complement.  Find the measure of the angle.
- figure: none
- teacherAnswer: angle = 60°, comp. = 30°, supp = 120° (key: 180 − x = 5(90 − x) − 30, 4x = 240; the teacher added by hand ", the complement and the supplement." to the question)

### ang-07
- sheet: AP-3
- teacherNo: 7)
- srcFile: source/angles.pdf p.2
- render: source/pages/angles-p2.png (upper-left)
- stem: Two supplementary angles are in the ratio 7:2.  Find the measure of each.
- figure: none
- teacherAnswer: The angles are 140° and 40° (key: 9 equal parts, 9x = 180, x = 20° each part)

### ang-08
- sheet: AP-3
- teacherNo: 8)
- srcFile: source/angles.pdf p.2
- render: source/pages/angles-p2.png (upper-right)
- stem: The ratio of the measure of the supplement of an angle to the measure of the complement of the angle is 5:2.  Find the measure of the supplement.
- figure: none
- teacherAnswer: supp = 150° (key: (180 − x) : (90 − x) = 5 : 2, 2(180 − x) = 5(90 − x), 360 − 2x = 450 − 5x, 3x = 90, x = 30°, comp = 60°)

### ang-09
- sheet: AP-3
- teacherNo: 9)
- srcFile: source/angles.pdf p.2
- render: source/pages/angles-p2.png (upper-right)
- stem: The ratio of the product of an angle and its supplement to the product of the angle and its complement is 13:4. Find the angle
- figure: none
- teacherAnswer: x = 50 (key: x(180 − x) : x(90 − x) = 13 : 4, (180x − x²)/(90x − x²) = 13/4, 720x − 4x² = 1170x − 13x², 9x² − 450x = 0, 9x(x − 50) = 0, x = 0 crossed out; angle 50, comp = 40°, supp = 130°)
- note: no final period in the original ("Find the angle")

---

## Sheet AP-4 — "Angles Practice" p.4 (source/angles.pdf p.2, lower half; key: content/angles-key-p4.png)

### ang-10
- sheet: AP-4
- teacherNo: 10)
- srcFile: source/angles.pdf p.2
- render: source/pages/angles-p2.png (lower-left)
- stem: Given the following diagram, where Point F is on {line EC} and {line AD}, identify: x, m< CFD, m<DFE
- layout: the three asked items are printed in blue on three separate lines to the left of the figure, exactly "x", "m< CFD", "m<DFE" (the teacher typed "<" for ∠); the stem joins them with commas
- figure: FIG F1A — "-x + 84" inside ∠BFC, "2x²- 4x + 3" inside ∠AFE, red right-angle mark between FB and FA
- teacherAnswer: x = −1/2, 3; m< CFD = 9° or 5.5°; m<DFE = 171° or 174.5° (key: 2x² − 4x + 3 − x + 84 = 90, 2x² − 5x − 3 = 0, (2x + 1)(x − 3) = 0; "= 90" written beside ∠BFD; both roots kept)

### ang-11
- sheet: AP-4
- teacherNo: 11)
- srcFile: source/angles.pdf p.2
- render: source/pages/angles-p2.png (lower-right)
- stem: Four times the measure of complement of an angle is 12 degrees more than twice the difference between the measures of the complement and its supplement
- figure: none
- teacherAnswer: x = 42, comp = 48, supp = 138 (key: 4(90 − x) = 12 + 2(180 − x − (90 − x)), 360 − 4x = 12 + 2(90), −4x = −168)
- note: "of complement" (no "the") and no final period are the original's

---

## Sheet DOC — study-guide Google Doc "2026 Review for Unit 1a Assessment: Points, Lines, Planes: Vocab & Angles" (source/study-guide.html; keys: content/doc-key-5.png, doc-key-6-7.png)

Doc items 1–3 are links (Angles sheet + key, word problems + solutions, factoring). Item 4 is the vocabulary list (see VOC below). Items 5–7 are the problems; item 8 links the ASN doc and the Quizlet.

### doc-05
- sheet: DOC
- teacherNo: 5.
- srcFile: source/study-guide.html #5 (stem printed inside the embedded image = content/doc-fig-5-bisect.png)
- stem: If {m ABC} = 11x + 19, does {ray BD} bisect {ang ABC}? Show work and explain why or why not.
- layout: the doc's line "5." is otherwise empty; the whole problem is the image, whose own numbering reads "1."; the math "m∠ABC = 11x + 19" is set in italic math type
- figure: FIG D5 — "5x + 16" inside ∠ABD, "8x - 23" inside ∠DBC
- teacherAnswer: 5x + 16 + 8x − 23 = 11x + 19 → 13x − 7 = 11x + 19 → 2x − 7 = 19 → 2x = 26 → x = 13; "if x = 13, then m∠ABD = 5(13) + 16 = 81°, then m∠DBC = 8(13) − 23 = 81°. Since both ∠s = 81°, then ∠ABD ≅ ∠DBC so BD bisects ∠ABC since it cuts ∠ABC into 2 ≅ ∠s"

### doc-06
- sheet: DOC
- teacherNo: 6.
- srcFile: source/study-guide.html #6
- stem: The measure of the supplement of an angle is 30 more than three times the complement. Determine the measures of the angles.
- figure: none
- teacherAnswer: x = 60; "So the angle = 60°, supplement = 120°, complement = 30°" (key: 180 − x = 30 + 3(90 − x), 180 − x = 30 + 270 − 3x, 180 + 2x = 300, 2x = 120)

### doc-07
- sheet: DOC
- teacherNo: 7.
- srcFile: source/study-guide.html #7 (figure = content/doc-fig-7-lines.png)
- stem: Solve for x, y, and the measures of the angles.
- layout: the doc line continues "(Scroll to next page for solutions to #5, 6, 7)" — a navigation note, not part of the problem
- figure: FIG D7 — "3x + y" upper-left, "4y + x - 5" upper-right, "4x + y + 10" lower-right, lower-left blank
- teacherAnswer: x = −10, y = 45; angles 15°, 165°, 165°, 15° (key: 3x + y = 4x + y + 10 → 3x = 4x + 10 → x = −10; 3x + y + 4y + x − 5 = 180 → 4x + 5y = 185 → 4(−10) + 5y = 185 → 5y = 225 → y = 45; the sketch shows 15° upper-left, 165° upper-right, 165° lower-left, 15° lower-right)

---

## Sheet WP — "4a. comp supp word problems" Google Doc (source/wordprobs.html; keys: content/wordprobs-key-p1.png #1–8, p2 #9–13, p4 #14–16)

Instruction printed above the list (two paragraphs): "Solve each problem by setting up an algebraic equation. (No guess ‘n’ check)." / "Then answer the question.  Do your work on a separate paper. Number the problems. Show all work" (no final period; curly quotes around n).
Each list item ends with the teacher's answer in parentheses (`printed`); the source line is `stem` + one space + `printed` (two spaces before the parenthesis on #2). The degree signs are superscript letter o's.

### wp-01
- sheet: WP
- teacherNo: 1.
- srcFile: source/wordprobs.html #1
- stem: The supplement of an angle is 10 more than nine times the angle. What is the measure of the angle and its complement?
- printed: (17°, 73°)
- teacherAnswer: 17°, 73°

### wp-02
- sheet: WP
- teacherNo: 2.
- srcFile: source/wordprobs.html #2
- stem: The supplement of an angle less 14 is three times the complement of the angle. What is the angle and its supplement?
- printed: (52°, 128°)
- teacherAnswer: 52°, 128°

### wp-03
- sheet: WP
- teacherNo: 3.
- srcFile: source/wordprobs.html #3
- stem: An angle plus its complement is 6 more than half of the supplement of the angle. What is the measure of the angle and its complement?
- printed: (12°, 78°)
- teacherAnswer: 12°, 78°

### wp-04
- sheet: WP
- teacherNo: 4.
- srcFile: source/wordprobs.html #4
- stem: The measure of an angle is 6 more than twice the measure of its complement. Find the measure of the larger of these two angles.
- printed: (62°)
- teacherAnswer: 62°

### wp-05
- sheet: WP
- teacherNo: 5.
- srcFile: source/wordprobs.html #5
- stem: Two supplementary angles are in a ratio of 5:7. Find the complement of the smaller angle.
- printed: (15°)
- teacherAnswer: 15°

### wp-06
- sheet: WP
- teacherNo: 6.
- srcFile: source/wordprobs.html #6
- stem: The measure of one of two complementary angles is 6 less than one-half the measure of the other. Find the measure of the supplement of the smaller of the two complementary angles.
- printed: (154°)
- teacherAnswer: 154°

### wp-07
- sheet: WP
- teacherNo: 7.
- srcFile: source/wordprobs.html #7
- stem: The supplement of an angle less 8 is seven times the angle. What is the measure of the supplement of the complement of the angle?
- printed: (111.5°)
- teacherAnswer: 111.5°

### wp-08
- sheet: WP
- teacherNo: 8.
- srcFile: source/wordprobs.html #8
- stem: Half of the difference between two supplementary angles is 3.5. What is the measure of the larger of the two angles?
- printed: (93.5°)
- teacherAnswer: 93.5°

### wp-09
- sheet: WP
- teacherNo: 9.
- srcFile: source/wordprobs.html #9
- stem: The difference between the supplements of two complementary angles is 24. What are the two complementary angles?
- printed: (33°, 57°)
- teacherAnswer: 33°, 57°

### wp-10
- sheet: WP
- teacherNo: 10.
- srcFile: source/wordprobs.html #10
- stem: The ratio of an angle to its supplement is 3:7. Determine the ratio of the angle to its complement.
- printed: (3:2)
- teacherAnswer: 3:2

### wp-11
- sheet: WP
- teacherNo: 11.
- srcFile: source/wordprobs.html #11
- stem: The ratio of the supplement of an angle to its complement is 7:2. What is the supplement of the complement of the angle?
- printed: (144°)
- teacherAnswer: 144°

### wp-12
- sheet: WP
- teacherNo: 12.
- srcFile: source/wordprobs.html #12
- stem: The product of an angle and its complement is 344. What is the supplement of the smaller angle?
- printed: (176°)
- teacherAnswer: 176°

### wp-13
- sheet: WP
- teacherNo: 13.
- srcFile: source/wordprobs.html #13
- stem: Three times the difference between an angle and 5 is ten less than double the complement of the angle. What is the supplement of the angle?
- printed: (143°)
- teacherAnswer: 143°

### wp-14
- sheet: WP
- teacherNo: 14.
- srcFile: source/wordprobs.html #14
- stem: The ratio of one less than half of the complement of an angle to the angle itself is 1:2. What is the supplement of the complement of the angle?
- printed: (134°)
- teacherAnswer: 134°

### wp-15
- sheet: WP
- teacherNo: 15.
- srcFile: source/wordprobs.html #15
- stem: The complement of two more than an angle is one-third of the sum of the angle and its supplement. What is the complement of the original angle?
- printed: (62°)
- teacherAnswer: 62°

### wp-16
- sheet: WP
- teacherNo: 16.
- srcFile: source/wordprobs.html #16
- stem: The ratio of 6 more than an angle to 4 less than the supplement of the complement of the angle is 1:5. What is the complement of the angle?
- printed: (76°)
- teacherAnswer: 76°
- note: the source line starts with a non-breaking space (trimmed)

---

## Sheet ASN — Google Doc "Points lines planes angles A, S, N" (source/asn.html; the key is the three-column list at the bottom of the same file)

Verbatim including the sheet's typos (marked `sic`). Trailing spaces trimmed.

### asn-01
- sheet: ASN
- teacherNo: 1.
- srcFile: source/asn.html #1
- stem: An angle measuring less than 180 degrees is acute.
- teacherAnswer: Sometimes

### asn-02
- sheet: ASN
- teacherNo: 2.
- srcFile: source/asn.html #2
- stem: Two obtuse angles are congruent.
- teacherAnswer: Sometimes

### asn-03
- sheet: ASN
- teacherNo: 3.
- srcFile: source/asn.html #3
- stem: Two planes intersect at only one point.
- teacherAnswer: Never

### asn-04
- sheet: ASN
- teacherNo: 4.
- srcFile: source/asn.html #4
- stem: A line and a plan intersect at exactly 2 points.
- sic: "plan" (= plane)
- teacherAnswer: Never

### asn-05
- sheet: ASN
- teacherNo: 5.
- srcFile: source/asn.html #5
- stem: A line can be drawn through 2 points.
- teacherAnswer: Always

### asn-06
- sheet: ASN
- teacherNo: 6.
- srcFile: source/asn.html #6
- stem: Two adjacent acute angles form an obtuse angle.
- teacherAnswer: Sometimes

### asn-07
- sheet: ASN
- teacherNo: 7.
- srcFile: source/asn.html #7
- stem: Four points lie on the same plane.
- teacherAnswer: Sometimes

### asn-08
- sheet: ASN
- teacherNo: 8.
- srcFile: source/asn.html #8
- stem: Three lines intersect at one point.
- teacherAnswer: Sometimes

### asn-09
- sheet: ASN
- teacherNo: 9.
- srcFile: source/asn.html #9
- stem: Two perpendicular lines intersect at exactly one point.
- teacherAnswer: Always

### asn-10
- sheet: ASN
- teacherNo: 10.
- srcFile: source/asn.html #10
- stem: The measure of an obtuse angle is greater than the measure of a right angle.
- teacherAnswer: Always

### asn-11
- sheet: ASN
- teacherNo: 11.
- srcFile: source/asn.html #11
- stem: Two planes intersect.
- teacherAnswer: Sometimes

### asn-12
- sheet: ASN
- teacherNo: 12.
- srcFile: source/asn.html #12
- stem: Two angles that are congruent share the same vertex.
- teacherAnswer: Sometimes

### asn-13
- sheet: ASN
- teacherNo: 13.
- srcFile: source/asn.html #13
- stem: The sum of the measures of 2 acute angles is greater than the sum of the measures of 2 obtuse angles.
- teacherAnswer: Never

### asn-14
- sheet: ASN
- teacherNo: 14.
- srcFile: source/asn.html #14
- stem: A plane contains 3 points
- sic: no final period
- teacherAnswer: Always

### asn-15
- sheet: ASN
- teacherNo: 15.
- srcFile: source/asn.html #15
- stem: A line and a plane intersect at exactly one point.
- teacherAnswer: Sometimes

### asn-16
- sheet: ASN
- teacherNo: 16.
- srcFile: source/asn.html #16
- stem: The measure of an angle is greater than the measure of its complement.
- teacherAnswer: Sometimes

### asn-17
- sheet: ASN
- teacherNo: 17.
- srcFile: source/asn.html #17
- stem: Two lines that are perpendicular intersect at exactly 2 points.
- teacherAnswer: Never

### asn-18
- sheet: ASN
- teacherNo: 18.
- srcFile: source/asn.html #18
- stem: Two right angles are congruent.
- teacherAnswer: Always

### asn-19
- sheet: ASN
- teacherNo: 19.
- srcFile: source/asn.html #19
- stem: Two planes that intersect share exactly one point.
- teacherAnswer: Never

### asn-20
- sheet: ASN
- teacherNo: 20.
- srcFile: source/asn.html #20
- stem: The supplement of an acute angle is greater than the complement of the same angle.
- teacherAnswer: Always

### asn-21
- sheet: ASN
- teacherNo: 21.
- srcFile: source/asn.html #21
- stem: The sum of the measure of 2 acute angles is greater than 90 degrees.
- sic: "measure" (singular)
- teacherAnswer: Sometimes

### asn-22
- sheet: ASN
- teacherNo: 22.
- srcFile: source/asn.html #22
- stem: Two planes contain the same point.
- teacherAnswer: Sometimes

### asn-23
- sheet: ASN
- teacherNo: 23.
- srcFile: source/asn.html #23
- stem: Two angles that are not congruent have the same complement.
- teacherAnswer: Never

### asn-24
- sheet: ASN
- teacherNo: 24.
- srcFile: source/asn.html #24
- stem: Three lines that do not all lie on the same plane can be drawn through one point.
- teacherAnswer: Always

### asn-25
- sheet: ASN
- teacherNo: 25.
- srcFile: source/asn.html #25
- stem: Two angles that are adjacent share the same vertex.
- teacherAnswer: Always

### asn-26
- sheet: ASN
- teacherNo: 26.
- srcFile: source/asn.html #26
- stem: Two angles that are congruent are adjacent.
- teacherAnswer: Sometimes

### asn-27
- sheet: ASN
- teacherNo: 27.
- srcFile: source/asn.html #27
- stem: Two planes that are parallel contain the same point.
- teacherAnswer: Never

### asn-28
- sheet: ASN
- teacherNo: 28.
- srcFile: source/asn.html #28
- stem: A line contains 4 non-collinear points.
- teacherAnswer: Never

### asn-29
- sheet: ASN
- teacherNo: 29.
- srcFile: source/asn.html #29
- stem: An acute angle and its supplement are congruent.
- teacherAnswer: Never

### asn-30
- sheet: ASN
- teacherNo: 30.
- srcFile: source/asn.html #30
- stem: The measure of an angle is less than the measure of its supplement.
- teacherAnswer: Sometimes

### asn-31
- sheet: ASN
- teacherNo: 31.
- srcFile: source/asn.html #31
- stem: Three lines that are all parallel lie on teh same plane.
- sic: "teh"
- teacherAnswer: Sometimes

### asn-32
- sheet: ASN
- teacherNo: 32.
- srcFile: source/asn.html #32
- stem: Two lines that are not parallel do not share any points.
- teacherAnswer: Sometimes

### asn-33
- sheet: ASN
- teacherNo: 33.
- srcFile: source/asn.html #33
- stem: Two planes that intersect share an infinite number of points.
- teacherAnswer: Always

### asn-34
- sheet: ASN
- teacherNo: 34.
- srcFile: source/asn.html #34
- stem: A right angle and its supplement are congruent.
- teacherAnswer: Always

### asn-35
- sheet: ASN
- teacherNo: 35.
- srcFile: source/asn.html #35
- stem: Two lines intersect at one point.
- note: the source has "35.  Two" (nbsp) — trimmed
- teacherAnswer: Sometimes

### asn-36
- sheet: ASN
- teacherNo: 36.
- srcFile: source/asn.html #36
- stem: An angle and its complement are congruent.
- teacherAnswer: Sometimes

---

## Sheet QZ — Quizlet "Points, Lines, Planes, Angles the ALWAYS, SOMETIMES NEVER QUIZ (NO reasons)" (set 254286132, linked from doc item 8)

origin: SOURCE.md §5. The Quizlet is not in `source/` (WebFetch → HTTP 403; Chrome extension not connected in this session), so these 51 statements are copied from `content/SOURCE.md` §5 exactly as written there. `teacherNo` = position in SOURCE.md's list (the Quizlet's own card order is unknown). The in-scope 18 are the statements SOURCE.md marks as not already in §4; `bonus-*` are SOURCE.md's out-of-scope list in order. Three bonus statements are abbreviated with "..." in SOURCE.md (bonus-04, bonus-11, bonus-12) — see notes/T00.md open issues.

### qz-01
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 1
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Any two points can be connected by more than one unique line.
- teacherAnswer: N

### qz-02
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 2
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two intersecting planes will intersect in a segment.
- teacherAnswer: N

### qz-03
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 3
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A line and a point are coplanar.
- teacherAnswer: A

### qz-04
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 4
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A line and a ray are coplanar.
- teacherAnswer: S
- disputed: Quizlet's answer is S; arguably A. Graded S with the ⚑ note (Global rule 5)

### qz-05
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 5
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Ray AB and ray AC are the same ray.
- teacherAnswer: S

### qz-06
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 6
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A plane and a line will intersect in one point.
- teacherAnswer: S

### qz-07
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 7
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Three distinct points will lie on the same line.
- teacherAnswer: S

### qz-08
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 8
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Ray XY and ray YX are opposite rays.
- teacherAnswer: N

### qz-09
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 9
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A single line exists within an infinite number of planes.
- teacherAnswer: A

### qz-10
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 10
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If two lines are not parallel then they intersect.
- teacherAnswer: S

### qz-11
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 11
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If 2 angles are complementary and adjacent they are congruent.
- teacherAnswer: S

### qz-12
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 12
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A line contains four non-coplanar points.
- teacherAnswer: N

### qz-13
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 13
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: The supplement of an acute angle is obtuse.
- teacherAnswer: A

### qz-14
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 14
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Vertical angles are supplementary.
- teacherAnswer: S

### qz-15
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 15
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If 2 supplementary angles are congruent their complements are 45°.
- teacherAnswer: N
- note: SOURCE.md's reason: each is 90°, complement of 90 is 0

### qz-16
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 16
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Vertical angles are complementary.
- teacherAnswer: S

### qz-17
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 17
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If 2 angles are complementary they are each acute.
- teacherAnswer: A

### qz-18
- sheet: QZ
- teacherNo: SOURCE §5 in-scope 18
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: The supplement of an acute angle is acute.
- teacherAnswer: N

## Bonus bank — Quizlet out-of-scope cards (triangles / parallel & skew lines), Binder tab "Bonus"

### bonus-01
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 1
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: An obtuse triangle has exactly 1 obtuse angle
- teacherAnswer: A

### bonus-02
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 2
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A right triangle is scalene
- teacherAnswer: S

### bonus-03
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 3
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: The leg of an isosceles triangle is shorter than the base
- teacherAnswer: S

### bonus-04
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 4
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: 2 triangles congruent if 2 sides and included angle...
- teacherAnswer: A
- note: abbreviated in SOURCE.md (SAS); full Quizlet wording not recoverable offline

### bonus-05
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 5
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If AB≅BC in △ABC then ∠BAC≅∠ABC
- teacherAnswer: S

### bonus-06
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 6
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A right triangle is equilateral
- teacherAnswer: N

### bonus-07
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 7
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A scalene triangle has 3 acute angles
- teacherAnswer: S

### bonus-08
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 8
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: An isosceles triangle is obtuse
- teacherAnswer: S

### bonus-09
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 9
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: The base of an isosceles triangle is shorter than either leg
- teacherAnswer: S

### bonus-10
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 10
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If ∠BAC≅∠ABC then AB≅BC
- teacherAnswer: S

### bonus-11
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 11
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: 2 triangles congruent if 2 sides and an angle of one ≅ corresponding parts
- teacherAnswer: S
- note: abbreviated in SOURCE.md (SSA is not a congruence shortcut)

### bonus-12
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 12
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If 2 sides of a right triangle ≅ corresponding parts of another right triangle, congruent
- teacherAnswer: A
- note: abbreviated in SOURCE.md (HL / LL)

### bonus-13
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 13
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A right triangle is congruent to an obtuse triangle
- teacherAnswer: N

### bonus-14
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 14
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: An equiangular triangle is isosceles
- teacherAnswer: A

### bonus-15
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 15
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: An exterior angle of a triangle is larger than any angle of the triangle
- teacherAnswer: S

### bonus-16
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 16
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: One base angle of an isosceles triangle > one of the exterior angles
- teacherAnswer: N

### bonus-17
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 17
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two skew lines are parallel
- teacherAnswer: N

### bonus-18
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 18
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two parallel lines are coplanar
- teacherAnswer: A

### bonus-19
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 19
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: A line in the ceiling plane and a line in the floor plane are parallel
- teacherAnswer: S

### bonus-20
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 20
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two lines in the plane of the floor are skew
- teacherAnswer: N

### bonus-21
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 21
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If a line is parallel to a plane, a plane containing that line is parallel to the given plane
- teacherAnswer: S

### bonus-22
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 22
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two lines parallel to the same plane are parallel to each other
- teacherAnswer: S

### bonus-23
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 23
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two lines parallel to a third line are parallel
- teacherAnswer: A

### bonus-24
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 24
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two planes parallel to the same line are parallel
- teacherAnswer: S

### bonus-25
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 25
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Skew lines intersect
- teacherAnswer: N

### bonus-26
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 26
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two planes parallel to the same plane are parallel
- teacherAnswer: A

### bonus-27
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 27
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two lines perpendicular to a third line are parallel
- teacherAnswer: S

### bonus-28
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 28
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Two lines skew to a third line are skew to each other
- teacherAnswer: S

### bonus-29
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 29
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: Through a point outside a plane there is more than one line parallel to the plane
- teacherAnswer: A

### bonus-30
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 30
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If a line intersects one of two parallel lines, it intersects the other
- teacherAnswer: S

### bonus-31
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 31
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If the sides of two angles lie in parallel lines, the angles are congruent
- teacherAnswer: S

### bonus-32
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 32
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If line t is skew to m, there is a plane containing t parallel to m
- teacherAnswer: A

### bonus-33
- sheet: QZ (Binder tab: Bonus)
- teacherNo: SOURCE §5 out-of-scope 33
- srcFile: content/SOURCE.md §5 (Quizlet 254286132)
- stem: If m is skew to k, there is a line perpendicular to both
- teacherAnswer: A

---

## Sheet FAC — Kuta Software, Infinite Algebra 1, "Factoring Trinomials (a > 1)" (source/factoring.pdf; problems p.1–2, key p.3–4)

Instruction printed once: "Factor each completely." Kuta prints a true minus (U+2212) and superscript 2; both are kept. `expr` = the trinomial as printed (the `stem` for the app is "Factor each completely." + the expression), `key` = Kuta's answer line.

### fac-01
- sheet: FAC
- teacherNo: 1)
- srcFile: source/factoring.pdf p.1 #1 (key p.3)
- stem: Factor each completely. 3p² − 2p − 5
- expr: 3p² − 2p − 5
- key: (3p − 5)(p + 1)

### fac-02
- sheet: FAC
- teacherNo: 2)
- srcFile: source/factoring.pdf p.1 #2 (key p.3)
- stem: Factor each completely. 2n² + 3n − 9
- expr: 2n² + 3n − 9
- key: (2n − 3)(n + 3)

### fac-03
- sheet: FAC
- teacherNo: 3)
- srcFile: source/factoring.pdf p.1 #3 (key p.3)
- stem: Factor each completely. 3n² − 8n + 4
- expr: 3n² − 8n + 4
- key: (3n − 2)(n − 2)

### fac-04
- sheet: FAC
- teacherNo: 4)
- srcFile: source/factoring.pdf p.1 #4 (key p.3)
- stem: Factor each completely. 5n² + 19n + 12
- expr: 5n² + 19n + 12
- key: (5n + 4)(n + 3)

### fac-05
- sheet: FAC
- teacherNo: 5)
- srcFile: source/factoring.pdf p.1 #5 (key p.3)
- stem: Factor each completely. 2v² + 11v + 5
- expr: 2v² + 11v + 5
- key: (2v + 1)(v + 5)

### fac-06
- sheet: FAC
- teacherNo: 6)
- srcFile: source/factoring.pdf p.1 #6 (key p.3)
- stem: Factor each completely. 2n² + 5n + 2
- expr: 2n² + 5n + 2
- key: (2n + 1)(n + 2)

### fac-07
- sheet: FAC
- teacherNo: 7)
- srcFile: source/factoring.pdf p.1 #7 (key p.3)
- stem: Factor each completely. 7a² + 53a + 28
- expr: 7a² + 53a + 28
- key: (7a + 4)(a + 7)

### fac-08
- sheet: FAC
- teacherNo: 8)
- srcFile: source/factoring.pdf p.1 #8 (key p.3)
- stem: Factor each completely. 9k² + 66k + 21
- expr: 9k² + 66k + 21
- key: 3(3k + 1)(k + 7)

### fac-09
- sheet: FAC
- teacherNo: 9)
- srcFile: source/factoring.pdf p.2 #9 (key p.4)
- stem: Factor each completely. 15n² − 27n − 6
- expr: 15n² − 27n − 6
- key: 3(5n + 1)(n − 2)

### fac-10
- sheet: FAC
- teacherNo: 10)
- srcFile: source/factoring.pdf p.2 #10 (key p.4)
- stem: Factor each completely. 5x² − 18x + 9
- expr: 5x² − 18x + 9
- key: (5x − 3)(x − 3)

### fac-11
- sheet: FAC
- teacherNo: 11)
- srcFile: source/factoring.pdf p.2 #11 (key p.4)
- stem: Factor each completely. 4n² − 15n − 25
- expr: 4n² − 15n − 25
- key: (n − 5)(4n + 5)

### fac-12
- sheet: FAC
- teacherNo: 12)
- srcFile: source/factoring.pdf p.2 #12 (key p.4)
- stem: Factor each completely. 4x² − 35x + 49
- expr: 4x² − 35x + 49
- key: (x − 7)(4x − 7)

### fac-13
- sheet: FAC
- teacherNo: 13)
- srcFile: source/factoring.pdf p.2 #13 (key p.4)
- stem: Factor each completely. 4n² − 17n + 4
- expr: 4n² − 17n + 4
- key: (n − 4)(4n − 1)

### fac-14
- sheet: FAC
- teacherNo: 14)
- srcFile: source/factoring.pdf p.2 #14 (key p.4)
- stem: Factor each completely. 6x² + 7x − 49
- expr: 6x² + 7x − 49
- key: (3x − 7)(2x + 7)

### fac-15
- sheet: FAC
- teacherNo: 15)
- srcFile: source/factoring.pdf p.2 #15 (key p.4)
- stem: Factor each completely. 6x² + 37x + 6
- expr: 6x² + 37x + 6
- key: (x + 6)(6x + 1)

### fac-16
- sheet: FAC
- teacherNo: 16)
- srcFile: source/factoring.pdf p.2 #16 (key p.4)
- stem: Factor each completely. −6a² − 25a − 25
- expr: −6a² − 25a − 25
- key: −(2a + 5)(3a + 5)

### fac-17
- sheet: FAC
- teacherNo: 17)
- srcFile: source/factoring.pdf p.2 #17 (key p.4)
- stem: Factor each completely. 6n² + 5n − 6
- expr: 6n² + 5n − 6
- key: (2n + 3)(3n − 2)

### fac-18
- sheet: FAC
- teacherNo: 18)
- srcFile: source/factoring.pdf p.2 #18 (key p.4)
- stem: Factor each completely. 16b² + 60b − 100
- expr: 16b² + 60b − 100
- key: 4(b + 5)(4b − 5)

---

## Sheet ALG — named quadratics (SOURCE.md §7; no teacher sheet — these are the equations that arise in the Angles key)

### quad-01
- sheet: ALG
- teacherNo: SOURCE §7 example 1
- srcFile: content/SOURCE.md §7 (arises in source/angles-key.pdf p.2, problem 5)
- stem: Solve by factoring: x² + 9x + 8 = 0
- origin: SOURCE.md
- teacherAnswer: (x + 8)(x + 1) = 0 → x = −8, x = −1 (Angles key #5)

### quad-02
- sheet: ALG
- teacherNo: SOURCE §7 example 2
- srcFile: content/SOURCE.md §7 (arises in source/angles-key.pdf p.4, problem 10)
- stem: Solve by factoring: 2x² − 5x − 3 = 0
- origin: SOURCE.md
- teacherAnswer: (2x + 1)(x − 3) = 0 → x = −1/2, x = 3 (Angles key #10)

### quad-03
- sheet: ALG
- teacherNo: SOURCE §7 example 3
- srcFile: content/SOURCE.md §7 (arises in source/angles-key.pdf p.2, problem 4)
- stem: Solve by factoring: m² − 3m − 10 = 0
- origin: SOURCE.md
- teacherAnswer: (m − 5)(m + 2) = 0 → m = 5, m = −2 (Angles key #4)

---

## Sheet VOC — doc item 4 "Important vocabulary includes:" + notation + standard definitions + facts + classification

Verbatim from source/study-guide.html item 4 (three lines):
- "Point, line, plane, collinear, coplanar, segment, ray, opposite rays"
- "Angle, side, vertex, acute, straight, right, obtuse, angle bisector, complementary, supplementary, complement, supplement, adjacent, linear pair, vertical angles"
- "Also, understand proper notation (eg: how the notation for “line” and for “segment” differ), how to read it, how to use it"

The 23 terms are numbered in the doc's order. `term` is the doc's spelling (the doc capitalizes only the first word of each line; the app lowercases). `definition` is the standard definition from SOURCE.md §0 (the app's own wording — the doc gives none).

### voc-01
- sheet: VOC
- teacherNo: doc item 4, term 1
- srcFile: source/study-guide.html #4
- term: Point
- definition: a location, no size
- origin: term from the doc; definition SOURCE.md §0

### voc-02
- sheet: VOC
- teacherNo: doc item 4, term 2
- srcFile: source/study-guide.html #4
- term: line
- definition: straight, extends forever in both directions, contains infinitely many points
- origin: term from the doc; definition SOURCE.md §0

### voc-03
- sheet: VOC
- teacherNo: doc item 4, term 3
- srcFile: source/study-guide.html #4
- term: plane
- definition: flat surface extending forever in all directions
- origin: term from the doc; definition SOURCE.md §0

### voc-04
- sheet: VOC
- teacherNo: doc item 4, term 4
- srcFile: source/study-guide.html #4
- term: collinear
- definition: points on the same line
- origin: term from the doc; definition SOURCE.md §0

### voc-05
- sheet: VOC
- teacherNo: doc item 4, term 5
- srcFile: source/study-guide.html #4
- term: coplanar
- definition: points/lines in the same plane
- origin: term from the doc; definition SOURCE.md §0

### voc-06
- sheet: VOC
- teacherNo: doc item 4, term 6
- srcFile: source/study-guide.html #4
- term: segment
- definition: part of a line with two endpoints
- origin: term from the doc; definition SOURCE.md §0

### voc-07
- sheet: VOC
- teacherNo: doc item 4, term 7
- srcFile: source/study-guide.html #4
- term: ray
- definition: part of a line with one endpoint, extends forever one way
- origin: term from the doc; definition SOURCE.md §0

### voc-08
- sheet: VOC
- teacherNo: doc item 4, term 8
- srcFile: source/study-guide.html #4
- term: opposite rays
- definition: two rays with a common endpoint that form a line (e.g. ray FA and ray FD when F is between A and D)
- origin: term from the doc; definition SOURCE.md §0

### voc-09
- sheet: VOC
- teacherNo: doc item 4, term 9
- srcFile: source/study-guide.html #4
- term: Angle
- definition: two rays (sides) with a common endpoint (vertex)
- origin: term from the doc; definition SOURCE.md §0

### voc-10
- sheet: VOC
- teacherNo: doc item 4, term 10
- srcFile: source/study-guide.html #4
- term: side
- definition: one of the two rays that form an angle
- origin: term from the doc; definition derived from SOURCE.md §0 "Angle: two rays (sides) with a common endpoint (vertex)"

### voc-11
- sheet: VOC
- teacherNo: doc item 4, term 11
- srcFile: source/study-guide.html #4
- term: vertex
- definition: the common endpoint of the two rays of an angle
- origin: term from the doc; definition derived from SOURCE.md §0 "Angle: two rays (sides) with a common endpoint (vertex)"

### voc-12
- sheet: VOC
- teacherNo: doc item 4, term 12
- srcFile: source/study-guide.html #4
- term: acute
- definition: 0° < m < 90°
- origin: term from the doc; definition SOURCE.md §0

### voc-13
- sheet: VOC
- teacherNo: doc item 4, term 13
- srcFile: source/study-guide.html #4
- term: straight
- definition: exactly 180°
- origin: term from the doc; definition SOURCE.md §0

### voc-14
- sheet: VOC
- teacherNo: doc item 4, term 14
- srcFile: source/study-guide.html #4
- term: right
- definition: exactly 90°
- origin: term from the doc; definition SOURCE.md §0

### voc-15
- sheet: VOC
- teacherNo: doc item 4, term 15
- srcFile: source/study-guide.html #4
- term: obtuse
- definition: 90° < m < 180°
- origin: term from the doc; definition SOURCE.md §0

### voc-16
- sheet: VOC
- teacherNo: doc item 4, term 16
- srcFile: source/study-guide.html #4
- term: angle bisector
- definition: a ray that divides an angle into two congruent angles
- origin: term from the doc; definition SOURCE.md §0

### voc-17
- sheet: VOC
- teacherNo: doc item 4, term 17
- srcFile: source/study-guide.html #4
- term: complementary
- definition: two angles whose measures sum to 90°
- origin: term from the doc; definition SOURCE.md §0

### voc-18
- sheet: VOC
- teacherNo: doc item 4, term 18
- srcFile: source/study-guide.html #4
- term: supplementary
- definition: two angles whose measures sum to 180°
- origin: term from the doc; definition SOURCE.md §0

### voc-19
- sheet: VOC
- teacherNo: doc item 4, term 19
- srcFile: source/study-guide.html #4
- term: complement
- definition: Complement of x = 90 − x
- origin: term from the doc; definition SOURCE.md §0

### voc-20
- sheet: VOC
- teacherNo: doc item 4, term 20
- srcFile: source/study-guide.html #4
- term: supplement
- definition: Supplement of x = 180 − x
- origin: term from the doc; definition SOURCE.md §0

### voc-21
- sheet: VOC
- teacherNo: doc item 4, term 21
- srcFile: source/study-guide.html #4
- term: adjacent
- definition: two angles that share a vertex and a side but no interior points
- origin: term from the doc; definition SOURCE.md §0

### voc-22
- sheet: VOC
- teacherNo: doc item 4, term 22
- srcFile: source/study-guide.html #4
- term: linear pair
- definition: two adjacent angles whose non-common sides are opposite rays (they are supplementary)
- origin: term from the doc; definition SOURCE.md §0

### voc-23
- sheet: VOC
- teacherNo: doc item 4, term 23
- srcFile: source/study-guide.html #4
- term: vertical angles
- definition: two non-adjacent angles formed by two intersecting lines (they are congruent)
- origin: term from the doc; definition SOURCE.md §0

## Notation rules (not-01..09) — SOURCE.md §0 "Also NOTATION" bullets; the doc itself only says "understand proper notation (eg: how the notation for “line” and for “segment” differ), how to read it, how to use it"

### not-01
- sheet: VOC
- teacherNo: SOURCE §0 notation, line
- srcFile: content/SOURCE.md §0 (doc item 4 names the topic)
- stem: line AB: AB with a double-arrow over it (↔ overline). Extends forever both ways.
- origin: SOURCE.md
- canonical: {line AB}; unordered

### not-02
- sheet: VOC
- teacherNo: SOURCE §0 notation, segment
- srcFile: content/SOURCE.md §0
- stem: segment AB: AB with a plain bar over it. Two endpoints.
- origin: SOURCE.md
- canonical: {seg AB}; unordered

### not-03
- sheet: VOC
- teacherNo: SOURCE §0 notation, length
- srcFile: content/SOURCE.md §0
- stem: "AB" with no bar = the LENGTH of segment AB (a number).
- origin: SOURCE.md
- canonical: AB (no decoration); trap item: "length of AB" expects no bar

### not-04
- sheet: VOC
- teacherNo: SOURCE §0 notation, ray
- srcFile: content/SOURCE.md §0
- stem: ray AB: AB with an arrow over it pointing right; endpoint is the FIRST letter (A). Ray AB ≠ ray BA.
- origin: SOURCE.md
- canonical: {ray AB}; ordered (endpoint first); trap item: "ray with endpoint F through B" expects ray F B

### not-05
- sheet: VOC
- teacherNo: SOURCE §0 notation, opposite rays
- srcFile: content/SOURCE.md §0
- stem: opposite rays: two rays with a common endpoint that form a line (e.g. ray FA and ray FD when F is between A and D).
- origin: SOURCE.md
- canonical: {ray FA} and {ray FD}, F between A and D

### not-06
- sheet: VOC
- teacherNo: SOURCE §0 notation, angle
- srcFile: content/SOURCE.md §0
- stem: angle: ∠ABC — vertex is the MIDDLE letter (B).
- origin: SOURCE.md
- canonical: {ang ABC}; middle letter fixed, outer letters unordered

### not-07
- sheet: VOC
- teacherNo: SOURCE §0 notation, measure
- srcFile: content/SOURCE.md §0
- stem: m∠ABC = the measure (a number of degrees).
- origin: SOURCE.md
- canonical: {m ABC} is a number; {ang ABC} is the figure

### not-08
- sheet: VOC
- teacherNo: SOURCE §0 notation, congruent vs equal
- srcFile: content/SOURCE.md §0
- stem: ∠ABC ≅ ∠DEF means congruent (same measure); m∠ABC = m∠DEF means measures equal.
- origin: SOURCE.md
- canonical: ≅ between angles/segments, = between measures/lengths

### not-09
- sheet: VOC
- teacherNo: SOURCE §0 notation, plane
- srcFile: content/SOURCE.md §0
- stem: plane: named by a capital script letter or by 3 non-collinear points (plane ABC).
- origin: SOURCE.md
- canonical: plane ABC (three non-collinear points, unordered) or a single script capital

## Standard definitions (def-01..14) — SOURCE.md §0 "Standard definitions (textbook-standard, use these)", one per bullet, verbatim

### def-01
- sheet: VOC
- teacherNo: SOURCE §0 definition, point
- srcFile: content/SOURCE.md §0
- stem: Point: a location, no size.
- origin: SOURCE.md

### def-02
- sheet: VOC
- teacherNo: SOURCE §0 definition, line
- srcFile: content/SOURCE.md §0
- stem: Line: straight, extends forever in both directions, contains infinitely many points; through any two points there is exactly one line.
- origin: SOURCE.md

### def-03
- sheet: VOC
- teacherNo: SOURCE §0 definition, plane
- srcFile: content/SOURCE.md §0
- stem: Plane: flat surface extending forever in all directions; through any three non-collinear points there is exactly one plane.
- origin: SOURCE.md

### def-04
- sheet: VOC
- teacherNo: SOURCE §0 definition, collinear
- srcFile: content/SOURCE.md §0
- stem: Collinear: points on the same line.
- origin: SOURCE.md

### def-05
- sheet: VOC
- teacherNo: SOURCE §0 definition, coplanar
- srcFile: content/SOURCE.md §0
- stem: Coplanar: points/lines in the same plane.
- origin: SOURCE.md

### def-06
- sheet: VOC
- teacherNo: SOURCE §0 definition, segment
- srcFile: content/SOURCE.md §0
- stem: Segment: part of a line with two endpoints.
- origin: SOURCE.md

### def-07
- sheet: VOC
- teacherNo: SOURCE §0 definition, ray
- srcFile: content/SOURCE.md §0
- stem: Ray: part of a line with one endpoint, extends forever one way.
- origin: SOURCE.md

### def-08
- sheet: VOC
- teacherNo: SOURCE §0 definition, angle
- srcFile: content/SOURCE.md §0
- stem: Angle: two rays (sides) with a common endpoint (vertex).
- origin: SOURCE.md

### def-09
- sheet: VOC
- teacherNo: SOURCE §0 definition, angle bisector
- srcFile: content/SOURCE.md §0
- stem: Angle bisector: a ray that divides an angle into two congruent angles.
- origin: SOURCE.md

### def-10
- sheet: VOC
- teacherNo: SOURCE §0 definition, complementary
- srcFile: content/SOURCE.md §0
- stem: Complementary: two angles whose measures sum to 90°. Complement of x = 90 − x.
- origin: SOURCE.md

### def-11
- sheet: VOC
- teacherNo: SOURCE §0 definition, supplementary
- srcFile: content/SOURCE.md §0
- stem: Supplementary: two angles whose measures sum to 180°. Supplement of x = 180 − x.
- origin: SOURCE.md

### def-12
- sheet: VOC
- teacherNo: SOURCE §0 definition, adjacent
- srcFile: content/SOURCE.md §0
- stem: Adjacent angles: two angles that share a vertex and a side but no interior points.
- origin: SOURCE.md

### def-13
- sheet: VOC
- teacherNo: SOURCE §0 definition, linear pair
- srcFile: content/SOURCE.md §0
- stem: Linear pair: two adjacent angles whose non-common sides are opposite rays (they are supplementary).
- origin: SOURCE.md

### def-14
- sheet: VOC
- teacherNo: SOURCE §0 definition, vertical angles
- srcFile: content/SOURCE.md §0
- stem: Vertical angles: two non-adjacent angles formed by two intersecting lines (they are congruent).
- origin: SOURCE.md

## Intersection facts and the two "exactly one" postulates (fact-01..05) — SOURCE.md §0

### fact-01
- sheet: VOC
- teacherNo: SOURCE §0 intersection fact 1
- srcFile: content/SOURCE.md §0
- stem: two distinct lines intersect in at most one point
- origin: SOURCE.md

### fact-02
- sheet: VOC
- teacherNo: SOURCE §0 intersection fact 2
- srcFile: content/SOURCE.md §0
- stem: two distinct planes intersect in a line
- origin: SOURCE.md

### fact-03
- sheet: VOC
- teacherNo: SOURCE §0 intersection fact 3
- srcFile: content/SOURCE.md §0
- stem: a line and a plane intersect in a point, or the line lies in the plane, or they don't intersect
- origin: SOURCE.md

### fact-04
- sheet: VOC
- teacherNo: SOURCE §0 line definition, postulate
- srcFile: content/SOURCE.md §0
- stem: through any two points there is exactly one line
- origin: SOURCE.md

### fact-05
- sheet: VOC
- teacherNo: SOURCE §0 plane definition, postulate
- srcFile: content/SOURCE.md §0
- stem: through any three non-collinear points there is exactly one plane
- origin: SOURCE.md

## Angle classification (cls-01..04) — SOURCE.md §0

### cls-01
- sheet: VOC
- teacherNo: SOURCE §0 classification, acute
- srcFile: content/SOURCE.md §0
- stem: Acute: 0° < m < 90°.
- origin: SOURCE.md

### cls-02
- sheet: VOC
- teacherNo: SOURCE §0 classification, right
- srcFile: content/SOURCE.md §0
- stem: Right: exactly 90°.
- origin: SOURCE.md

### cls-03
- sheet: VOC
- teacherNo: SOURCE §0 classification, obtuse
- srcFile: content/SOURCE.md §0
- stem: Obtuse: 90° < m < 180°.
- origin: SOURCE.md

### cls-04
- sheet: VOC
- teacherNo: SOURCE §0 classification, straight
- srcFile: content/SOURCE.md §0
- stem: Straight: exactly 180°.
- origin: SOURCE.md

---

## Not transcribed (generated, no original): family tiles `fam-sys`, `fam-quad-a1`, `fam-quad-a2`, `fam-quad-ctx` and every `T-*` template (S2 §7 rows).

## Index — 197 blocks

- AP-1 (7): ang-wu-1, ang-wu-2, ang-wu-3, ang-wu-4, ang-wu-5, ang-02, ang-03
- AP-2 (2): ang-04, ang-05
- AP-3 (4): ang-06, ang-07, ang-08, ang-09
- AP-4 (2): ang-10, ang-11
- DOC (3): doc-05, doc-06, doc-07
- WP (16): wp-01 … wp-16
- ASN (36): asn-01 … asn-36
- QZ (18): qz-01 … qz-18
- Bonus (33): bonus-01 … bonus-33
- FAC (18): fac-01 … fac-18
- ALG (3): quad-01, quad-02, quad-03
- VOC (55): voc-01 … voc-23, not-01 … not-09, def-01 … def-14, fact-01 … fact-05, cls-01 … cls-04
