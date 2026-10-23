import { h, fmtEur, fmtNum, fmtDate, fmtShares, today, parseNum, numIn, uid, debounce, addDays } from '../util.js';
import { head, iconBtn, list, chips, field, numInput, select, seg, confirmSheet, toast, readAsHints } from '../ui.js';
import { state, save, remove, setMeta } from '../db.js';
import { TX_TYPES, Model, grossEur, taxSum, txTotal, normCur } from '../calc.js';
import { model, params, sec, secName, depotName, go, goBack } from '../ctx.js';
import { txRow } from './holdings.js';
import { fxOn } from '../prices.js';

const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };

const GROUPS = {
  all: () => true,
  trade: t => ['buy', 'sell'].includes(t.type),
  income: t => ['div', 'interest'].includes(t.type),
  other: t => !['buy', 'sell', 'div', 'interest'].includes(t.type),
};
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function txList(view) {
  const group = lsGet('tx.group', 'all');
  const query = (lsGet('tx.q', '') || '').toLowerCase();
  const out = [head('Buchungen', { actions: [iconBtn('plus', 'Buchung erfassen', null, '#/buchung/neu')] })];
  const search = h('input', { type: 'search', placeholder: 'Wertpapier suchen', value: query, enterkeyhint: 'search', autocomplete: 'off',
    oninput: e => { lsSet('tx.q', e.target.value); draw(); } });
  out.push(h('div', { style: 'margin-bottom:8px' }, search));
  out.push(chips([['all', 'Alle'], ['trade', 'Käufe & Verkäufe'], ['income', 'Erträge'], ['other', 'Sonstige']], group,
    v => { lsSet('tx.group', v); go('#/buchungen'); }));
  const box = h('div');
  out.push(box);
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const txs = model().txs.filter(GROUPS[group] || GROUPS.all)
      .filter(t => !q || ((sec(t.secId) || {}).name || '').toLowerCase().includes(q) || ((sec(t.secId) || {}).isin || '').toLowerCase().includes(q))
      .slice().reverse();
    if (!txs.length) {
      box.replaceChildren(h('div', { class: 'list' }, h('div', { class: 'empty' }, state.txs.length ? 'Keine passenden Buchungen.' : 'Noch keine Buchungen.',
        state.txs.length ? null : h('div', {}, h('a', { class: 'btn', href: '#/buchung/neu' }, 'Erste Buchung erfassen')))));
      return;
    }
    const parts = [];
    let cur = null, rows = [];
    const flush = () => { if (rows.length) parts.push(h('h2', {}, cur), list(...rows)); rows = []; };
    for (const t of txs.slice(0, 400)) {
      const label = MONTHS[+t.date.slice(5, 7) - 1] + ' ' + t.date.slice(0, 4);
      if (label !== cur) { flush(); cur = label; }
      rows.push(txRow(t));
    }
    flush();
    if (txs.length > 400) parts.push(h('p', { class: 'small muted center' }, `Die ältesten ${txs.length - 400} Buchungen sind ausgeblendet – über die Suche erreichbar.`));
    box.replaceChildren(...parts);
  };
  draw();
  view.replaceChildren(...out);
}

// ---------- Formular ----------
// Entwurf einer neuen Buchung: übersteht das Verlassen des Formulars und das Beenden der App
const DRAFT_KEY = 'tx.draft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
const saveDraft = data => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: new Date().toISOString(), data })); } catch { /* egal */ } };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* egal */ } };

