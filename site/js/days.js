// days.js — local calendar arithmetic (COMPOSED S6/S7). Pure, DOM-free, Node-importable.
// Every date is a local "YYYY-MM-DD" string; differences are whole calendar days computed from
// local y/m/d (via Date.UTC on the parts), so DST shifts and UTC offsets never produce an off-by-one.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DAY = 86400000;

const pad = n => String(n).padStart(2, '0');

/** Local calendar date of `d` (default now) as "YYYY-MM-DD". */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → {y, m, d} (m 1–12) or null when malformed / not a real date. */
export function parseISO(iso) {
  const m = typeof iso === 'string' && ISO_RE.exec(iso);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null; // 2026-02-30 etc.
  return { y, m: mo, d };
}

export function isISO(iso) { return parseISO(iso) !== null; }

/** Days from calendar day `a` to calendar day `b` (b − a). Whole days, sign preserved. */
export function diffDays(a, b) {
  const pa = parseISO(a), pb = parseISO(b);
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / MS_DAY);
}

/** Calendar day `n` days after `iso` (n may be negative). */
export function addDays(iso, n) {
  const p = parseISO(iso);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday, for a local calendar day. */
export function weekday(iso) {
  const p = parseISO(iso);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : NaN;
}

export function isSchoolDay(iso) { const w = weekday(iso); return w >= 1 && w <= 5; }

/** First Mon–Fri day that is at least `minDays` after `fromISO` (S7 default test date: next school day ≥ 2 out). */
export function nextSchoolDay(fromISO, minDays = 2) {
  let d = addDays(fromISO, minDays);
  for (let i = 0; i < 7 && !isSchoolDay(d); i++) d = addDays(d, 1);
  return d;
}

/**
 * D = days until the test, by local calendar date (S7 "D = daysUntilTest via local y/m/d diff").
 * 0 on test day, negative after, null when no date is set or it is malformed.
 */
export function daysUntilTest(testDate, today = todayISO()) {
  if (!testDate) return null;
  const n = diffDays(today, testDate);
  return Number.isNaN(n) ? null : n;
}

/**
 * dayIndex — whole days since the save was created (day 0 = the local calendar day of createdAt).
 * Feeds the Page seed cyrb53(profileId|dayIndex|pageIndex) (S1). Accepts a ms timestamp, a Date,
 * or a "YYYY-MM-DD" string for createdAt. Never negative.
 */
export function dayIndex(createdAt, today = todayISO()) {
  let start;
  if (typeof createdAt === 'number') start = todayISO(new Date(createdAt));
  else if (createdAt instanceof Date) start = todayISO(createdAt);
  else start = createdAt;
  const n = diffDays(start, today);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

/** Local ms timestamp of `testDate` at `testTime` ("HH:MM", default 08:00). null when unset. */
export function testMoment(testDate, testTime = '08:00') {
  const p = parseISO(testDate);
  if (!p) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(testTime || '08:00');
  const hh = m ? Math.min(23, +m[1]) : 8, mm = m ? Math.min(59, +m[2]) : 0;
  return new Date(p.y, p.m - 1, p.d, hh, mm, 0, 0).getTime();
}

/** Local "HH:MM" of a Date (default now). */
export function timeHM(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

/** Quiet hours: 22:00 local and later (Global rule 6 — sound muted, Night Before soft-closes). */
export function isQuietHours(d = new Date()) { return d.getHours() >= 22; }
