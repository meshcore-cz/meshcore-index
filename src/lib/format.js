// Small formatting helpers shared across release listings.

/** Prefix bare numeric versions with "v" (e.g. 1.16.0 → v1.16.0). */
export function displayVersion(v) {
  return /^\d/.test(v) ? 'v' + v : v;
}

/** ISO datetime → "2026-06-06 14:32 UTC"; a date-only string passes through. */
export function fmtDateTime(dt) {
  if (!dt) return '';
  return dt.length <= 10 ? dt : dt.slice(0, 16).replace('T', ' ') + ' UTC';
}

/** Human "x days ago" relative to now (evaluated at render time). */
export function relativeTime(dt) {
  if (!dt) return '';
  const then = new Date(dt).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  const u = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return u(m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return u(h, 'hour');
  const d = Math.round(h / 24);
  if (d < 30) return u(d, 'day');
  const mo = Math.round(d / 30);
  if (mo < 12) return u(mo, 'month');
  return u(Math.round(d / 365), 'year');
}

/** Full localized date/time for hover text and other precise timestamps. */
export function fullDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(+d)) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/** Use relative time only for fresh timestamps, falling back to a full date. */
export function recentTimeLabel(dt, maxAgeDays = 7) {
  if (!dt) return '';
  const then = new Date(dt).getTime();
  if (Number.isNaN(then)) return '';
  const age = Date.now() - then;
  if (age >= 0 && age < maxAgeDays * 24 * 60 * 60 * 1000) return relativeTime(dt);
  return fullDateTime(dt);
}
