// asn.js — Always / Sometimes / Never widget (COMPOSED S3 "asn", S8 #8d).
//
// The whole point of this widget is the tap count: a CORRECT verdict is one tap and continue. The
// one-line reason is READ, never tapped — it arrives with the verdict. The three reason chips are asked
// only when the verdict was wrong (settings.askReasonOnMiss, default on) or in "Full 36" mode; Mock and
// BLITZ show neither reason nor chips. All of that is decided by js/grader/asn.js — this file renders
// `result.showReason` / `result.askReason` and never re-derives the rules.
//
// Keys: a / s / n and 1 / 2 / 3 pick the verdict; while the chip row is open the digits pick a chip.
//
// mount(el, part, ctx) → handle          (the contract lives in base.js)
//   raw() → 'A' | 'S' | 'N'                     the verdict stage
//        → { verdict, reason }                  once a chip is picked (the reason stage)
//   A tap on a verdict button, and a tap on a chip, each fire ctx.onSubmit / the 'w-submit' event:
//   one tap, no confirm step. `handle.stage()` says which stage is open ('verdict' | 'reason').

import { h, label, msgLine, promptLine, stateOf, flash, wire, handle } from './base.js';
import { chips as reasonChips, LETTERS } from '../grader/asn.js';
import { bindShortcuts, isShown } from './shortcuts.js';

