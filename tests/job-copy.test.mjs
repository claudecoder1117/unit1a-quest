// tests/job-copy.test.mjs — J12, the VOICE lint. COMPOSED-GAME.md G6 "How it stays dry" and G11.
//
// G6 makes exactly one promise about the writing: "Enforced by a lint test over the string tables:
// no exclamation marks; no second-person praise; no emoji; numbers first; a miss names the make, the
// tell and the number and stops." G11 adds the two sentences that were written in a parent's voice
// and killed by name (G12 #35), and G12 #33 pins the rank ladder to the number it is.
//
// THE CORPUS. Every string the layer can print lives in `site/data/job.js` — literal strings and
// template functions both — because every other file in the layer imports them (J1 §7, J3 §7, J5c
// §7, J6 §7 all say so in their notes). So the corpus is: every reachable string, plus every
// template rendered against four stubs (a symbolic one that names each field, a realistic one built
// from G6's own worked lines, and 1 / null so the `?? '—'` and `x ? … : …` branches also render).
// That is ~490 strings, and the seven rules below run over all of them.
//
// A SECOND, NARROWER SWEEP runs over the raw source of the game layer's own files (`data/job.js`,
// `js/job/*.js`, `js/screens/job.js`) for the banned phrases and for emoji, because a string composed
// locally in a screen would not be in the corpus. It is deliberately NOT run over `home.js`,
// `stats.js` or `settings.js`: those are study-layer screens this ticket does not own, and the
// trophy glyph in `stats.js` is COMPOSED's product, not the game's.
//
// WHAT THIS FILE DOES NOT DO: it does not re-assert the EV-max ban (Global law 6) — `job-call.test.mjs`
// §10 owns that grep and already covers every `COPY` template.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { read, listFiles, ROOT } from './_helpers.mjs';

const JOB = await import('../site/data/job.js');
const { COPY, RANKS, WING_IDS, WING_OF_SKILL } = JOB;

/* ================================================================================================
   The corpus
   ================================================================================================ */

/**
 * Realistic values for every field name any template destructures, taken from G6's own printed
 * lines wherever G6 prints one. A stub that answers `1` to everything renders a line that is
 * syntactically real but semantically meaningless; the rival-line rule below needs the real thing.
 */
const REAL = Object.freeze({
  loose: 40, chain: 4, credit: 6.4, w: '0.96', attempt: 2, crew: 'STEADY', rho: '0.70',
  make: 'FAC2', name: 'Factoring a > 1', tell: 'dropped-gcf', tag: 'dropped-gcf',
  bagged: 118, fee: 13, chainBefore: 4, amount: 118, gross: 105, shared: 5, posted: 41,
  wing: 'WORDS', tokens: 'RECALL 2 (×1.50) · WORDS 1 (guarded, ×0.55) · FIGURES 0',
  n: 2, mult: '1.50', guarded: true, grade: 4, gradeLabel: 'grade 1', hits: 4, of: 10, q: '0.43',
  rating: '7.12', rank: 'Called 3', thinking: '7:00', deciding: '5:29', decisions: 24,
  did: 'bagged', said: 'push', qStar: '0.49', qHat: '0.62', cost: 31,
  envelope: 6, called: 85, evMax: 70, contracts: 3, draft: 2, locks: 8,
  readiness: 89, due: 0, minutes: 30, ends: '22:34', left: 4, cold: 3, from: 'B',
  shape: 'JOB', targets: 10, split: 48, jobs: 5, projection: 48, idle: 4, dues: 9,
  at: '21:45', N: 50, id: 'A', label: 'VOC', review: false,
});

const proxy = (get) => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? get(k) : undefined) });
/** the realistic stub: G6's own values where it has them, a named placeholder everywhere else */
const stubReal = () => proxy((k) => (k in REAL ? REAL[k] : `⟪${k}⟫`));
/**
 * Six shapes, so both branches of every ternary and every `?? '—'` render at least once. The five
 * after the first deliberately IGNORE `REAL`: a stub that always answers the realistic value renders
 * one string per template and the falsy branch of `tell ? … : ''` is never seen.
 */
const STUBS = [
  stubReal,
  () => proxy((k) => `⟪${k}⟫`),
  () => proxy(() => 1),
  () => proxy(() => 0),
  () => proxy(() => null),
  () => proxy(() => ''),
];

