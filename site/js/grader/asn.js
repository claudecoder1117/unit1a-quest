// asn.js — Always / Sometimes / Never grader (COMPOSED S3 "asn", Global rule 5). DOM-free, pure.
//
// part: { type:'asn', answer:'A'|'S'|'N', reason?:string, distractors?:[string,string],
//         disputed?:string, askReasonOnMiss?:boolean, id?:string }
// raw:  'A'|'S'|'N' | 'always'|'sometimes'|'never' | '1'|'2'|'3'   (verdict stage)
//       { verdict, reason }  where reason is a chip text or an index into chips(part, seed)   (reason stage)
// ctx:  { askReasonOnMiss?:boolean (settings, default true), mode?:'card'|'full36'|'mock'|'blitz',
//         full36?, mock?, blitz?  (boolean aliases of mode), seed?:string (chip order) }
//
// Semantics (S3):
//   • The one-line reason is ALWAYS shown after the verdict (result.reason / result.showReason) — read it, no tap.
//   • Reason chips are asked only on a wrong verdict (askReasonOnMiss, default on) or in Full 36 mode
//     (result.askReason). A correct verdict on a Card is one tap + continue.
//   • Verdict ✓ + chip ✗ still counts correct (ok:true) but result.withHints is true → scheduled "with hints"
//     (mastery s = 70, Leitner bucket unchanged). The caller reads withHints; the grader never charges for it.
//   • Mock and BLITZ show no reasons and no chips: reason is null, askReason false.
//   • disputed items (qz-04) grade the TEACHER's letter and carry the ⚑ note in result.disputed / result.flag.
//   • The reason stage after a wrong verdict is result.free (the attempt was charged at the verdict stage).
//   • Tags (catalogued in data/misconceptions.js): a wrong verdict is 'overgeneralised' (A/N for S),
//     'undergeneralised' (S for A/N) or 'flipped-verdict' (A↔N); a wrong chip is 'wrong-reason'.
//     tags:['overgeneralised', 'undergeneralised', 'flipped-verdict', 'wrong-reason']
//
// grade(part, raw, ctx) → {ok, kind, credit, msg, tags, normalized:{verdict, reason},
//                          stage:'verdict'|'reason', verdict, answer, verdictOk, reason, showReason,
//                          askReason, reasonOk, withHints, free, disputed, flag}

import { stableOrder } from './mc.js';

export const LETTERS = { A: 'Always', S: 'Sometimes', N: 'Never' };
const WORDS = { always: 'A', sometimes: 'S', never: 'N', a: 'A', s: 'S', n: 'N', '1': 'A', '2': 'S', '3': 'N' };

/** Parse a verdict → 'A' | 'S' | 'N' | null. */
export function parseVerdict(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') raw = raw.verdict;
  const s = String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return WORDS[s] ?? null;
}

/** The three reason chips [{text, ok}] in a deterministic order for `seed` (default part.id); [] when the item carries no reason. */
export function chips(part, seed) {
  if (!part.reason) return [];
  const list = [{ text: String(part.reason), ok: true }, ...(part.distractors ?? []).map((d) => ({ text: String(d), ok: false }))];
  return stableOrder(list, `${seed ?? part.id ?? ''}|asn|${part.reason}`);
}