const COMMON_CURS = ['EUR', 'USD', 'GBP', 'GBp', 'CHF'];
const NUM_FIELDS = ['shares', 'price', 'amount', 'fees', 'accrued', 'kest', 'soli', 'kist', 'qst', 'ratio', 'fx'];
const LABELS = {
  sec: 'Wertpapier', date: 'Datum', shares: 'Stückzahl', price: 'Kurs', amount: 'Bruttobetrag', fx: 'Devisenkurs',
  fees: 'Gebühren', accrued: 'Stückzinsen', kest: 'Kapitalertragsteuer', soli: 'Solidaritätszuschlag', kist: 'Kirchensteuer',
  qst: 'Quellensteuer', ratio: 'Verhältnis', target: 'Neues Wertpapier',
};
// Welche Felder je Buchungsart gelten
const KEEP = {
  buy: ['shares', 'price', 'fees', 'accrued'], sell: ['shares', 'price', 'fees', 'accrued', 'kest', 'soli', 'kist'],
  in: ['shares', 'price'], out: ['shares', 'price'], div: ['amount', 'fees', 'kest', 'soli', 'kist', 'qst'], interest: ['amount', 'fees', 'kest', 'soli', 'kist', 'qst'],
  tax: ['kest', 'soli', 'kist'], split: ['ratio'], exchange: ['ratio'], spinoff: ['ratio', 'price'],
};
// Börsenplätze für die Buchung (nur zur Dokumentation); fehlende auf Zuruf ergänzen
const VENUES = [
  ['Deutsche Börsen', ['Xetra', 'Tradegate', 'gettex', 'Frankfurt', 'Berlin', 'Düsseldorf', 'Hamburg', 'Hannover', 'München', 'Stuttgart', 'Quotrix', 'LS Exchange']],
  ['Fonds', ['Fondsgesellschaft']],
  ['Ausland', ['NYSE', 'Nasdaq', 'London']],
  ['Sonstige', ['außerbörslich']],
];
const ALL_VENUES = VENUES.flatMap(([, v]) => v);
const OTHER = '__other';
function venueSelect(value) {
  const el = h('select', {},
    h('option', { value: '' }, 'Keine Angabe'),
    VENUES.map(([label, vs]) => h('optgroup', { label }, vs.map(v => h('option', { value: v }, v)))),
    h('option', { value: OTHER }, 'Anderer …'));
  el.value = !value ? '' : ALL_VENUES.includes(value) ? value : OTHER;
  return el;
}
const WITH_CURRENCY = ['buy', 'sell', 'in', 'out', 'div', 'interest', 'spinoff'];

