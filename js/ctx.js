// Gemeinsamer Zugriff der Ansichten auf Daten, Berechnung und Navigation
import { state } from './db.js';
import { Model, KINDS } from './calc.js';
import { daysBetween, today } from './util.js';

export const VERSION = '1.0.2';

let cache = { v: -1, m: null };
export function model() {
  if (cache.v !== state.version) cache = { v: state.version, m: new Model(state) };
  return cache.m;
}

export const setting = (k, def) => state.meta['set.' + k] ?? def;
export const sec = id => state.securities.find(x => x.id === id);
export const depot = id => state.depots.find(x => x.id === id);
export const secName = id => (sec(id) || {}).name || 'Unbekanntes Wertpapier';
export const depotName = id => (depot(id) || {}).name || 'Unbekanntes Depot';
export const kindName = k => KINDS[k] || 'Sonstiges';

// Rückweg: Liste der aufgerufenen Ansichten; die Hauptbereiche der Tableiste beginnen sie neu
const TAB_ROOTS = ['#/', '#/bestand', '#/buchungen', '#/auswertung', '#/mehr'];
const pathOf = hash => (hash || '#/').split('?')[0].replace(/^#?\/?$/, '#/');
let nav = [];
try { nav = JSON.parse(sessionStorage.getItem('nav') || '[]'); } catch { /* egal */ }
let replaceNext = false;
export function trackNav(hash) {
  hash = hash || '#/';
  const path = pathOf(hash);
  if (replaceNext) { nav.pop(); replaceNext = false; }
  if (TAB_ROOTS.includes(path)) nav = [hash];
  else {
    const i = nav.findIndex(x => pathOf(x) === path);
    nav = i >= 0 ? [...nav.slice(0, i), hash] : [...nav, hash];
  }
  try { sessionStorage.setItem('nav', JSON.stringify(nav.slice(-30))); } catch { /* egal */ }
}
export function goBack(fallback) {
  if (nav.length >= 2) location.hash = nav[nav.length - 2];
  else go(fallback || '#/');
}

// replace: aktuelle Ansicht (z. B. ein gespeichertes Formular) aus dem Rückweg entfernen
export function go(hash, { replace = false } = {}) {
  replaceNext = replace; if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
export function rerender() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

// Abfrageparameter aus der Adresse nach dem #
export function params() {
  const q = location.hash.split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q));
}

// Zeiträume für Auswertungen
export function periodRange(key, from, to) {
  const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7);
  const first = model().firstDate() || t;
  const pad = n => String(n).padStart(2, '0');
  const minus = (years, months = 0) => {
    const d = new Date(Date.UTC(y - years, m - 1 - months, +t.slice(8, 10)));
    return d.toISOString().slice(0, 10);
  };
  let a, b = t;
  switch (key) {
    case 'month': a = `${y}-${pad(m)}-01`; break;
    case 'prevMonth': {
      const d = new Date(Date.UTC(y, m - 2, 1));
      a = d.toISOString().slice(0, 10);
      b = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
      break;
    }
    case 'ytd': a = `${y}-01-01`; break;
    case 'prevYear': a = `${y - 1}-01-01`; b = `${y - 1}-12-31`; break;
    case '1y': a = minus(1); break;
    case '3y': a = minus(3); break;
    case '5y': a = minus(5); break;
    case 'custom': a = from || first; b = to || t; break;
    default: a = first;
  }
  if (a < first && key !== 'custom') a = first;
  if (b > t) b = t;
  if (a > b) a = b;
  return { a, b };
}
export const PERIODS = [
  ['month', 'Lfd. Monat'], ['prevMonth', 'Vormonat'], ['ytd', 'Lfd. Jahr'], ['prevYear', 'Vorjahr'],
  ['1y', '1 Jahr'], ['3y', '3 Jahre'], ['5y', '5 Jahre'], ['all', 'Seit Beginn'], ['custom', 'Frei'],
];

// Sicherungserinnerung fällig?
export function backupDue() {
  const has = state.txs.length || state.securities.length;
  if (!has || !(state.meta.changes > 0)) return false;
  if (!state.meta.lastBackup) return true;
  return daysBetween(state.meta.lastBackup.slice(0, 10), today()) >= setting('backupDays', 7);
}
