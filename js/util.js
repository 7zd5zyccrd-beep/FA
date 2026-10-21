// Allgemeine Hilfsfunktionen: Datum, Zahlen, DOM

export const $ = (s, root = document) => root.querySelector(s);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function fill(el, ...kids) { el.replaceChildren(); append(el, kids); return el; }

// SVG-Element
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Datum (immer ISO-Zeichenkette JJJJ-MM-TT) ----------
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso, n, day) {
  const [y, m] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day || +iso.slice(8, 10), last));
  return t.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
export function tsToDate(sec, tz = 'Europe/Berlin') {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(sec * 1000));
}
export const today = () => tsToDate(Date.now() / 1000);
export function fmtDate(iso, withWeekday) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const wd = withWeekday ? ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(iso + 'T12:00:00Z').getUTCDay()] + ' ' : '';
  return `${wd}${d}.${m}.${y}`;
}
export const isWeekend = iso => [0, 6].includes(new Date(iso + 'T12:00:00Z').getUTCDay());

// ---------- Zahlen ----------
const nfCache = {};
function nf(min, max) {
  const k = min + '|' + max;
  return nfCache[k] || (nfCache[k] = new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max }));
}
export const fmtNum = (n, min = 2, max = 2) => n == null || !isFinite(n) ? '–' : nf(min, max).format(n);
export const fmtEur = n => n == null || !isFinite(n) ? '–' : nf(2, 2).format(n) + ' €';
export const fmtPct = (n, sign = true) => n == null || !isFinite(n) ? '–'
  : (sign && n > 0 ? '+' : '') + nf(2, 2).format(n * 100) + ' %';
export const fmtShares = n => n == null ? '–' : nf(0, 6).format(n);
export function parseNum(v) {
  let t = String(v ?? '').trim().replace(/\s|€|%/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return isFinite(n) ? n : NaN;
}
// Zahl für ein Eingabefeld (deutsches Format, ohne Tausenderpunkte)
export const numIn = n => n == null || !isFinite(n) ? '' : String(+n.toFixed(8)).replace('.', ',');

// ---------- Kennungen ----------
export function isinValid(id) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(id)) return false;
  const digits = id.split('').map(c => /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c).join('');
  let sum = 0;
  for (let i = digits.length - 1, dbl = false; i >= 0; i--, dbl = !dbl) {
    let d = +digits[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
export const isWkn = id => /^[A-Z0-9]{6}$/.test(id);

// ---------- Sortierte Reihen ----------
// Index des letzten Elements mit key(x) <= v (Liste aufsteigend sortiert), sonst -1
export function lastIndexLE(arr, v, key = x => x.d) {
  let lo = 0, hi = arr.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= v) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