export function txForm(view, id) {
  const p = params();
  const existing = id !== 'neu' ? state.txs.find(t => t.id === id) : null;
  const fallback = existing ? `#/wp/${existing.secId}` : (p.wp ? `#/wp/${p.wp}` : '#/buchungen');
  if (id !== 'neu' && !existing) { view.replaceChildren(head('Nicht gefunden', { back: '#/buchungen' })); return; }
  if (!state.depots.length) {
    view.replaceChildren(head('Neue Buchung', { back: '#/buchungen' }),
      h('div', { class: 'card' }, h('p', {}, 'Lege zuerst ein Depot an.'), h('a', { class: 'btn block', href: '#/depot/neu?ret=' + encodeURIComponent('#/buchung/neu') }, 'Depot anlegen')));
    return;
  }

  // Entwurf: nach „Neues Wertpapier“ oder „Fortsetzen“ übernehmen, sonst anbieten
  let draft = existing ? null : loadDraft();
  let offer = null;
  if (draft && !(p.fromNew || p.entwurf)) { offer = draft; draft = null; }
  const defaultDepot = p.depot || (state.depots.length === 1 ? state.depots[0].id : (state.meta['set.lastDepot'] || state.depots[0].id));
  const tx = existing ? { ...existing } : {
    id: uid(), type: p.typ || 'buy', date: p.datum || today(), depotId: defaultDepot, secId: p.wp || '',
    ...(p.plan ? { planId: p.plan, planDate: p.datum, note: 'Sparplan' } : {}),
    ...(p.ratio ? { ratio: Number(p.ratio) } : {}),
    ...(draft ? draft.data : {}),
  };
  if (p.fromNew && p.newId) {
    if (p.target) tx.targetSecId = p.newId;
    else { tx.secId = p.newId; delete tx.currency; }   // neue Wertpapierwährung gilt
  }
  if (!existing && p.plan && !draft) {
    const plan = state.plans.find(x => x.id === p.plan);
    if (plan) { tx.secId = plan.secId; tx.depotId = plan.depotId; tx.planAmount = plan.amount; }
  }
  let refund = taxSum(tx) < 0;
  // Ohne die bearbeitete Buchung (für „Bestand vorher“)
  const mWithout = existing ? new Model({ ...state, txs: state.txs.filter(t => t.id !== existing.id) }) : model();

  const form = h('form', { class: 'form', novalidate: true, autocomplete: 'off' });
  const summary = h('div', { class: 'card' });
  const abs = v => v == null ? v : Math.abs(v);
  const qstShown = tx.qstCur != null ? tx.qstCur : tx.qst;
  const f = {
    type: select(Object.entries(TX_TYPES), tx.type),
    depot: select(state.depots.map(d => [d.id, d.name]), tx.depotId),
    sec: select([['', 'Bitte wählen …'], ...state.securities.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(s => [s.id, s.name]), ['__new', '＋ Neues Wertpapier anlegen …']], tx.secId || ''),
    date: h('input', { type: 'date', value: tx.date, max: today() }),
    shares: numInput({ value: numIn(tx.shares) }),
    price: numInput({ value: numIn(tx.price) }),
    currency: select([], null),
    fx: numInput({ value: tx.fx && tx.fx !== 1 ? numIn(tx.fx) : '' }),
    amount: numInput({ value: numIn(tx.amount) }),
    fees: numInput({ value: numIn(tx.fees), placeholder: '0,00' }),
    accrued: numInput({ value: numIn(tx.accrued), placeholder: '0,00' }),
    kest: numInput({ value: numIn(abs(tx.kest)), placeholder: '0,00' }),
    soli: numInput({ value: numIn(abs(tx.soli)), placeholder: '0,00' }),
    kist: numInput({ value: numIn(abs(tx.kist)), placeholder: '0,00' }),
    qst: numInput({ value: numIn(qstShown), placeholder: '0,00' }),
    ratio: numInput({ value: numIn(tx.ratio) }),
    target: select([['', 'Bitte wählen …'], ...state.securities.map(s => [s.id, s.name]), ['__new', '＋ Neues Wertpapier anlegen …']], tx.targetSecId || ''),
    venue: venueSelect(tx.venue),
    venueOther: h('input', { value: tx.venue && !ALL_VENUES.includes(tx.venue) ? tx.venue : '', autocorrect: 'off', placeholder: 'Name des Börsenplatzes' }),
    note: h('textarea', { rows: 2, 'aria-label': 'Notiz' }, tx.note || ''),
  };
  const fxBtn = h('button', { type: 'button', class: 'btn small sec', style: 'margin-top:6px' }, 'EZB-Kurs vom Tag einsetzen');
  const S = () => sec(f.sec.value) || null;
  const type = () => f.type.value;
  const isBond = () => (S() || {}).kind === 'bond';
  const foreign = () => !!f.currency.value && normCur(f.currency.value).cur !== 'EUR';

  // Währungen: Wertpapierwährung, übliche Währungen, Währungen der Börsenplätze und bisheriger Buchungen
  const fillCurrency = reset => {
    const s = S();
    const secCur = (s && s.currency) || 'EUR';
    const opts = [...new Set([secCur, ...COMMON_CURS,
      ...((s && s.ov && s.ov.notations) || []).map(n => n.currency).filter(Boolean),
      ...state.txs.map(t => t.currency).filter(Boolean)])];
    const want = reset ? secCur : (f.currency.value || tx.currency || secCur);
    f.currency.replaceChildren(...opts.map(c => h('option', { value: c }, c === 'GBp' || c === 'GBX' ? `${c} (Pence)` : c)));
    f.currency.value = opts.includes(want) ? want : secCur;
  };

  const fieldsBox = h('div');
  const section = (title, ...kids) => [h('h2', {}, title), h('div', { class: 'card' }, kids)];
  const fxBox = h('div');
  const curNote = h('div', { class: 'hint' });
  const updateFx = () => {
    const s = S();
    const cur = normCur(f.currency.value || 'EUR').cur;
    const secCur = normCur((s && s.currency) || 'EUR').cur;
    curNote.textContent = s && cur !== secCur
      ? `Bewertet wird in ${secCur}${s.ov && s.ov.venue ? ' (' + s.ov.venue + ')' : ''}. Die Buchung in ${cur} ist trotzdem richtig – mit dem Devisenkurs der Abrechnung.` : '';
    fxBox.replaceChildren(...(foreign() ? [field(`Devisenkurs (${cur} je 1 €)`, f.fx, 'Wie auf der Abrechnung, z. B. 1,0850.'), fxBtn] : []));
    const qLabel = f.qst.closest('label');
    if (qLabel) qLabel.querySelector('span').textContent = foreign() ? `Quellensteuer (${cur})` : 'Quellensteuer';
  };
  const taxSegBox = h('div', { style: 'margin:10px 0 2px' });
  const drawTaxSeg = () => taxSegBox.replaceChildren(seg([['debit', 'Belastung'], ['refund', 'Erstattung']], refund ? 'refund' : 'debit',
    v => { refund = v === 'refund'; drawTaxSeg(); calc(); }));
  const taxFields = withQst => h('div', {},
    h('div', { class: 'grid2' }, field('Kapitalertragsteuer', f.kest), field('Solidaritätszuschlag', f.soli)),
    h('div', { class: 'grid2' }, field('Kirchensteuer', f.kist), withQst ? field('Quellensteuer', f.qst) : h('span')));
  const splitNote = h('div', { class: 'hint' });

  const layout = () => {
    const t = type();
    const unit = isBond() ? 'Nennwert' : 'Stück';
    const parts = [];
    parts.push(...section('Buchung',
      field('Art', f.type),
      field('Depot', f.depot),
      field(['exchange', 'spinoff'].includes(t) ? 'Bisheriges Wertpapier' : 'Wertpapier', f.sec, tx.planAmount ? `Sparplan über ${fmtEur(tx.planAmount)}` : null),
      field('Datum', f.date, t === 'buy' || t === 'sell' ? 'Handelstag laut Abrechnung' : null)));
    if (['buy', 'sell', 'in', 'out'].includes(t)) {
      parts.push(...section(t === 'in' || t === 'out' ? 'Stücke' : 'Ausführung',
        h('div', { class: 'grid2' },
          field(unit, f.shares, isBond() ? 'z. B. 10000' : 'auch Bruchstücke'),
          field(isBond() ? 'Kurs in %' : (t === 'in' ? 'Einstandskurs' : 'Kurs'), f.price, t === 'in' ? 'für den Einstand' : null)),
        field('Währung des Kurses', f.currency), curNote, fxBox,
        ['buy', 'sell'].includes(t) ? field('Börsenplatz', f.venue) : null,
        ['buy', 'sell'].includes(t) && f.venue.value === OTHER ? field('Anderer Börsenplatz', f.venueOther) : null));
      if (t === 'buy') parts.push(...section('Kosten', h('div', { class: 'grid2' }, field('Gebühren (€)', f.fees), isBond() ? field('Stückzinsen (€)', f.accrued) : h('span'))));
      if (t === 'sell') {
        parts.push(...section('Kosten', h('div', { class: 'grid2' }, field('Gebühren (€)', f.fees), isBond() ? field('Stückzinsen (€)', f.accrued) : h('span'))));
        parts.push(...section('Steuern (€)', taxSegBox, taxFields(false)));
      }
    }
    if (['div', 'interest'].includes(t)) {
      parts.push(...section('Betrag',
        h('div', { class: 'grid2' }, field('Brutto', f.amount, 'vor allen Steuern'), field('Währung', f.currency)),
        fxBox, field('Gebühren (€)', f.fees)));
      parts.push(...section('Steuern', taxFields(true), h('div', { class: 'hint' }, 'Kapitalertragsteuer, Soli und Kirchensteuer in €.')));
    }
    if (t === 'tax') {
      parts.push(h('p', { class: 'small muted', style: 'margin:12px 4px 0' }, 'Für Steuern ohne Kauf oder Verkauf, z. B. die Vorabpauschale oder eine Erstattung.'));
      parts.push(...section('Steuern (€)', taxSegBox, taxFields(false)));
    }
    if (t === 'split') {
      parts.push(...section('Verhältnis', field('Neue Stücke je bisheriges Stück', f.ratio, 'Split 1:4 → 4 · Zusammenlegung 10:1 → 0,1'), splitNote));
    }
    if (['exchange', 'spinoff'].includes(t)) {
      parts.push(...section(t === 'exchange' ? 'Umtausch' : 'Abspaltung',
        field(t === 'exchange' ? 'Neues Wertpapier' : 'Abgespaltenes Wertpapier', f.target),
        field('Neue Stücke je bisheriges Stück', f.ratio, t === 'exchange' ? 'Die bisherigen Stücke werden vollständig ausgebucht.' : 'Die bisherigen Stücke bleiben im Bestand.'),
        t === 'spinoff' ? field('Kurs der neuen Aktie in € (optional)', f.price, 'Nur nötig, falls noch kein Kurs abrufbar ist.') : null));
    }
    parts.push(...section('Notiz', f.note));
    fieldsBox.replaceChildren(...parts);
    drawTaxSeg();
    updateFx();
    calc();
  };

  const read = () => {
    const n = el => parseNum(el.value);
    const t = type();
    const o = { ...tx, type: t, depotId: f.depot.value, secId: f.sec.value, date: f.date.value, note: f.note.value.trim() };
    for (const k of NUM_FIELDS) o[k] = n(f[k]);
    o.currency = WITH_CURRENCY.includes(t) && t !== 'spinoff' ? f.currency.value || undefined : undefined;
    if (o.currency && normCur(o.currency).cur !== 'EUR') { /* fx bleibt wie eingegeben */ } else delete o.fx;
    const sign = refund && ['sell', 'tax'].includes(t) ? -1 : 1;
    for (const k of ['kest', 'soli', 'kist']) if (o[k] != null && !Number.isNaN(o[k])) o[k] = Math.abs(o[k]) * sign;
    delete o.qstCur;
    if (['div', 'interest'].includes(t) && o.currency && normCur(o.currency).cur !== 'EUR' && o.qst != null && !Number.isNaN(o.qst)) {
      o.qstCur = o.qst;
      o.qst = o.fx > 0 ? o.qst / normCur(o.currency).div / o.fx : NaN;
    }
    o.venue = f.venue.value === OTHER ? f.venueOther.value.trim() : f.venue.value;
    o.targetSecId = ['exchange', 'spinoff'].includes(t) ? f.target.value : undefined;
    for (const k of NUM_FIELDS) if (k !== 'fx' && (!KEEP[t].includes(k) || o[k] == null)) delete o[k];
    if (o.fx == null) delete o.fx;
    if (!['buy', 'sell'].includes(t)) delete o.venue;
    if (!o.currency) delete o.currency;
    if (!o.targetSecId) delete o.targetSecId;
    if (!o.qstCur && o.qstCur !== 0) delete o.qstCur;
    delete o.planAmount;
    return o;
  };

  // Prüfung je Feld: [{ k: Feldname, msg }]
  const validate = o => {
    const e = [];
    const need = (k, cond = v => v > 0, msg) => { if (o[k] == null || Number.isNaN(o[k]) || !cond(o[k])) e.push({ k, msg: msg || `${LABELS[k]} angeben` }); };
    if (!o.secId || o.secId === '__new') e.push({ k: 'sec', msg: 'Wertpapier wählen' });
    if (!o.date) e.push({ k: 'date', msg: 'Datum angeben' });
    else if (o.date > today()) e.push({ k: 'date', msg: 'Datum liegt in der Zukunft' });
    if (['buy', 'sell', 'in', 'out'].includes(o.type)) { need('shares'); if (['buy', 'sell'].includes(o.type)) need('price'); }
    if (['div', 'interest'].includes(o.type)) need('amount');
    if (['split', 'exchange', 'spinoff'].includes(o.type)) need('ratio');
    if (['exchange', 'spinoff'].includes(o.type) && (!o.targetSecId || o.targetSecId === '__new' || o.targetSecId === o.secId)) e.push({ k: 'target', msg: 'Neues Wertpapier wählen' });
    if (o.currency && normCur(o.currency).cur !== 'EUR' && ['buy', 'sell', 'div', 'interest'].includes(o.type)) need('fx', v => v > 0, 'Devisenkurs der Abrechnung angeben');
    for (const k of ['fees', 'accrued', 'kest', 'soli', 'kist', 'price', 'shares', 'amount', 'ratio']) {
      if (Number.isNaN(o[k]) && !e.some(x => x.k === k)) e.push({ k, msg: `${LABELS[k]}: keine gültige Zahl` });
    }
    if (Number.isNaN(o.qst) && !e.some(x => x.k === 'qst' || x.k === 'fx')) e.push({ k: 'qst', msg: 'Quellensteuer: keine gültige Zahl' });
    return e;
  };
  const showErrors = list => {
    for (const el of form.querySelectorAll('.invalid')) el.classList.remove('invalid');
    for (const el of form.querySelectorAll('.err')) el.remove();
    for (const { k, msg } of list) {
      const el = f[k];
      if (!el) continue;
      el.classList.add('invalid');
      const lab = el.closest('label.field');
      (lab || el.parentNode).append(h('div', { class: 'err' }, msg));
    }
    const first = list.length && f[list[0].k];
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => first.focus({ preventScroll: true }), 350); }
  };
  form.addEventListener('input', e => {
    const el = e.target;
    if (el.classList.contains('invalid')) { el.classList.remove('invalid'); const err = el.closest('label.field') && el.closest('label.field').querySelector('.err'); if (err) err.remove(); }
  });

  const calc = () => {
    const o = read();
    const s = S();
    const rows = [];
    const r = (label, v, cls) => rows.push(h('div', { class: 'sum ' + (cls || '') }, h('span', {}, label), h('span', {}, v)));
    const signed = (v, plus) => (plus ? '+ ' : '− ') + fmtEur(Math.abs(v));
    if (['buy', 'sell', 'div', 'interest'].includes(o.type) && s) {
      const g = grossEur(o, s);
      const div = ['div', 'interest'].includes(o.type);
      r(div ? 'Brutto' : 'Kurswert', fmtEur(g));
      if (o.accrued) r('Stückzinsen', signed(o.accrued, true));
      if (o.fees) r('Gebühren', signed(o.fees, o.type === 'buy'));
      const tax = taxSum(o);
      if (tax && !Number.isNaN(tax)) r(tax < 0 ? 'Steuererstattung' : 'Steuern', signed(tax, o.type === 'buy' || tax < 0));
      if (o.qstCur && foreign()) r('davon Quellensteuer', `${fmtNum(o.qstCur)} ${normCur(o.currency).cur} = ${fmtEur(o.qst)}`);
      const total = txTotal(o, s);
      r(o.type === 'buy' ? 'Belastung' : 'Gutschrift', fmtEur(total), 'total');
      if (tx.planAmount && o.type === 'buy') r('Sparrate laut Plan', fmtEur(tx.planAmount));
    } else if (o.type === 'tax') {
      const t = taxSum(o);
      if (!Number.isNaN(t)) r(t < 0 ? 'Erstattung' : 'Belastung', fmtEur(Math.abs(t)), 'total');
    } else if (o.type === 'split' && s) {
      const have = mWithout.sharesAt(o.depotId + '|' + o.secId, o.date);
      if (o.ratio > 0) r('Bestand danach', `${fmtShares(have * o.ratio)} statt ${fmtShares(have)}`, 'total');
      const others = mWithout.keys(k => k.endsWith('|' + o.secId) && !k.startsWith(o.depotId + '|') && mWithout.sharesAt(k, o.date) > 0)
        .map(k => depotName(k.split('|')[0]));
      splitNote.textContent = 'Gilt nur für dieses Depot.' + (others.length ? ` Das Wertpapier liegt auch in: ${others.join(', ')} – dort den Split ebenfalls buchen.` : '');
    }
    summary.replaceChildren(...(rows.length ? rows : [h('div', { class: 'small muted' }, 'Die Zusammenfassung erscheint nach der Eingabe.')]));
  };

  // Folgen einer Änderung für Bestand und Erträge prüfen (nur neu entstehende Probleme melden)
  const problems = (m, key) => {
    const res = [];
    const [d, s] = key.split('|');
    const neg = (m.pos.get(key) || []).find(e => e.n < -1e-6);
    if (neg) res.push(`Am ${fmtDate(neg.d)} läge der Bestand von ${secName(s)} in ${depotName(d)} bei ${fmtShares(neg.n)} Stück.`);
    for (const t of m.txs) {
      if (t.depotId + '|' + t.secId !== key || !['div', 'interest'].includes(t.type)) continue;
      // Erträge kurz nach einem Verkauf sind üblich; gemeldet wird nur ein Ertrag ohne Bestand im Vormonat
      const had = [0, 10, 20, 31, 45].some(back => m.sharesAt(key, addDays(t.date, -back)) > 0);
      if (!had) res.push(`${TX_TYPES[t.type]} vom ${fmtDate(t.date)} (${secName(s)}) hätte keinen Bestand.`);
    }
    return res;
  };
  const consequences = newTxs => {
    const before = model(), after = new Model({ ...state, txs: newTxs });
    const keys = new Set();
    for (const t of [existing, ...newTxs.filter(t => t.id === tx.id)].filter(Boolean)) {
      keys.add(t.depotId + '|' + t.secId);
      if (t.targetSecId) keys.add(t.depotId + '|' + t.targetSecId);
    }
    const msgs = [];
    for (const key of keys) {
      const old = new Set(problems(before, key));
      for (const m of problems(after, key)) if (!old.has(m)) msgs.push(m);
    }
    return msgs;
  };

  // Ereignisse
  const persistDraft = debounce(() => { if (!existing) saveDraft(read()); }, 300);
  const toNewSecurity = which => {
    const o = read();
    saveDraft({ ...o, secId: which === 'sec' ? '' : o.secId, targetSecId: which === 'target' ? '' : o.targetSecId });
    const ret = `#/buchung/${existing ? existing.id : 'neu'}?fromNew=1` + (which === 'target' ? '&target=1' : '');
    go('#/wertpapier/neu?ret=' + encodeURIComponent(ret));
  };
  f.sec.addEventListener('change', () => { if (f.sec.value === '__new') toNewSecurity('sec'); else { fillCurrency(true); layout(); } });
  f.target.addEventListener('change', () => { if (f.target.value === '__new') toNewSecurity('target'); });
  f.type.addEventListener('change', layout);
  f.venue.addEventListener('change', () => { layout(); if (f.venue.value === OTHER) f.venueOther.focus(); });
  f.currency.addEventListener('change', () => { updateFx(); calc(); });
  form.addEventListener('input', () => { calc(); persistDraft(); });
  form.addEventListener('change', persistDraft);
  readAsHints(form);
  fxBtn.addEventListener('click', async () => {
    const cur = normCur(f.currency.value).cur;
    fxBtn.disabled = true; fxBtn.textContent = 'Frage EZB ab …';
    try {
      const r = await fxOn(cur, f.date.value || today());
      if (r) { f.fx.value = numIn(r.r); toast(`EZB-Kurs vom ${fmtDate(r.d)}: ${fmtNum(r.r, 4, 4)}`); calc(); persistDraft(); }
      else toast('Kein EZB-Kurs gefunden');
    } catch (e) { toast('EZB nicht erreichbar: ' + e.message); }
    fxBtn.disabled = false; fxBtn.textContent = 'EZB-Kurs vom Tag einsetzen';
  });

  const saveBtn = h('button', { class: 'btn block', type: 'submit' }, 'Sichern');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = read();
    const e = validate(o);
    showErrors(e);
    if (e.length) return;
    if (!existing) o.seq = Date.now();
    const newTxs = [...state.txs.filter(t => t.id !== o.id), o];
    const warn = consequences(newTxs);
    if (warn.length && !await confirmSheet('Bitte prüfen', warn.join(' '), 'Trotzdem sichern')) return;
    saveBtn.disabled = true;
    await save('txs', o);
    if (!existing) clearDraft();
    await setMeta('set.lastDepot', o.depotId);
    toast('Buchung gesichert');
    goBack(p.plan ? '#/sparplaene' : fallback);
  });

  const top = [];
  if (offer) {
    const d = offer.data || {};
    const banner = h('div', { class: 'banner info' }, h('div', { class: 'main' },
      h('b', {}, 'Unvollständige Buchung'),
      `${TX_TYPES[d.type] || 'Buchung'}${d.secId ? ' · ' + secName(d.secId) : ''} vom ${fmtDate(String(offer.at).slice(0, 10))}, ${String(offer.at).slice(11, 16)} Uhr (UTC).`,
      h('div', { class: 'btns', style: 'margin-top:8px' },
        h('a', { class: 'btn small', href: '#/buchung/neu?entwurf=1' }, 'Fortsetzen'),
        h('button', { class: 'btn small sec', type: 'button', onclick: () => { clearDraft(); banner.remove(); } }, 'Verwerfen'))));
    top.push(banner);
  }
  form.append(fieldsBox, h('h2', {}, 'Zusammenfassung'), summary, saveBtn);
  if (existing) {
    form.append(h('button', { class: 'btn block danger mt', type: 'button', onclick: async () => {
      const warn = consequences(state.txs.filter(t => t.id !== existing.id));
      const text = 'Die Buchung wird endgültig entfernt.' + (warn.length ? ' Achtung: ' + warn.join(' ') : '');
      if (await confirmSheet('Buchung löschen?', text, warn.length ? 'Trotzdem löschen' : 'Löschen', true)) {
        await remove('txs', existing.id); toast('Buchung gelöscht'); goBack(fallback);
      }
    } }, 'Buchung löschen'));
  }
  view.replaceChildren(head(existing ? 'Buchung bearbeiten' : 'Neue Buchung', { back: fallback }), ...top, form);
  fillCurrency(false);
  layout();
}