/** every string `data/job.js` can produce, with the export path it came from */
function buildCorpus() {
  const out = [];
  const seen = new Set();
  const push = (path, value) => {
    const s = String(value);
    const key = `${path}\u0000${s}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ path, s });
  };
  const walk = (node, path) => {
    if (typeof node === 'string') return push(path, node);
    if (typeof node === 'function') {
      let rendered = 0;
      for (const mk of STUBS) {
        try { push(`${path}()`, node(mk())); rendered++; } catch { /* a shape the other stubs cover */ }
      }
      assert.ok(rendered > 0, `${path} is a template that renders against no stub`);
      return;
    }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  for (const [k, v] of Object.entries(JOB)) walk(v, k);
  return out;
}

const CORPUS = buildCorpus();
/** just the copy table, which is where a voice defect actually lands */
const COPY_LINES = CORPUS.filter((e) => e.path.startsWith('COPY.'));

/**
 * The files that are the game layer and nothing else — swept WHOLE (code AND comments) by the emoji,
 * banned-phrase and deleted-costume rules in §§1-5. `screens/job.js` is here because it is the
 * layer's own screen; the four SHARED prose screens are not, and that boundary was measured at
 * integration rather than assumed.
 *
 * `notes/repair-meta.md` Request 5 and `notes/repair-week.md` Request 2 both asked the `tests` lane
 * to add `home.js`, `settings.js`, `stats.js` and `run.js` to this list; `notes/repair-guard.md` R14
 * said the narrower split is the right one. R14 wins, and here is the measurement — with all four
 * added, the three whole-file rules fail on three hits and not one of them is a defect:
 *
 *   · `screens/stats.js:667`  `🏆`, the trophy-list mark. G6 scopes the no-emoji rule to *"the
 *     string tables"* and G8's J12 row to *"no string in `data/job.js`"*; the mark is the STUDY
 *     layer's own trophy panel, named in neither authority, and `settings.game = false` has to
 *     leave that panel byte-identical to COMPOSED. Out of the rule's published scope.
 *   · `screens/run.js:1414`  a comment quoting the banned phrase in order to STATE the rule
 *     (*G6: the app never says …*). A whole-file sweep cannot tell a prohibition from a violation.
 *   · `screens/run.js:109, :112, :721`  "timed-block runner", "run.js's own runner" — the English
 *     word, matched by the case-insensitive costume regex that bans the deleted rank name `Runner`.
 *
 * The four screens ARE linted, by §10's `PROSE_SOURCES` — a lexer sweep over their own string
 * literals, which is what catches a false sentence in a screen without reading its comments. That
 * is the instrument this request actually wanted, and it landed in round 3.
 */
const LAYER_SOURCES = Object.freeze([
  'site/data/job.js',
  'site/js/job/econ.js', 'site/js/job/call.js', 'site/js/job/guard.js', 'site/js/job/crew.js',
  'site/js/job/board.js', 'site/js/job/state.js', 'site/js/job/index.js',
  'site/js/screens/job.js',
]);

/** report every offender, not the first — a lint that names one defect per run is a slow lint */
const offendersIn = (entries, hit) => entries.flatMap(({ path, s }) => {
  const found = hit(s);
  return found ? [`${path} → ${JSON.stringify(s)}  (${found})`] : [];
});

describe('J12 — the corpus is the whole string table', () => {
  test('every COPY entry is a template function, and the table is the size G6 describes', () => {
    for (const [k, v] of Object.entries(COPY)) assert.equal(typeof v, 'function', `COPY.${k} must be a template function`);
    assert.ok(Object.keys(COPY).length >= 45, `expected the full copy table, got ${Object.keys(COPY).length}`);
  });

  test('the corpus covers every reachable string', () => {
    assert.ok(CORPUS.length > 300, `corpus is ${CORPUS.length} strings`);
    assert.ok(COPY_LINES.length > 90, `copy lines are ${COPY_LINES.length}`);
  });
});

/* ================================================================================================
   1. No exclamation mark  (G6 "no exclamation marks")
   ================================================================================================ */

describe('J12 — no exclamation mark anywhere in data/job.js', () => {
  test('zero, in every string and every rendered template', () => {
    const bad = offendersIn(CORPUS, (s) => (s.includes('!') ? '!' : null));
    assert.deepEqual(bad, [], 'the layer never raises its voice');
  });
});

/* ================================================================================================
   2. No emoji  (G6 "no emoji")
   ================================================================================================ */

describe('J12 — no emoji', () => {
  // Emoji_Presentation (a character that renders as emoji WITHOUT a selector), U+FE0F (the selector
  // that forces emoji presentation on a text character), ZWJ (sequence glue) and regional
  // indicators. Deliberately NOT \p{Extended_Pictographic}: that property also covers ↔ ♥ ✓ ★, which
  // are typography the product already uses, and a lint that bans the arrow in `chain 4 → 0` is a
  // broken lint.
  const EMOJI = /[\p{Emoji_Presentation}\p{Regional_Indicator}\uFE0F\u200D]/u;

  test('the regex it uses does not fire on the layer’s own glyphs', () => {
    for (const g of ['·', '×', '→', '≥', '−', '▮', '▯', '⟨', '⟩', 'ρ', '↔', '—', '✓']) {
      assert.equal(EMOJI.test(g), false, `${g} is typography, not emoji`);
    }
    // written as escapes so THIS file stays free of the thing it bans
    for (const g of ['\u{1F3C6}', '\u{1F389}', '\u{1F525}', '\u2705', '\u26A0\uFE0F']) {
      assert.equal(EMOJI.test(g), true, `${JSON.stringify(g)} is emoji`);
    }
  });

  test('no string in data/job.js contains one', () => {
    assert.deepEqual(offendersIn(CORPUS, (s) => (EMOJI.test(s) ? 'emoji' : null)), []);
  });

  test('and no file of the game layer contains one, in code or in comment', () => {
    const bad = LAYER_SOURCES.flatMap((f) => {
      const m = read(f).match(new RegExp(EMOJI.source, 'gu'));
      return m ? [`${f} → ${[...new Set(m)].join(' ')}`] : [];
    });
    assert.deepEqual(bad, []);
  });

  test('the chain ticks are geometric shapes kept OUT of the copy strings (G6)', () => {
    assert.equal(JOB.GLYPHS.chainFilled, '▮');
    assert.equal(JOB.GLYPHS.chainEmpty, '▯');
    const inCopy = COPY_LINES.filter((e) => /[▮▯]/.test(e.s));
    assert.deepEqual(inCopy.map((e) => e.path), [], 'a tick glyph belongs to GLYPHS, not to a sentence');
  });
});

/* ================================================================================================
   3. No first-person pronoun  (the app is a board, not a narrator)
   ================================================================================================ */

describe('J12 — no first-person pronoun', () => {
  const FIRST_PERSON = [
    'i', "i'm", "i’m", "i'll", "i’ll", "i've", "i’ve", "i'd", "i’d",
    'me', 'my', 'mine', 'myself',
    'we', "we're", "we’re", "we've", "we’ve", "we'll", "we’ll", "we'd", "we’d",
    'us', 'our', 'ours', 'ourselves', "let's", "let’s",
  ];
  const words = (s) => s.toLowerCase().split(/[^a-z'’]+/).filter(Boolean);
  const hit = (s) => { const w = words(s).filter((x) => FIRST_PERSON.includes(x)); return w.length ? w.join(' ') : null; };

  test('the detector works', () => {
    assert.equal(hit('I bagged it'), 'i');
    assert.equal(hit("let's go"), "let's");
    assert.equal(hit('your tokens'), null);
    assert.equal(hit('minutes'), null, 'a word that merely contains "mine" is not a pronoun');
    assert.equal(hit('wings on the board'), null);
  });

  test('none in data/job.js', () => {
    assert.deepEqual(offendersIn(CORPUS, hit), []);
  });
});

/* ================================================================================================
   4. No praise word  (G6 "no second-person praise")
   ================================================================================================ */

describe('J12 — no praise word', () => {
  const PRAISE = [
    'great', 'awesome', 'amazing', 'excellent', 'perfect', 'brilliant', 'fantastic', 'wonderful',
    'superb', 'incredible', 'outstanding', 'impressive', 'bravo', 'congratulations', 'congrats',
    'nice', 'wow', 'yay', 'woohoo', 'hooray', 'epic', 'legend', 'legendary', 'superstar', 'rockstar',
    'genius', 'champ', 'champion', 'proud', 'crushed', 'nailed', 'smashed', 'flawless', 'stellar',
    'terrific', 'marvellous', 'marvelous', 'splendid', 'magnificent', 'unstoppable', 'beast',
  ];
  const PRAISE_RE = new RegExp(`\\b(?:${PRAISE.join('|')})\\b`, 'i');

  test('the detector works and does not fire on the layer’s vocabulary', () => {
    assert.equal(PRAISE_RE.test('nice work'), true);
    assert.equal(PRAISE_RE.test('when page.bossReady(save) fires'), false, '"fires" is not "fire"');
    assert.equal(PRAISE_RE.test('clean (first try, 0 hints)'), false, '"clean" is a rung, not a compliment');
    assert.equal(PRAISE_RE.test('s = 100, bucket +1, Gold'), false, 'Gold is a rarity tier');
    assert.equal(PRAISE_RE.test('Clean Getaway'), false, 'a ledger stamp is a noun');
  });

  test('none in data/job.js', () => {
    assert.deepEqual(offendersIn(CORPUS, (s) => (PRAISE_RE.test(s) ? s.match(PRAISE_RE)[0] : null)), []);
  });

  test('a miss names the make, the tell and the number and stops (G6)', () => {
    const line = COPY.miss({ make: 'FAC2', tell: 'dropped-gcf', loose: 19, chain: 0 });
    assert.equal(line, 'FAC2 · tell: dropped-gcf · −19 loose · chain 0');
    assert.equal(/[a-z]{4,}/i.test(line.replace(/FAC2|dropped-gcf|tell|loose|chain/g, '')), false,
      'nothing else is said');
  });
});

/* ================================================================================================
   5. No sentence in a parent's voice  (G12 #35 — the two killed lines are pinned by name)
   ================================================================================================ */

describe('J12 — no sentence in a parent’s voice', () => {
  /**
   * The pinned list. The first two are the sentences G12 #35 deleted by name; the rest are the
   * register they belonged to. Substring match, case-insensitive, apostrophe-agnostic.
   */
  const BANNED_PHRASES = Object.freeze([
    'nothing here beats sleep',          // G12 #35, killed → `Board quiet · Readiness 89 · 0 due`
    'and then you sleep',                // G12 #35, killed → `No board tonight · Night Before · …`
    'nothing beats sleep',
    'beats sleep',
    'get some sleep', 'get some rest', 'time for bed', 'go to bed', 'off to bed', 'bedtime',
    'early night', 'sleep on it', 'sleep well', 'good night', 'goodnight',
    'you should', 'you ought', 'you need to', 'you must', 'you really should',
    'make sure', 'be sure to', 'remember to', "don't forget", 'dont forget',
    "don't worry", 'dont worry', 'no pressure', 'take a break', 'have a break',
    'you deserve', "you've earned", 'youve earned', 'be proud', 'proud of you',
    'well done', 'good job', 'nice work', 'great work', 'keep it up', 'keep going strong',
    'you got this', 'you can do it', 'do your best', 'try your best', 'give it your best',
    'good luck', 'take care', 'look after yourself', 'have a good', 'have fun',
    "that's ok", 'thats ok', "it's ok", 'its okay', "don't be", 'chin up',
    // G11's "one more" is the retention prompt, not the phrase: `One more token on WORDS` is an
    // aria-label on the token press and is exactly the kind of literal instruction the layer wants.
    'one more?', 'just one more', 'one more job', 'one more board', 'another one?', 'come back',
  ]);
  const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'");
  const hit = (s) => { const n = norm(s); return BANNED_PHRASES.find((p) => n.includes(norm(p))) ?? null; };

  test('the list pins the two sentences G12 #35 killed', () => {
    assert.ok(BANNED_PHRASES.includes('nothing here beats sleep'));
    assert.ok(BANNED_PHRASES.includes('and then you sleep'));
    assert.ok(BANNED_PHRASES.length >= 40, `the list is ${BANNED_PHRASES.length} phrases`);
    assert.equal(hit('Nothing here beats sleep.'), 'nothing here beats sleep');
    assert.equal(hit('Night Before is 30 minutes and then you sleep.'), 'and then you sleep');
  });

  test('none in data/job.js', () => {
    assert.deepEqual(offendersIn(CORPUS, hit), []);
  });

  test('none anywhere in the game layer’s source, comments included', () => {
    const bad = LAYER_SOURCES.flatMap((f) => { const h = hit(read(f)); return h ? [`${f} → ${h}`] : []; });
    assert.deepEqual(bad, []);
  });

  test('the two replacements G12 #35 shipped are what the layer prints instead', () => {
    assert.equal(COPY.quiet({ readiness: 89, due: 0 }), 'Board quiet · Readiness 89 · 0 due');
    assert.equal(COPY.night({ minutes: 30, ends: '21:12' }),
      'No board tonight · Night Before · ~30 min · ends 21:12');
    assert.equal(COPY.keepGoing(), 'keep going anyway', 'G12 #35: "[ take a board anyway ]" stays');
  });

  test('no line is an imperative of care: every sentence is a state or a number', () => {
    // A line may address the student ("your tokens", "you called 85") but may never instruct them
    // about their life. `Go.` is the one imperative in the layer and it is the Test Morning button.
    const CARE = /\b(?:sleep|rest|bed|relax|breathe|calm down|cheer up|feel better)\b/i;
    assert.deepEqual(offendersIn(CORPUS, (s) => (CARE.test(s) ? s.match(CARE)[0] : null)), []);
    assert.equal(COPY.morning(), 'Go.');
  });
});

/* ================================================================================================
   6. The rank ladder is the number, printed as a word  (G12 #33, G11)
   ================================================================================================ */

describe('J12 — the rank ladder strings are exactly "Called 1".."Called 5"', () => {
  test('RANKS carries the five, in order, and nothing else', () => {
    assert.deepEqual(RANKS.map((r) => r.name), ['Called 1', 'Called 2', 'Called 3', 'Called 4', 'Called 5']);
    assert.equal(RANKS.length, 5);
    for (const r of RANKS) assert.equal(r.name, `Called ${r.rank}`, 'the word IS the number');
  });

  test('`call.rankOf(rank).name` and `call.rankNameFor(rating)` both return one of the five', async () => {
    const { rankNameFor, rankOf, rankFor } = await import('../site/js/job/call.js');
    // TWO different arguments, and the difference has bitten once already: `rankOf` takes the 1–5
    // RANK, `rankNameFor` takes the 0.0–10.0 RATING. `screens/job.js` was passing the rank to
    // `rankNameFor`, so a debrief at rating 7.12 (rank 3) printed `Called 1`. Fixed; pinned here.
    for (let i = 1; i <= 5; i++) assert.equal(rankOf(i).name, `Called ${i}`);
    for (const rating of [0, 4.99, 5.0, 6.4, 6.5, 7.6, 7.7, 8.8, 8.9, 10]) {
      assert.equal(rankNameFor(rating), `Called ${rankFor(rating)}`, `rating ${rating}`);
    }
    assert.equal(rankNameFor(7.12), 'Called 3');
    assert.equal(rankOf(3).name, 'Called 3');
    assert.notEqual(rankNameFor(3), 'Called 3', 'the two functions really do take different arguments');
  });

  test('the debrief’s walk line prints the rank word that matches its own rating', () => {
    const src = read('site/js/screens/job.js');
    assert.match(src, /rank:\s*callMod\.rankOf\(/, 'the debrief must name the rank from the RANK');
    assert.equal(/rankNameFor\(\s*num\(\s*d\.rank/.test(src), false, 'not from the rank read as a rating');
  });

  test('the crime-crew ladder G12 #33 deleted is not resurrected anywhere in the layer', () => {
    // "Ghost" is deliberately NOT on this list: COMPOSED's same-seed ghost is a study-layer feature
    // and the word is still the product's. The three that were only ever rank names are.
    const COSTUME = /\b(?:Runner|Wheelman|Boxman)\b/i;
    const bad = LAYER_SOURCES.flatMap((f) => (COSTUME.test(read(f)) ? [f] : []));
    assert.deepEqual(bad, []);
    assert.deepEqual(offendersIn(CORPUS, (s) => (COSTUME.test(s) ? s.match(COSTUME)[0] : null)), []);
  });
});

/* ================================================================================================
   7. Every rival line is a number or a math object  (G6, G11 "a rival that taunts, speaks or has a
      face" is rejected; the Guard is a bar chart of the student's own habits)
   ================================================================================================ */

describe('J12 — every rival line is a number or a math object', () => {
  /**
   * Derived, not hand-listed, so a NEW rival line cannot slip past the lint. Matched on camelCase
   * SEGMENTS rather than as a substring, because `envelope` contains `elo` and an envelope is not
   * the rival.
   */
  const RIVAL_WORDS = new Set(['guard', 'vault', 'house', 'elo', 'rival']);
  const segmentsOf = (k) => k.split(/(?=[A-Z])/).map((s) => s.toLowerCase());
  const RIVAL_KEYS = Object.keys(COPY).filter((k) => segmentsOf(k).some((s) => RIVAL_WORDS.has(s))).sort();

  /** the only words a rival line may contain: labels and operators, no verb of speech, no adjective */
  const RIVAL_LABELS = Object.freeze([
    'guard', 'guarded', 'tokens', 'your', 'no', 'data', 'uniform', 'wings', 'on', 'the', 'board',
    'grade', 'last', 'crack', 'breaks', 'even', 'at',
  ]);
  const SPEECH = Object.freeze([
    'says', 'said', 'taunts', 'laughs', 'mocks', 'warns', 'dares', 'challenges', 'waiting',
    'watching', 'wins', 'beats', 'crushes', 'ready', 'coming', 'knows', 'wants', 'thinks', 'hates',
  ]);
  const IDENTS = new Set([...WING_IDS, ...Object.keys(WING_OF_SKILL)].map((x) => x.toLowerCase()));

  const strip = (t) => t.replace(/^[^\p{L}\p{N}×÷≥≤−+/*^%.]+|[^\p{L}\p{N}×÷≥≤−+/*^%]+$/gu, '');
  const isNumberOrMath = (t) => /\d/.test(t) || /^[×÷≥≤−+/*^%]/u.test(t);

  test('the rival lines are the five the guard and the vault print', () => {
    assert.deepEqual(RIVAL_KEYS, ['guard', 'guardColdStart', 'guardSupport', 'guardToken', 'vault']);
  });

  test('the allowlist is labels and operators only — no praise, no verb of speech', () => {
    for (const w of RIVAL_LABELS) {
      assert.equal(SPEECH.includes(w), false, `"${w}" is a verb of speech`);
      assert.equal(/^(great|nice|awesome|amazing|perfect)$/.test(w), false, `"${w}" is praise`);
    }
    assert.ok(RIVAL_LABELS.length <= 20, 'a rival line that needs twenty labels is a sentence');
  });

  test('each one carries a number, and every word in it is a label, an id, or an operator', () => {
    // Measured on the REALISTIC stub, because that is the line the student reads. The symbolic stub
    // renders `⟪n⟫` where the number goes, so "it carries a number" is not decidable on it; the
    // symbolic renders are covered by the no-speech test below instead.
    const bad = [];
    const words = [];
    for (const k of RIVAL_KEYS) {
      const line = String(COPY[k](stubReal()));
      if (!/\d/.test(line)) bad.push(`COPY.${k} → ${line}  (no number)`);
      for (const raw of line.split(/[\s·]+/)) {
        const t = strip(raw);
        if (!t) continue;
        const low = t.toLowerCase();
        if (isNumberOrMath(t)) continue;
        words.push(low);
        if (RIVAL_LABELS.includes(low) || IDENTS.has(low)) continue;
        bad.push(`COPY.${k} → ${line}  (word: ${t})`);
      }
    }
    assert.deepEqual(bad, []);
    // and the whole rival vocabulary is small: five lines, seventeen distinct words, no sentence
    assert.ok(new Set(words).size <= RIVAL_LABELS.length + WING_IDS.length + 2,
      `the rival speaks ${new Set(words).size} distinct words: ${[...new Set(words)].join(' ')}`);
  });

  test('no rival line speaks, and the guard is printed as its own distribution', () => {
    const SPEECH_RE = new RegExp(`\\b(?:${SPEECH.join('|')})\\b`, 'i');
    for (const k of RIVAL_KEYS) {
      for (const mk of STUBS) {
        let line; try { line = String(COPY[k](mk())); } catch { continue; }
        assert.equal(SPEECH_RE.test(line), false, `COPY.${k} → ${line}`);
      }
    }
    assert.equal(COPY.guard({ wing: 'WORDS', tokens: 'RECALL 2 · WORDS 1 (×0.60) · FIGURES 0' }),
      'GUARD: WORDS.  your tokens: RECALL 2 · WORDS 1 (×0.60) · FIGURES 0');
    assert.equal(COPY.guardColdStart({ n: 3 }), 'no data — uniform 1/3');
    assert.equal(COPY.vault({ make: 'FIG-ALG', grade: 4, hits: 4, of: 10, q: '0.43' }),
      'FIG-ALG grade 4 · your last 10: 4/10 · crack breaks even at 0.43');
  });
});

/* ================================================================================================
   8. One copy table  (J5 §7 asked for these two homes; the strings must not drift when board.js
      switches to them)
   ================================================================================================ */

describe('J12 — the board’s two locally-composed strings now have a home in COPY', () => {
  test('COPY.contractRow reproduces job/board.js’s row byte-for-byte', () => {
    assert.equal(
      COPY.contractRow({ id: 'A', label: 'VOC', locks: 4, cold: true, gradeLabel: 'grade 1', posted: 30, minutes: '2.0', wing: 'RECALL' }),
      'A  VOC      · 4 cold locks · grade 1 · posted 30 · ~2.0 min · RECALL');
    assert.equal(
      COPY.contractRow({ id: 'C', label: 'FAC2', locks: 2, cold: false, gradeLabel: 'grade 2', posted: 45, minutes: '3.0', wing: null }),
      'C  FAC2     · 2 locks · grade 2 · posted 45 · ~3.0 min · —');
  });

  test('COPY.postedFlat is the no-overlap half of COPY.postedNet', () => {
    assert.equal(COPY.postedFlat({ posted: 100 }), 'posted 100');
    assert.equal(COPY.postedNet({ gross: 105, shared: 5 }), 'posted 100 (−5 shared)'.replace('100', '105'));
    assert.equal(COPY.postedNet({ gross: 105, shared: 5 }), 'posted 105 (−5 shared)');
  });

  test('the week’s two remaining home.js lines have a home too', () => {
    assert.equal(COPY.reviewBoard(), 'REVIEW BOARD · every contract is dues · no vault · no guard · flat ladder');
    assert.equal(COPY.schoolWindow(), 'School window · RUN only · Mon–Fri 07:00–14:15');
    assert.equal(COPY.boardTitle({ review: true }), 'REVIEW BOARD');
    assert.equal(COPY.boardTitle({ review: false }), "Tonight's Board");
  });

  test('every one of them obeys the same seven rules as the rest of the table', () => {
    const added = ['contractRow', 'postedFlat', 'reviewBoard', 'schoolWindow', 'boardTitle'];
    const lines = COPY_LINES.filter((e) => added.some((k) => e.path === `COPY.${k}()`));
    assert.ok(lines.length >= added.length, `${lines.length} rendered lines for ${added.length} templates`);
    for (const { path, s } of lines) {
      assert.equal(s.includes('!'), false, path);
      assert.equal(/[\p{Emoji_Presentation}\uFE0F\u200D]/u.test(s), false, path);
    }
  });
});

/* ================================================================================================
   9. Numbers first  (G6) — the shape of the lines G6 prints verbatim
   ================================================================================================ */

describe('J12 — numbers first', () => {
  test('G6’s worked lines reproduce from the copy table', () => {
    /* `· weight 0.96`, not `×0.96` (round 3 verification, player-feel, MAJOR). `credit` is fed the
       MEASURED rating move by the entry's one caller and `Δrating = 2·w·c/N` already contains `w`,
       so the `×` asserted a product that is no quantity in the system. The entry moved; this pin
       moves with it. COMPOSED-GAME.md G6's copy table carries the same row — doc lane, filed in
       notes/repair-screen.md. */
    assert.equal(COPY.clear({ loose: 40, chain: 4, credit: 6.4, w: '0.96' }),
      '+40 loose · chain 4 · rating +6.4 · weight 0.96');
    assert.equal(/[×x]\s*0\.96/.test(COPY.clear({ loose: 40, chain: 4, credit: 6.4, w: '0.96' })), false,
      'no multiplication sign may stand between the rating move and the slot weight');
    assert.equal(COPY.bag({ bagged: 118, fee: 13, chainBefore: 4 }), 'bagged 118 · fee 13 · chain 4 → 0');
    assert.equal(COPY.sealed({ tag: 'dropped-gcf' }), 'dropped-gcf sealed · tell 1.00');
    assert.equal(COPY.callIt({ left: 4 }), 'stakes off · 4 targets left · hints on');
    assert.equal(COPY.quietReview(), 'REVIEW · no stakes');
    assert.equal(COPY.quietBanked(), 'Banked at 22:00. Nothing lost.');
  });

  test('every payout, ledger and board line carries at least one digit', () => {
    const NUMERIC = ['clear', 'ladder', 'miss', 'bag', 'bagPrompt', 'walk', 'envelope', 'evidence',
      'primary', 'postedNet', 'postedFlat', 'projection', 'supply', 'thin', 'quiet', 'closed',
      'night', 'callIt', 'coldCrew', 'ratingLine', 'sealed', 'contractRow'];
    const bad = [];
    for (const k of NUMERIC) {
      const line = String(COPY[k](STUBS[2]()));                    // every field answers 1
      if (!/\d/.test(line)) bad.push(`COPY.${k} → ${line}`);
    }
    assert.deepEqual(bad, []);
  });
});

/* ================================================================================================
   10. THE LINT COVERS THE SCREENS THAT CARRY THE PROSE  (r3 spec-fidelity, MINOR)
   ================================================================================================

   THE FINDING, and it was right. `LAYER_SOURCES` above is `data/job.js` plus the seven DOM-free
   modules plus `screens/job.js`, and every voice test in §§1-5 is scoped to `CORPUS` — the string
   TABLE. G6 "How it stays dry" says the rule is *"Enforced by a lint test over the string tables"*
   and G8's J12 row scopes its acceptance to `data/job.js`; between those two sentences sit the four
   screens that carry most of the layer's prose and were linted by nothing:

     screens/settings.js   the five formula panels G7 requires
     screens/home.js       the whole Board panel
     screens/stats.js      the Ledger, the crew grid, the Fault Index
     screens/run.js        the debrief

   Why a source sweep and not `CORPUS`: those strings are not in a table, they are literals inside
   `h()` calls, so the only way to reach them without a browser is to lex the file. `literalsOf`
   below is a small string/template/regex-aware lexer — regex-aware because without it
   `String(s).split(/[^a-z'’]+/)` opens a bogus string literal at the `'` and swallows the next
   forty lines of code, which is exactly the false positive that makes people delete lints.

   NEGATIVE CONTROLS. All five were run against IN-MEMORY copies of the six sources, with the three
   functions below lifted out of this file so the control exercised the shipped detector text and no
   project file was edited. Baseline: **728 prose literals, every arm CLEAN**. Then:
     · `hint('Great work on that streak!')` appended to settings.js → **bang = 1, praise = Great**,
       both naming `site/js/screens/settings.js:912`.
     · `h('p', 'We think you should get some sleep')` appended to home.js → **first-person = we,
       parent = get some sleep**, at `home.js:850`, and no other arm.
     · `h('span', 'nice')` → **CLEAN**, and correctly so: a single word with no whitespace is not
       prose by `isProse`, it is a class name or a key. The arm is not blind to the word —
       `h('span', 'nice one there')` → **praise = nice** at `stats.js:731`, and it is not in the
       allowlist, so the allowlist is not a blanket over the word.
     · forcing `opensValue = false` in `literalsOf` (i.e. deleting the regex branch) → the prose
       population collapses 728 → **573** and **15 spurious offenders** appear (11 exclamation,
       4 praise), all of them code swallowed through a quote inside a character class. The lexer is
       load-bearing, not decoration.
   ================================================================================================ */

/** The four screens the finding names, plus the two files already linted, as the scan's population. */
const PROSE_SOURCES = Object.freeze([
  'site/js/screens/home.js', 'site/js/screens/settings.js',
  'site/js/screens/stats.js', 'site/js/screens/run.js',
  'site/js/screens/job.js', 'site/data/job.js',
]);

/**
 * Every string / template literal in JS source, with its 1-based line. Comment-, template- and
 * REGEX-aware: a `/` opens a regex only where a value may start, so a quote inside a character
 * class is not mistaken for the start of a string.
 */
function literalsOf(src) {
  const s = String(src); const n = s.length;
  const out = []; let i = 0; let line = 1; let prev = ''; let code = '';
  const KEYWORD = /(?:return|typeof|case|in|of|instanceof|new|delete|void|do|else|yield|await)$/;
  while (i < n) {
    const c = s[i]; const d = s[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    if (c === '/') {
      const opensValue = prev === '' || '([{,;:=!&|?+-*%~^<>'.includes(prev) || KEYWORD.test(code.trimEnd());
      if (opensValue) {
        i++; let inClass = false;
        while (i < n) {
          const x = s[i];
          if (x === '\\') { i += 2; continue; }
          if (x === '[') inClass = true;
          else if (x === ']') inClass = false;
          else if (x === '/' && !inClass) { i++; break; }
          else if (x === '\n') break;                     // unterminated: it was a division after all
          i++;
        }
        while (i < n && /[dgimsuvy]/.test(s[i])) i++;
        prev = ')'; code += ')'; continue;                 // a regex is a value
      }
      prev = c; code += c; i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; const at = line; i++; let body = '';
      while (i < n && s[i] !== q) {
        if (s[i] === '\\') { body += s[i + 1] === 'n' ? '\n' : s[i + 1]; i += 2; continue; }
        if (q === '`' && s[i] === '$' && s[i + 1] === '{') {
          /* a HOLE, which may contain strings and further templates of its own: take it whole, so a
             nested backtick cannot be read as the end of this literal (stats.js:540 is one) */
          let depth = 1; body += '${'; i += 2;
          let iq = null;
          while (i < n && depth > 0) {
            const x = s[i];
            if (x === '\n') line++;
            if (iq) { if (x === '\\') { body += x + (s[i + 1] ?? ''); i += 2; continue; } if (x === iq) iq = null; }
            else if (x === "'" || x === '"' || x === '`') iq = x;
            else if (x === '{') depth++;
            else if (x === '}') depth--;
            body += x; i++;
          }
          continue;
        }
        if (q !== '`' && s[i] === '\n') break;             // unterminated single-line string
        if (s[i] === '\n') line++;
        body += s[i]; i++;
      }
      i++; out.push({ at, q, body });
      prev = ')'; code += ')'; continue;
    }
    if (!/\s/.test(c)) { prev = c; code += c; } else code += ' ';
    if (code.length > 64) code = code.slice(-64);
    i++;
  }
  return out;
}

