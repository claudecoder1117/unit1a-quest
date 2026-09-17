// cases.js — the `cases` grader (COMPOSED S3 "Parts · cases"): one tab per found root, the measures
// (and an optional YES/NO verdict) for each case; rows matched by tolerance on the root column, never by
// string keys; order-free. DOM-free; never throws on student input.
//
// grade(part, raw, ctx) → { ok, kind, credit: cells right / cells total, msg, tags, normalized,
//                           rows:[{x:text|null, value, matched:boolean, extra:boolean, ok, cells:{key:{state, ok, kind, msg, normalized, value}}}],
//                           missing:number, reveal:{x:text}|null, code }
//   part { type:'cases', of:'x', cols:[{key, label?, wedge?, type?:'num'|'verdict'|'root'}], rows:[{x:'3', CFD:'9', …}], tol? }
//   raw  [{ x:'3', CFD:'9', DFE:'171' }, …]     — one object per tab (the widget fills `x` from the tab; the
//        | { rows:[…] }                            "+ another case" tab has a free x field the student types)
//        | { '3': {CFD:'9', …}, '-1/2': {…} }     — keyed by the root text
//   ctx  { state?, sandbox?, strict?|mock?|boss?, misconceptions?, card? }
//
// A submitted row whose x matches no expected row → wrong ("x = 4 isn't a root", extra-root). Blank cells are
// open (never an attempt): a row whose x is known but whose cells are blank → `almost` "fill in the x = … case".
// A row entirely ABSENT from the submit (no tab for it) is the missing-case path: first submit "there's another
// case — the quadratic has a second root" (`almost`, x not revealed); the SECOND (ctx.state counter) or any in
// strict mode → `wrong` "what if x = −1/2?" with `reveal:{x}` (tag missing-case). This is the only place the
// missing root is named short of the solution.
//
// tags:['extra-root','missing-case','wrong-verdict','swapped-fields','sign-flip']

import { numEquals, numIsNegOf } from './normalize.js';
import { result, isBlank, parseValue, toVal, show, tolOf, isStrict, escalate, misconceptionsOf, matchMisconception, cap } from './num.js';

function colsOf(part) {
  const cols = Array.isArray(part.cols) ? part.cols : [];
  const xKey = part.of ?? (cols.find((c) => c.type === 'root') ?? cols[0] ?? { key: 'x' }).key;
  return { cols, xKey, valueCols: cols.filter((c) => c.key !== xKey) };
}

function colType(col) {
  if (col.type) return col.type;
  return /^(verdict|bisects|yes|yn)$/i.test(col.key) ? 'verdict' : 'num';
}