const ORDER = ['A', 'S', 'N'];
const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-asn', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  let verdict = null;
  let stage = 'verdict';
  let chipList = [];
  let chipPick = null;
  let locked = false;
  let settled = false;

  if (part.statement) root.append(h('p.w-asn-stmt', label(part.statement)));
  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const row = h('div.w-asn-row', { role: 'radiogroup', 'aria-label': 'Always, Sometimes or Never' });
  const buttons = new Map();
  for (const letter of ORDER) {
    const b = h('button.w-asn-btn', {
      type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { v: letter, state: '' },
      onclick: () => choose(letter),
    },
      h('span.w-asn-k', { 'aria-hidden': 'true' }, letter),
      h('span.w-asn-w', LETTERS[letter]),
      h('span.w-asn-mark', { 'aria-hidden': 'true' }),
    );
    buttons.set(letter, b);
    row.append(b);
  }
  root.append(row);

  const line = msgLine();
  root.append(line.el);

  const flag = h('p.w-asn-flag', { hidden: true });
  root.append(flag);

  const whyHeadId = `asn-why-${part.id || 'p'}`;
  const chipWrap = h('div.w-asn-why', { hidden: true }, h('p.wd-sub', { id: whyHeadId }, 'Which reason is the right one?'));
  const chipRow = h('div.wd-chiprow', { role: 'radiogroup', 'aria-labelledby': whyHeadId });
  chipWrap.append(chipRow);
  root.append(chipWrap);

  function choose(letter, submit = true) {
    if (locked || settled || stage !== 'verdict' || !buttons.has(letter)) return;
    verdict = letter;
    for (const [k, b] of buttons) { b.setAttribute('aria-checked', String(k === letter)); b.dataset.on = String(k === letter); }
    root.dataset.picked = letter;
    if (!submit) return;                 // restoring a saved answer never re-submits it
    fire.input({ part, verdict });
    fire.submit({ part, verdict });
  }

  function pickChip(text) {
    if (locked || stage !== 'reason') return;
    chipPick = text;
    for (const b of chipRow.children) { b.setAttribute('aria-checked', String(b.dataset.text === text)); b.dataset.on = String(b.dataset.text === text); }
    fire.input({ part, reason: text });
    fire.submit({ part, verdict, reason: text });
  }

  function openChips() {
    chipList = reasonChips(part, ctx.seed);
    if (chipList.length < 2) return;
    stage = 'reason';
    chipRow.textContent = '';
    chipList.forEach((c, i) => {
      const b = h('button.wd-chip', {
        type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { text: c.text, i: String(i), state: '' },
        onclick: () => pickChip(c.text),
      }, h('span.wd-chip-n', { 'aria-hidden': 'true' }, String(i + 1)), label(c.text, 'wd-chip-t'));
      chipRow.append(b);
    });
    chipWrap.hidden = false;
    chipRow.firstElementChild?.focus({ preventScroll: true });
  }

  function raw() {
    if (stage === 'reason' && chipPick != null) return { verdict, reason: chipPick };
    return verdict;
  }

  function setFeedback(res) {
    if (!res) {
      line.clear(); root.dataset.state = '';
      for (const b of buttons.values()) b.dataset.state = '';
      return;
    }
    const state = stateOf(res);
    root.dataset.state = state;
    // content r2: when the chips are about to be asked, the full reason line would print the correct chip
    // verbatim two lines above the question — so the verdict stage shows only the letters ("Not Always.
    // Sometimes.") and the reason line arrives with the chip verdict (res.stage === 'reason' carries it).
    const short = res.askReason && res.stage !== 'reason' && res.kind === 'wrong' && res.verdict && res.answer;
    // card r2: the reflective chip after a wrong verdict is graded on its own line — the RIGHT chip reads
    // "✓ Right reason. Sometimes — …" (the reason line arrives here), not a second ✗ under a settled miss.
    // Only the line's glyph changes; root.dataset.state stays 'bad' (the pips and the part box read that).
    const lineState = res.stage === 'reason' && !res.verdictOk && res.reasonOk ? 'ok' : state;
    line.set(lineState, short ? `Not ${LETTERS[res.verdict]}. ${LETTERS[res.answer]}.` : cleanMsg(res, state === 'ok' ? 'Correct' : ''));

    if (res.stage === 'reason' || stage === 'reason') {
      for (const b of chipRow.children) {
        const isPick = b.dataset.text === chipPick;
        const isRight = b.dataset.text === part.reason;
        b.dataset.state = res.kind === 'malformed' ? '' : isRight ? 'ok' : isPick ? 'bad' : '';
        if (res.kind !== 'malformed') b.disabled = true;
      }
      if (res.kind !== 'malformed' && res.reasonOk === false) flash(chipRow, 'bad');
    }

    if (res.stage !== 'reason') {
      for (const [k, b] of buttons) {
        b.dataset.state = res.kind === 'malformed' ? ''
          : res.verdictOk && k === verdict ? 'ok'
          : !res.verdictOk && k === verdict ? 'bad'
          : !res.verdictOk && k === res.answer ? 'ans' : '';
      }
      if (res.kind === 'wrong') flash(row, 'bad');
      else if (res.kind === 'correct') flash(root, 'ok');
      // Either verdict settles the letter: the wrong line names the right one (S3), so the three
      // buttons are done. Only the chip row, when asked for, stays live.
      if (res.kind !== 'malformed') settleVerdict();
    }

    if (res.disputed && res.kind !== 'malformed') {
      flag.hidden = false;
      flag.textContent = '';
      // content r2: grading clause first and the letter named, so the note can't be skimmed as "…A — graded".
      flag.append(h('span.w-asn-flag-g', { 'aria-hidden': 'true' }, '⚑'), h('span', `Graded ${res.answer} (the teacher's answer). ${res.disputed}.`));
    }
    if (res.askReason && stage !== 'reason' && res.kind !== 'malformed') openChips();
  }

  function settleVerdict() {
    settled = true;
    for (const b of buttons.values()) b.disabled = true;
    root.dataset.settled = 'true';
  }

  function lock(on = true) {
    locked = !!on;
    for (const b of buttons.values()) b.disabled = locked || settled;
    for (const b of chipRow.children) b.disabled = locked || b.dataset.state !== '';
    root.classList.toggle('is-locked', locked);
  }

  const unbind = ctx.shortcuts === false ? () => {} : bindShortcuts({
    a: () => choose('A'), s: () => choose('S'), n: () => choose('N'),
    1: () => key(0), 2: () => key(1), 3: () => key(2),
  }, { active: () => !locked && isShown(root) });

  function key(i) {
    if (stage === 'reason') { const c = chipList[i]; if (c) pickChip(c.text); return; }
    choose(ORDER[i]);
  }

  if (ctx.values?.verdict) choose(ctx.values.verdict, false);
  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'asn',
    raw, setFeedback, lock,
    focus: () => { if (!locked) (stage === 'reason' ? chipRow.firstElementChild : buttons.get(verdict ?? 'A'))?.focus({ preventScroll: true }); },
    isEmpty: () => (stage === 'reason' ? chipPick == null : verdict == null),
    pips: () => ({ total: 1, filled: root.dataset.state === 'ok' ? 1 : 0 }),
    values: () => ({ verdict, reason: chipPick }),
    destroy() { unbind(); root.remove(); },
    stage: () => stage,
  });
}

export default mount;