/** Blank out `${…}` holes of a template literal, brace-counting and quote-aware. */
function withoutHoles(body) {
  let out = ''; let i = 0;
  while (i < body.length) {
    if (body[i] === '$' && body[i + 1] === '{') {
      let depth = 1; i += 2; let q = null;
      while (i < body.length && depth > 0) {
        const c = body[i];
        if (q) { if (c === '\\') i++; else if (c === q) q = null; }
        else if (c === "'" || c === '"' || c === '`') q = c;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
      }
      out += ' '; continue;
    }
    out += body[i]; i++;
  }
  return out;
}

/** Is this literal PROSE a student reads, rather than a selector, a class name or a key? */
function isProse(body) {
  const t = withoutHoles(body);
  if (!/\s/.test(t.trim())) return false;                  // one token: a class, an id, a key
  return (t.match(/[A-Za-z][a-z'’]{2,}/g) ?? []).length >= 2;
}

/** Every prose literal of the scanned files, as `{ file, at, s }`. */
const PROSE_LINES = PROSE_SOURCES.flatMap((f) =>
  literalsOf(read(f)).filter((l) => isProse(l.body)).map((l) => ({ file: f, at: l.at, s: withoutHoles(l.body) })));

const proseOffenders = (hit) => PROSE_LINES.flatMap(({ file, at, s }) => {
  const found = hit(s);
  return found ? [`${file}:${at} → ${JSON.stringify(s.trim().slice(0, 100))}  (${found})`] : [];
});

describe('J12 — the voice rules are linted over the four screens that carry the prose', () => {
  test('the lexer finds the prose, and its regex branch is load-bearing', () => {
    assert.ok(PROSE_LINES.length > 400, `only ${PROSE_LINES.length} prose literals across ${PROSE_SOURCES.length} files`);
    for (const f of PROSE_SOURCES) {
      const mine = PROSE_LINES.filter((l) => l.file === f);
      assert.ok(mine.length > 40, `${f} yielded only ${mine.length} prose literals — the lexer lost the file`);
    }
    /* the two shapes that break a naive scanner, asserted directly */
    const probe = literalsOf("const re = /[^a-z'’]+/; const s = 'kept';\nconst t = `a ${x ? 'b' : `${y}`} c`;");
    assert.deepEqual(probe.map((l) => l.body), ['kept', "a ${x ? 'b' : `${y}`} c"],
      'a quote inside a regex character class must not open a string');
    assert.equal(withoutHoles("a ${x ? 'b' : `${y}`} c"), 'a   c', 'a nested hole is blanked whole');
    assert.equal(isProse('div.job-board'), false);
    assert.equal(isProse('job-crew-board'), false, 'a class name is not prose');
    assert.equal(isProse('~2.0 min'), false, 'a numeral and a unit is not prose');
    assert.equal(isProse('every contract is dues'), true);
  });

  test('no exclamation mark in any of them (G6)', () => {
    assert.deepEqual(proseOffenders((s) => (s.includes('!') ? '!' : null)), [],
      'a screen raises its voice');
  });

  test('no emoji in any of them (G6)', () => {
    const EMOJI = /[\p{Emoji_Presentation}\p{Regional_Indicator}️‍]/u;
    assert.deepEqual(proseOffenders((s) => (EMOJI.test(s) ? 'emoji' : null)), []);
  });

  test('no first-person pronoun in any of them', () => {
    /* `I` is matched CASE-SENSITIVELY and every other pronoun case-insensitively. The English
       first-person singular is always capitalised; a lower-case standalone `i` in these files is an
       index, and settings.js prints the water-filling pseudo-code verbatim (`for i in over: y_i =
       cap`, five lines of it) because G7 requires the printed law to be the computed one. Matching
       `i` case-blind there would ban the published algorithm, which is a broken lint. The table's
       own sweep in §3 is unchanged and still case-blind. */
    const OTHERS = [
      "i'm", "i’m", "i'll", "i’ll", "i've", "i’ve", "i'd", "i’d",
      'me', 'my', 'mine', 'myself',
      'we', "we're", "we’re", "we've", "we’ve", "we'll", "we’ll", "we'd", "we’d",
      'us', 'our', 'ours', 'ourselves', "let's", "let’s",
    ];
    const hit = (s) => {
      const bad = [];
      if (/(?:^|[^A-Za-z'’])I(?:$|[^A-Za-z'’])/.test(s)) bad.push('I');
      for (const w of s.toLowerCase().split(/[^a-z'’]+/)) if (OTHERS.includes(w)) bad.push(w);
      return bad.length ? [...new Set(bad)].join(' ') : null;
    };
    assert.equal(hit('I bagged it'), 'I', 'the detector still catches the pronoun');
    assert.equal(hit("let's go"), "let's");
    assert.equal(hit('for i in over: y_i = cap'), null, 'a loop index is not a narrator');
    assert.equal(hit('your tokens'), null);
    assert.equal(hit('minutes'), null, 'a word that merely contains "mine" is not a pronoun');
    assert.deepEqual(proseOffenders(hit), []);
  });

  test('no praise word in any of them, beyond the two technical uses named here', () => {
    const PRAISE = [
      'great', 'awesome', 'amazing', 'excellent', 'perfect', 'brilliant', 'fantastic', 'wonderful',
      'superb', 'incredible', 'outstanding', 'impressive', 'bravo', 'congratulations', 'congrats',
      'nice', 'wow', 'yay', 'woohoo', 'hooray', 'epic', 'legend', 'legendary', 'superstar', 'rockstar',
      'genius', 'champ', 'champion', 'proud', 'crushed', 'nailed', 'smashed', 'flawless', 'stellar',
      'terrific', 'marvellous', 'marvelous', 'splendid', 'magnificent', 'unstoppable', 'beast',
    ];
    const RE = new RegExp(`\\b(?:${PRAISE.join('|')})\\b`, 'i');
    /* G6's rule is "no second-person praise". These two are third-person statements of fact in the
       product's own vocabulary, exactly as `clean` is a rung and `Clean Getaway` is a stamp — and
       they are pinned INDIVIDUALLY, so any other use of any praise word in any of the six files
       still fails. `flawless` is also a ledger field (`runs[-1].flawless`) and a trophy id
       (`flawless-page`), which is why it is in the vocabulary at all. */
    const ALLOWED = Object.freeze([
      { word: 'perfect', of: 'a perfect call at 85', why: 'the Brier credit at p = o, in the rating panel' },
      { word: 'flawless', of: 'Page complete — flawless', why: 'the `flawless` ledger field / `flawless-page` trophy' },
    ]);
    const offenders = proseOffenders((s) => {
      const m = s.match(RE);
      if (!m) return null;
      return ALLOWED.some((a) => a.word === m[0].toLowerCase() && s.includes(a.of)) ? null : m[0];
    });
    assert.deepEqual(offenders, [], 'a screen praises the student');
    /* the allowlist is not a blanket: the same word elsewhere fails, and each entry is really used */
    for (const a of ALLOWED) {
      assert.ok(PROSE_LINES.some((l) => l.s.includes(a.of)),
        `the allowlist carries "${a.of}" (${a.why}) and nothing in the tree says it — delete the entry`);
      assert.equal(RE.test(a.of), true);
      assert.notEqual(proseOffenders(() => null).length, 1);
    }
    assert.equal(ALLOWED.length, 2, 'the allowlist grew — a third technical use needs its own reason');
  });

  test('no sentence in a parent’s voice in any of them (G12 #35)', () => {
    /* the same pinned list §5 runs over the table, run over the screens */
    const BANNED = Object.freeze([
      'nothing here beats sleep', 'and then you sleep', 'nothing beats sleep', 'beats sleep',
      'get some sleep', 'get some rest', 'time for bed', 'go to bed', 'off to bed', 'bedtime',
      'early night', 'sleep on it', 'sleep well', 'good night', 'goodnight',
      'you should', 'you ought', 'you need to', 'you must', 'you really should',
      'make sure', 'be sure to', 'remember to', "don't forget", 'dont forget',
      "don't worry", 'dont worry', 'no pressure', 'take a break', 'have a break',
    ]);
    const norm = (s) => s.toLowerCase().replace(/[’]/g, "'");
    const hit = (s) => BANNED.find((p) => norm(s).includes(norm(p))) ?? null;
    assert.equal(hit('You should call it a night'), 'you should', 'the detector works');
    assert.equal(hit('Get some sleep'), 'get some sleep');
    assert.equal(hit('bagged 118 · fee 13 · chain 4 → 0'), null, 'a payout line is not a parent');
    assert.deepEqual(proseOffenders(hit), []);
  });

  test('the copy table is not a second source of truth for a screen’s line', () => {
    /* The other half of the finding. Nine COPY entries had no `COPY.<key>` call site under
       `site/js` when it was written; the screen lanes have since routed six of them, and the three
       below are what is left. `contractRow` is dev-only by design (`board.js` composes the row for
       the console report), so the live gap is `repeat` and `cleanGetaway`. Pinned by name and by
       count so the list can only shrink. See notes/repair-tests.md → Requests. */
    const src = listFiles('site/js', /\.js$/).map((f) => read(f.slice(ROOT.length + 1))).join('\n');
    const dead = Object.keys(COPY).filter((k) => !new RegExp(`COPY\\.${k}\\b`).test(src));
    assert.deepEqual(dead.sort(), ['cleanGetaway', 'contractRow', 'repeat'],
      'a COPY entry lost (or gained) its only call site — a table entry no screen reads is a second '
      + 'source of truth for whatever the screen types instead');
    /* and no screen re-types a line the table already owns, which is the defect behind the list */
    for (const k of ['reviewBoard', 'schoolWindow', 'boardTitle', 'coldCrew']) {
      const line = String(COPY[k](STUBS[2]()));
      if (!/[A-Za-z]{4}/.test(line)) continue;
      const retyped = PROSE_LINES.filter((l) => l.file.startsWith('site/js/screens/') && l.s.includes(line));
      assert.deepEqual(retyped.map((l) => `${l.file}:${l.at}`), [],
        `COPY.${k} is re-typed as a literal: "${line}"`);
    }
  });
});