/** 'yes' / 'y' / 'true' / 'bisects' / '✓' → 'YES'; 'no' / 'n' / 'false' / "doesn't" / '✗' → 'NO'; else null */
export function parseVerdict(raw) {
  if (typeof raw === 'boolean') return raw ? 'YES' : 'NO';
  const s = String(raw ?? '').normalize('NFKC').trim().toLowerCase();
  if (!s) return null;
  if (/^(yes|y|true|t|✓|bisects|does|it does|yes it does)\b/.test(s)) return 'YES';
  if (/^(no|n|false|f|✗|x|does ?n[o']?t|doesn|not)\b/.test(s)) return 'NO';
  return null;
}

/** raw → [{ x: rawValue, cells:{key: rawValue} }] */
export function rowsOf(part, raw) {
  const { xKey } = colsOf(part);
  let list = raw;
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    if (Array.isArray(raw.rows)) list = raw.rows;
    else list = Object.entries(raw).map(([k, v]) => (v && typeof v === 'object' ? { [xKey]: k, ...v } : null)).filter(Boolean);
  }
  if (!Array.isArray(list)) return [];
  return list.filter((r) => r && typeof r === 'object').map((r) => {
    const x = r[xKey] ?? r.root ?? r.x ?? null;
    const cells = {};
    for (const [k, v] of Object.entries(r)) if (k !== xKey && k !== 'root') cells[k] = v;
    return { x, cells };
  });
}

/**
 * grade — see the header.
 */
export function grade(part = {}, raw, ctx = {}) {
  const tol = tolOf(part, ctx);
  const { xKey, valueCols } = colsOf(part);
  const expected = (Array.isArray(part.rows) ? part.rows : []).map((r) => ({ row: r, x: toVal(r[xKey]) })).filter((r) => r.x !== null);
  if (!expected.length || !valueCols.length) return result('malformed', 'This item has no cases yet.', { err: 'bad-part', rows: [], missing: 0, reveal: null, code: 'bad-part' });
  const labelOf = (c) => String(c.label ?? c.key).replace(/\s*[=:]\s*$/, '');
  const xLabel = String(part.of ?? xKey);
  const misc = misconceptionsOf(part, ctx);
  const scope = { part: part.id ?? null };

  const submitted = rowsOf(part, raw);
  const rows = [];
  const tags = [];
  const claimed = new Set();
  let wrongMsg = null;
  let badMsg = null;
  let cellsOk = 0;
  let openCells = 0;
  const totalCells = expected.length * valueCols.length;

  for (const s of submitted) {
    const allBlank = valueCols.every((c) => isBlank(s.cells[c.key]));
    const out = { x: null, value: null, matched: false, extra: false, ok: false, cells: {} };
    if (isBlank(s.x)) {
      if (allBlank) continue; // an untouched "+ another case" tab
      out.cells = Object.fromEntries(valueCols.map((c) => [c.key, { state: 'open', ok: false, kind: 'malformed', msg: '', normalized: null, value: null }]));
      rows.push(out);
      if (badMsg === null) badMsg = 'Type the value of x for that case first.';
      continue;
    }
    const px = parseValue(s.x);
    if (!px.ok) {
      rows.push({ ...out, x: String(s.x) });
      if (badMsg === null) badMsg = `${xLabel} = ${show(String(s.x))}: ${px.msg ?? 'could not read that'}.`;
      continue;
    }
    out.x = show(px.value);
    out.value = px.value;
    const idx = expected.findIndex((e, i) => !claimed.has(i) && numEquals(e.x, px.value, tol));
    if (idx < 0) {
      const dup = expected.some((e) => numEquals(e.x, px.value, tol));
      out.extra = true;
      rows.push(out);
      if (dup) { if (badMsg === null) badMsg = `${xLabel} = ${show(px.value)} is already a case — one tab per root.`; continue; }
      if (allBlank) { if (badMsg === null) badMsg = `${xLabel} = ${show(px.value)} isn't a root of this equation — check the roots stage.`; continue; }
      if (wrongMsg === null) { wrongMsg = `${xLabel} = ${show(px.value)} isn't a root of this equation — plug it back in.`; tags.push('extra-root'); }
      continue;
    }
    claimed.add(idx);
    out.matched = true;
    const exp = expected[idx].row;
    let rowOk = true;
    for (const c of valueCols) {
      const key = c.key;
      const rawCell = s.cells[key];
      const cell = { state: 'open', ok: false, kind: 'malformed', msg: '', normalized: null, value: null, wedge: c.wedge ?? null };
      out.cells[key] = cell;
      if (isBlank(rawCell)) { rowOk = false; openCells++; continue; }
      const want = exp[key];
      if (colType(c) === 'verdict') {
        const got = parseVerdict(rawCell);
        const wantV = parseVerdict(want);
        cell.normalized = got;
        if (got === null) { cell.state = 'malformed'; cell.msg = `${labelOf(c)}: answer YES or NO.`; rowOk = false; if (badMsg === null) badMsg = cell.msg; continue; }
        if (got === wantV) { cell.state = 'ok'; cell.ok = true; cell.kind = 'correct'; cell.msg = '✓'; cellsOk++; continue; }
        cell.state = 'wrong'; cell.kind = 'wrong'; rowOk = false;
        cell.msg = `${labelOf(c)} for ${xLabel} = ${out.x}: compare the two measures in this row — equal means it bisects, different means it does not.`;
        if (wrongMsg === null) { wrongMsg = cell.msg; tags.push('wrong-verdict'); }
        continue;
      }
      const p = parseValue(rawCell);
      if (!p.ok) { cell.state = 'malformed'; cell.msg = `${labelOf(c)}: ${p.msg ?? 'could not read that'}.`; cell.normalized = p.normalized ?? null; rowOk = false; if (badMsg === null) badMsg = cell.msg; continue; }
      cell.normalized = p.normalized ?? p.text ?? null;
      cell.value = p.value;
      const wantV = toVal(want);
      const cellTol = typeof c.tol === 'number' && c.tol >= 0 ? c.tol : tol;
      if (wantV !== null && numEquals(p.value, wantV, cellTol)) { cell.state = 'ok'; cell.ok = true; cell.kind = 'correct'; cell.msg = '✓'; cellsOk++; continue; }
      cell.state = 'wrong'; cell.kind = 'wrong'; rowOk = false;
      let cmsg = null;
      const cellTags = [];
      const m = matchMisconception(misc, p.value, cellTol, scope);
      if (m && m.tag !== 'missing-case') { cmsg = m.msg; if (m.tag) cellTags.push(m.tag); }
      if (cmsg === null) {
        const other = valueCols.find((o) => o.key !== key && colType(o) !== 'verdict' && toVal(exp[o.key]) !== null
          && !(wantV !== null && numEquals(wantV, toVal(exp[o.key]), cellTol)) && numEquals(p.value, toVal(exp[o.key]), cellTol));
        if (other) { cmsg = `That's ${labelOf(other)} — it goes in the other column.`; cellTags.push('swapped-fields'); }
      }
      if (cmsg === null && wantV !== null && !numEquals(wantV, 0, 0) && numIsNegOf(p.value, wantV, cellTol)) {
        cmsg = `${labelOf(c)} for ${xLabel} = ${out.x}: sign? Right size, wrong sign.`; cellTags.push('sign-flip');
      }
      if (cmsg === null) cmsg = `${labelOf(c)} for ${xLabel} = ${out.x} isn't right — substitute ${out.x} into that expression again.`;
      cell.msg = cmsg;
      cell.tags = cellTags;
      if (wrongMsg === null) { wrongMsg = cmsg; tags.push(...cellTags); }
    }
    out.ok = rowOk && valueCols.every((c) => out.cells[c.key].ok);
    rows.push(out);
  }

  const missingRows = expected.filter((e, i) => !claimed.has(i));
  const normalized = rows.map((r) => ({ [xKey]: r.x, ...Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.normalized])) }));
  const credit = totalCells ? cellsOk / totalCells : 0;
  const base = { rows, normalized, missing: missingRows.length, reveal: null, credit };

  if (wrongMsg !== null) return result('wrong', wrongMsg, { ...base, tags: [...new Set(tags)], code: 'wrong' });
  if (badMsg !== null) return result('malformed', cap(badMsg), { ...base, err: 'parse', code: 'parse' });
  if (!rows.length || cellsOk + openCells === 0) {
    return result('malformed', 'Fill in the table.', { ...base, err: 'empty', code: 'empty', credit: 0 });
  }
  if (missingRows.length) {
    // every submitted row is right so far, but a case has no tab at all
    const n = escalate(ctx, `${part.id ?? 'cases'}:missingCase`);
    const strict = isStrict(ctx);
    const first = missingRows[0];
    if (n === 1 && !strict) {
      const more = missingRows.length > 1 ? `there are ${missingRows.length} more cases` : "there's another case";
      return result('almost', `${cap(more)} — the quadratic has a second root. Work out the measures for it too.`, { ...base, tags: ['missing-case'], code: 'missing-case', submits: n });
    }
    const xText = show(first.row[xKey]);
    const m = misc.find((e) => e && e.tag === 'missing-case' && (e.part == null || String(e.part) === String(part.id ?? '')));
    // card r2: the item's missing-case line already names the root and the measures to work out — printing it
    // after the widget's own "What if x = −1/2?" said the same thing twice. One line or the other, never both.
    const msg = m && m.msg ? String(m.msg) : `What if ${xLabel} = ${xText}? Work out that case too.`;
    return result('wrong', msg, { ...base, tags: ['missing-case'], reveal: { [xKey]: xText, x: xText }, code: 'missing-case', submits: n });
  }
  if (openCells) {
    const open = rows.filter((r) => r.matched && !r.ok).map((r) => `${xLabel} = ${r.x}`);
    const done = rows.filter((r) => r.ok).map((r) => `${xLabel} = ${r.x} ✓`);
    return result('almost', `${done.length ? `${done.join(', ')} — now ` : 'Now '}fill in the ${open.join(' and ')} case${open.length > 1 ? 's' : ''}.`, { ...base, code: 'open' });
  }
  return result('correct', expected.length === 2 ? 'Both cases ✓' : `All ${expected.length} cases ✓`, { ...base, credit: 1, code: 'ok' });
}

export default grade;
