// shortcuts.js — the single-key shortcuts of the word widgets (COMPOSED S5 AAA checklist:
// "keyboard-complete … 1–5 options, A/S/N, Y/N"; S3 edge cases: "keyboard shortcuts ignored while a
// text field is focused").
//
// base.js (T08a) owns the key ROW — the insert keys above the OS keyboard. This owns the other kind of
// key: a bare letter or digit that picks an option. They must not be confused, so they live apart.
//
//   const off = bindShortcuts({ a: fn, s: fn, n: fn, 1: fn }, { active: () => !locked && shown(root) });
//
// A handler never fires while a text field has focus, while a modifier is held, after another handler
// called preventDefault, or when `active()` says the widget is locked or off-screen (several widgets
// share one page on a multi-part card).

/** Is this node a text-entry control? */
export function isTextField(node) {
  if (!node || node.nodeType !== 1) return false;
  const t = node.tagName;
  if (t === 'TEXTAREA' || t === 'SELECT') return true;
  if (t === 'INPUT') return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file'].includes((node.type || 'text').toLowerCase());
  return node.isContentEditable === true;
}

/** Rendered and not display:none — a hidden widget must not answer keys meant for the visible one. */
export function isShown(node) {
  return !!(node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length));
}

/**
 * bindShortcuts(map, opts) → unbind
 * @param {Object<string, function>} map  key (case-insensitive, as in KeyboardEvent.key) → handler
 * @param {{root?:EventTarget, active?:() => boolean}} [opts]
 */
export function bindShortcuts(map, opts = {}) {
  const root = opts.root || (typeof document !== 'undefined' ? document : null);
  if (!root) return () => {};
  const active = opts.active || (() => true);
  const table = new Map(Object.entries(map).map(([k, fn]) => [k.toLowerCase(), fn]));
  const onKey = (ev) => {
    if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (isTextField(ev.target)) return;
    if (!active()) return;
    const fn = table.get(String(ev.key).toLowerCase());
    if (!fn) return;
    ev.preventDefault();
    fn(ev);
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}

export default bindShortcuts;
