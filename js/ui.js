// Wiederverwendbare Bausteine der Oberfläche
import { h, fmtEur, fmtPct, fmtNum, parseNum } from './util.js';
import { goBack } from './ctx.js';

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  holdings: '<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7"/><path d="M3.5 12.5h17"/>',
  txs: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
  more: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  share: '<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 12v7.5h14V12"/>',
};
export function icon(name, cls) {
  const el = h('span', { class: 'ic ' + (cls || ''), 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:100%;height:100%">${ICONS[name]}</svg>`;
  return el;
}

// Seitenkopf: Titel, optional Zurück-Link und Aktionsknöpfe
export function head(title, { back, actions = [] } = {}) {
  return h('div', { class: 'head' + (back ? ' sub' : '') },
    back ? h('a', { class: 'back', href: back, 'aria-label': 'Zurück', onclick: e => { e.preventDefault(); goBack(back); } }, icon('back')) : null,
    h('h1', {}, title),
    actions);
}
export function iconBtn(name, label, onclick, href) {
  return href
    ? h('a', { class: 'iconbtn', href, 'aria-label': label, title: label }, icon(name))
    : h('button', { class: 'iconbtn', type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
}

export function row({ title, sub, right, rightSub, rightCls, href, onclick, badge, chev = !!(href || onclick) }) {
  const kids = [
    h('div', { class: 'main' }, h('div', { class: 'title' }, title, badge || null), sub ? h('div', { class: 'sub' }, sub) : null),
    right != null || rightSub != null ? h('div', { class: 'right' },
      right != null ? h('div', { class: rightCls || '' }, right) : null,
      rightSub != null ? (rightSub instanceof Node ? h('div', { class: 'sub' }, rightSub) : h('div', { class: 'sub' }, rightSub)) : null) : null,
    chev ? h('span', { class: 'chev' }, icon('chev')) : null,
  ];
  if (href) return h('a', { class: 'row', href }, kids);
  if (onclick) return h('button', { class: 'row', type: 'button', onclick }, kids);
  return h('div', { class: 'row' }, kids);
}
export const list = (...rows) => h('div', { class: 'list' }, rows);

export const signCls = n => n > 0.000001 ? 'pos' : n < -0.000001 ? 'neg' : '';
export const money = (n, colored) => h('span', { class: colored ? signCls(n) : '' }, colored && n > 0 ? '+' + fmtEur(n) : fmtEur(n));
export const pct = (n, colored = true) => h('span', { class: colored ? signCls(n) : '' }, fmtPct(n));

export function kpi(label, val, note, cls) {
  return h('div', { class: 'kpi' }, h('div', { class: 'label' }, label), h('div', { class: 'val ' + (cls || '') }, val), note ? h('div', { class: 'note' }, note) : null);
}

// Segment-Umschalter
export function seg(options, value, onchange) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  for (const [v, label] of options) {
    el.append(h('button', { type: 'button', class: v === value ? 'on' : '', role: 'radio', 'aria-checked': v === value ? 'true' : 'false', onclick: () => onchange(v) }, label));
  }
  return el;
}
export function chips(options, value, onchange) {
  const el = h('div', { class: 'chips' });
  for (const [v, label] of options) el.append(h('button', { type: 'button', class: 'chip' + (v === value ? ' on' : ''), 'aria-pressed': v === value ? 'true' : 'false', onclick: () => onchange(v) }, label));
  // Nur waagrecht im Behälter scrollen – die Seite selbst darf sich nicht bewegen
  requestAnimationFrame(() => { const on = el.querySelector('.on'); if (on) el.scrollLeft = Math.max(0, on.offsetLeft - el.offsetLeft - (el.clientWidth - on.offsetWidth) / 2); });
  return el;
}

export function field(label, input, hint, err) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('div', { class: 'hint' }, hint) : null, err ? h('div', { class: 'err' }, err) : null);
}
export function numInput(attrs = {}) {
  return h('input', { inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next', ...attrs });
}
// Zeigt unter Zahlenfeldern mit Punkt, wie die Eingabe gelesen wird („gelesen als 10.000,00“)
export function readAsHints(root) {
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.getAttribute('inputmode') !== 'decimal') return;
    let hint = el.nextElementSibling && el.nextElementSibling.classList.contains('readas') ? el.nextElementSibling : null;
    const v = parseNum(el.value);
    const show = el.value.includes('.') && v != null;
    if (!show) { if (hint) hint.remove(); return; }
    if (!hint) { hint = h('div', { class: 'hint readas' }); el.after(hint); }
    hint.textContent = Number.isNaN(v) ? 'keine gültige Zahl' : 'gelesen als ' + fmtNum(v, 2, 8);
  });
}

export function select(options, value, attrs = {}) {
  const el = h('select', attrs);
  for (const o of options) {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    el.append(h('option', { value: v }, label));
  }
  if (value != null) el.value = value;
  return el;
}

// ---------- Blatt, Bestätigung, Meldung ----------
export function sheet(build) {
  return new Promise(resolve => {
    const close = v => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }));
    const bg = h('div', { class: 'sheet-bg', onclick: e => { if (e.target === bg) close(null); } }, box);
    box.append(...[].concat(build(close)).filter(Boolean));
    document.body.append(bg);
    document.addEventListener('keydown', onKey);
    const first = box.querySelector('[data-autofocus]');
    if (first) setTimeout(() => first.focus(), 250);
  });
}
export function confirmSheet(title, text, okLabel = 'OK', danger = false) {
  return sheet(close => [
    h('h3', {}, title), text ? h('p', {}, text) : null,
    h('button', { class: 'btn ' + (danger ? 'danger' : ''), type: 'button', onclick: () => close(true) }, okLabel),
    h('button', { class: 'btn sec', type: 'button', onclick: () => close(false) }, 'Abbrechen'),
  ]);
}
let toastTimer;
export function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

// Datei teilen (iPhone: „In Dateien sichern“) oder herunterladen
export async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = h('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}