function normText(s) {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Grade a reason chip on its own (widgets may call this instead of grade() with {verdict, reason}).
 * @param {object} part
 * @param {string|number} reasonRaw  chip text, or an index into chips(part, seed)
 * @returns {{ok:boolean, picked:string|null, correct:string|null}}
 */
export function gradeReason(part, reasonRaw, seed) {
  const list = chips(part, seed);
  if (!list.length) return { ok: false, picked: null, correct: null };
  let picked = null;
  if (typeof reasonRaw === 'number' && Number.isInteger(reasonRaw)) picked = list[reasonRaw] ?? null;
  else if (reasonRaw != null) picked = list.find((c) => normText(c.text) === normText(reasonRaw)) ?? null;
  return { ok: !!picked?.ok, picked: picked?.text ?? null, correct: part.reason ?? null };
}

/** Misconception tag for a wrong verdict. */
export function verdictTag(answer, verdict) {
  if (!answer || !verdict || answer === verdict) return null;
  if (answer === 'S') return 'overgeneralised';
  if (verdict === 'S') return 'undergeneralised';
  return 'flipped-verdict';
}

function modeOf(ctx) {
  if (ctx.mode) return ctx.mode;
  if (ctx.mock) return 'mock';
  if (ctx.blitz) return 'blitz';
  if (ctx.full36) return 'full36';
  return 'card';
}

function result(kind, msg, extra) {
  return { ok: kind === 'correct', kind, credit: kind === 'correct' ? 1 : 0, msg, tags: [], normalized: null, ...extra };
}

/**
 * Grade an A/S/N verdict (and, on the second call, its reason chip).
 * @param {object} part
 * @param {string|{verdict:string, reason?:string|number}} raw
 * @param {object} [ctx]
 */
export function grade(part, raw, ctx = {}) {
  const mode = modeOf(ctx);
  const answer = parseVerdict(part.answer);
  const reasonText = part.reason ? String(part.reason) : null;
  const showReason = mode !== 'mock' && mode !== 'blitz' && !!reasonText;
  const askOnMiss = ctx.askReasonOnMiss ?? ctx.settings?.askReasonOnMiss ?? part.askReasonOnMiss ?? true;
  const hasChips = showReason && chips(part, ctx.seed).length > 1;
  const disputed = part.disputed ? String(part.disputed) : null;
  const base = {
    stage: 'verdict', verdict: null, answer, verdictOk: false,
    reason: showReason ? reasonText : null, showReason, askReason: false, reasonOk: null,
    withHints: false, free: false, disputed, flag: !!disputed,
  };

  const verdict = parseVerdict(raw);
  if (!verdict) return result('malformed', 'Pick Always, Sometimes or Never (A / S / N).', base);
  const verdictOk = verdict === answer;
  const line = showReason ? `${LETTERS[answer]} — ${reasonText}` : `${LETTERS[answer]}.`;
  const reasonRaw = raw && typeof raw === 'object' ? raw.reason : undefined;

  if (reasonRaw === undefined || reasonRaw === null) {
    // ---- verdict stage ----
    const normalized = { verdict, reason: null };
    if (verdictOk) {
      const askReason = hasChips && mode === 'full36';
      return result('correct', line, { ...base, normalized, verdict, verdictOk, askReason });
    }
    const askReason = hasChips && (mode === 'full36' || askOnMiss);
    const msg = showReason ? `Not ${LETTERS[verdict]}. ${line}` : `Not ${LETTERS[verdict]} — it's ${LETTERS[answer]}.`;
    return result('wrong', msg, { ...base, normalized, verdict, verdictOk, askReason, tags: [verdictTag(answer, verdict)] });
  }

  // ---- reason stage ----
  const r = gradeReason(part, reasonRaw, ctx.seed);
  const normalized = { verdict, reason: r.picked };
  const common = { ...base, stage: 'reason', normalized, verdict, verdictOk, reasonOk: r.ok, askReason: false };
  if (!hasChips) {
    // no chips on this item/mode: behave like the verdict stage
    return verdictOk
      ? result('correct', line, { ...common, reasonOk: null })
      : result('wrong', `Not ${LETTERS[verdict]}. ${line}`, { ...common, reasonOk: null, free: true, tags: [verdictTag(answer, verdict)] });
  }
  if (verdictOk && r.ok) return result('correct', line, common);
  if (verdictOk && !r.ok) {
    return result('correct', `Right verdict, wrong reason. ${reasonText}`, { ...common, withHints: true, tags: ['wrong-reason'] });
  }
  // wrong verdict: the attempt was charged at the verdict stage; this reflective step is free
  const msg = r.ok ? `Right reason. ${line}` : `Not that reason. ${line}`;
  return result('wrong', msg, { ...common, free: true, tags: [verdictTag(answer, verdict)] });
}

export default grade;
