import { h, fmtEur, fmtNum, fmtDate, fmtShares, today, parseNum, numIn, uid } from '../util.js';
import { head, iconBtn, list, chips, field, numInput, select, confirmSheet, toast } from '../ui.js';
import { state, save, remove, setMeta } from '../db.js';
import { TX_TYPES, grossEur, taxSum, txTotal, normCur } from '../calc.js';
import { model, params, sec, go } from '../ctx.js';
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
const DRAFT_KEY = 'tx.draft';

export function txForm(view, id) {
  const p = params();
  const existing = id !== 'neu' ? state.txs.find(t => t.id === id) : null;
  if (id !== 'neu' && !existing) { view.replaceChildren(head('Nicht gefunden', { back: '#/buchungen' })); return; }
  if (!state.depots.length) {
    view.replaceChildren(head('Neue Buchung', { back: '#/buchungen' }),
      h('div', { class: 'card' }, h('p', {}, 'Lege zuerst ein Depot an.'), h('a', { class: 'btn block', href: '#/depot/neu?ret=' + encodeURIComponent('#/buchung/neu') }, 'Depot anlegen')));
    return;
  }
  // Entwurf nach „Neues Wertpapier anlegen“ wiederherstellen
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch { /* egal */ }
  if (draft && !p.fromNew) draft = null;
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* egal */ }

  const tx = existing ? { ...existing, ...(draft || {}) } : {
    id: uid(), type: p.typ || 'buy', date: p.datum || today(), depotId: p.depot || (state.depots.length === 1 ? state.depots[0].id : (state.meta['set.lastDepot'] || state.depots[0].id)),
    secId: p.wp || '', fx: 1, ...(p.plan ? { planId: p.plan, planDate: p.datum, note: 'Sparplan' } : {}),
    ...(draft || {}),
  };
  if (p.fromNew && p.newId) { if (p.target) tx.targetSecId = p.newId; else tx.secId = p.newId; }
  if (!existing && p.plan) {
    const plan = state.plans.find(x => x.id === p.plan);
    if (plan) { tx.secId = plan.secId; tx.depotId = plan.depotId; tx.planAmount = plan.amount; }
  }
  const back = p.ret || (existing ? `#/wp/${existing.secId}` : (p.wp ? `#/wp/${p.wp}` : '#/buchungen'));

  const form = h('form', { class: 'form', novalidate: true, autocomplete: 'off' });
  const errors = h('div');
  const summary = h('div', { class: 'card' });

  // Felder
  const f = {
    type: select(Object.entries(TX_TYPES), tx.type),
    depot: select(state.depots.map(d => [d.id, d.name]), tx.depotId),
    sec: select([['', 'Bitte wählen …'], ...state.securities.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(s => [s.id, s.name]), ['__new', '＋ Neues Wertpapier anlegen …']], tx.secId),
    date: h('input', { type: 'date', value: tx.date, max: today() }),
    shares: numInput({ value: numIn(tx.shares) }),
    price: numInput({ value: numIn(tx.price) }),
    currency: select([], null),
    fx: numInput({ value: tx.fx && tx.fx !== 1 ? numIn(tx.fx) : '' }),
    amount: numInput({ value: numIn(tx.amount) }),
    fees: numInput({ value: numIn(tx.fees), placeholder: '0,00' }),
    accrued: numInput({ value: numIn(tx.accrued), placeholder: '0,00' }),
    kest: numInput({ value: numIn(tx.kest), placeholder: '0,00' }),
    soli: numInput({ value: numIn(tx.soli), placeholder: '0,00' }),
    kist: numInput({ value: numIn(tx.kist), placeholder: '0,00' }),
    qst: numInput({ value: numIn(tx.qst), placeholder: '0,00' }),
    ratio: numInput({ value: numIn(tx.ratio) }),
    target: select([['', 'Bitte wählen …'], ...state.securities.map(s => [s.id, s.name]), ['__new', '＋ Neues Wertpapier anlegen …']], tx.targetSecId || ''),
    venue: h('input', { value: tx.venue || '', list: 'venue-list', autocorrect: 'off', placeholder: 'z. B. Xetra' }),
    note: h('textarea', { rows: 2 }, tx.note || ''),
  };
  const fxBtn = h('button', { type: 'button', class: 'btn small sec', style: 'margin-top:6px' }, 'EZB-Kurs vom Tag einsetzen');
  const fxHint = h('div', { class: 'hint' }, 'Fremdwährung je 1 € laut Abrechnung, z. B. 1,0850.');

  const S = () => sec(f.sec.value) || null;
  const type = () => f.type.value;
  const isBond = () => (S() || {}).kind === 'bond';

  const fieldsBox = h('div');
  const section = (title, ...kids) => [h('h2', {}, title), h('div', { class: 'card' }, kids)];

  const fillCurrency = () => {
    const s = S();
    const cur = (s && s.currency) || 'EUR';
    const opts = [...new Set([cur, normCur(cur).cur, 'EUR'])];
    const keep = f.currency.value || tx.currency || cur;
    f.currency.replaceChildren(...opts.map(c => h('option', { value: c }, c === 'GBp' || c === 'GBX' ? `${c} (Pence)` : c)));
    f.currency.value = opts.includes(keep) ? keep : cur;
  };

  const layout = () => {
    const t = type();
    const s = S();
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
          field(unit, f.shares, isBond() ? 'z. B. 10.000' : 'auch Bruchstücke'),
          field(isBond() ? 'Kurs in %' : (t === 'in' ? 'Einstandskurs' : 'Kurs'), f.price, t === 'in' ? 'für den Einstand' : null)),
        field('Währung des Kurses', f.currency),
        fxWrap(),
        ['buy', 'sell'].includes(t) ? field('Börsenplatz', f.venue) : null));
      if (['buy', 'sell'].includes(t)) {
        parts.push(...section('Kosten' + (t === 'sell' ? ' und Steuern' : ''),
          h('div', { class: 'grid2' }, field('Gebühren (€)', f.fees), isBond() ? field('Stückzinsen (€)', f.accrued) : h('span')),
          t === 'sell' ? taxFields(false) : null));
      }
    }
    if (['div', 'interest'].includes(t)) {
      parts.push(...section('Betrag',
        h('div', { class: 'grid2' }, field('Brutto', f.amount, 'vor allen Steuern'), field('Währung', f.currency)),
        fxWrap(),
        field('Gebühren (€)', f.fees)));
      parts.push(...section('Steuern (€)', taxFields(true)));
    }
    if (t === 'tax') {
      parts.push(h('p', { class: 'small muted', style: 'margin:12px 4px 0' }, 'Für Steuern ohne Kauf oder Verkauf, z. B. die Vorabpauschale. Eine Erstattung mit Minus eintragen.'));
      parts.push(...section('Steuern (€)', taxFields(false)));
    }
    if (t === 'split') {
      parts.push(...section('Verhältnis', field('Neue Stücke je bisheriges Stück', f.ratio, 'Split 1:4 → 4 · Zusammenlegung 10:1 → 0,1')));
    }
    if (['exchange', 'spinoff'].includes(t)) {
      parts.push(...section(t === 'exchange' ? 'Umtausch' : 'Abspaltung',
        field(t === 'exchange' ? 'Neues Wertpapier' : 'Abgespaltenes Wertpapier', f.target),
        field('Neue Stücke je bisheriges Stück', f.ratio, t === 'exchange' ? 'Die bisherigen Stücke werden vollständig ausgebucht.' : 'Die bisherigen Stücke bleiben im Bestand.'),
        t === 'spinoff' ? field('Kurs der neuen Aktie (optional)', f.price, 'Nur nötig, falls noch kein Kurs abrufbar ist.') : null));
    }
    parts.push(...section('Notiz', f.note));
    fieldsBox.replaceChildren(...parts);
    fillCurrency();
    updateFx();
    calc();
  };
  const fxBox = h('div');
  const fxWrap = () => fxBox;
  const updateFx = () => {
    const show = f.currency.value && normCur(f.currency.value).cur !== 'EUR';
    fxBox.replaceChildren(...(show ? [field(`Devisenkurs (${normCur(f.currency.value).cur} je 1 €)`, f.fx), fxHint, fxBtn] : []));
  };
  const taxFields = withQst => h('div', {},
    h('div', { class: 'grid2' }, field('Kapitalertragsteuer', f.kest), field('Solidaritätszuschlag', f.soli)),
    h('div', { class: 'grid2' }, field('Kirchensteuer', f.kist), withQst ? field('Quellensteuer', f.qst) : h('span')));

  const read = () => {
    const n = el => parseNum(el.value);
    const t = type();
    const o = { ...tx, type: t, depotId: f.depot.value, secId: f.sec.value, date: f.date.value, note: f.note.value.trim() };
    for (const k of ['shares', 'price', 'amount', 'fees', 'accrued', 'kest', 'soli', 'kist', 'qst', 'ratio']) o[k] = n(f[k]);
    o.currency = f.currency.value || undefined;
    o.fx = o.currency && normCur(o.currency).cur !== 'EUR' ? n(f.fx) : 1;
    o.venue = f.venue.value.trim();
    o.targetSecId = ['exchange', 'spinoff'].includes(t) ? f.target.value : undefined;
    // Felder, die für die Art nicht gelten, entfernen
    const keep = {
      buy: ['shares', 'price', 'fees', 'accrued', 'kest', 'soli', 'kist'], sell: ['shares', 'price', 'fees', 'accrued', 'kest', 'soli', 'kist'],
      in: ['shares', 'price'], out: ['shares', 'price'], div: ['amount', 'fees', 'kest', 'soli', 'kist', 'qst'], interest: ['amount', 'fees', 'kest', 'soli', 'kist', 'qst'],
      tax: ['kest', 'soli', 'kist'], split: ['ratio'], exchange: ['ratio'], spinoff: ['ratio', 'price'],
    }[t];
    for (const k of ['shares', 'price', 'amount', 'fees', 'accrued', 'kest', 'soli', 'kist', 'qst', 'ratio']) {
      if (!keep.includes(k) || o[k] == null) delete o[k];   // NaN bleibt für die Prüfung stehen
    }
    if (!['buy', 'sell'].includes(t)) delete o.venue;
    if (['split', 'tax', 'exchange'].includes(t)) { delete o.currency; o.fx = 1; }
    delete o.planAmount;
    return o;
  };

  const validate = o => {
    const e = [];
    const num = (k, label, cond = v => v > 0) => { if (o[k] == null || Number.isNaN(o[k]) || !cond(o[k])) e.push(label); };
    if (!o.secId || o.secId === '__new') e.push('Wertpapier wählen');
    if (!o.date) e.push('Datum angeben');
    if (o.date > today()) e.push('Datum liegt in der Zukunft');
    if (['buy', 'sell', 'in', 'out'].includes(o.type)) { num('shares', 'Stückzahl'); if (o.type !== 'in' && o.type !== 'out') num('price', 'Kurs'); }
    if (['div', 'interest'].includes(o.type)) num('amount', 'Bruttobetrag');
    if (['split', 'exchange', 'spinoff'].includes(o.type)) num('ratio', 'Verhältnis');
    if (['exchange', 'spinoff'].includes(o.type) && (!o.targetSecId || o.targetSecId === '__new' || o.targetSecId === o.secId)) e.push('Neues Wertpapier wählen');
    if (o.currency && normCur(o.currency).cur !== 'EUR' && ['buy', 'sell', 'div', 'interest'].includes(o.type)) num('fx', 'Devisenkurs');
    for (const k of ['fees', 'accrued', 'kest', 'soli', 'kist', 'qst']) if (Number.isNaN(o[k])) e.push('Ungültige Zahl bei ' + k);
    if (['sell', 'out'].includes(o.type) && o.shares > 0) {
      const m = model();
      let have = m.sharesAt(o.depotId + '|' + o.secId, o.date);
      if (existing && existing.depotId === o.depotId && existing.secId === o.secId && existing.date <= o.date && ['sell', 'out'].includes(existing.type)) have += existing.shares;
      if (o.shares > have + 1e-9) e.push(`Im Depot liegen am ${fmtDate(o.date)} nur ${fmtShares(have)} Stück`);
    }
    return e;
  };

  const calc = () => {
    const o = read();
    const s = S();
    const rows = [];
    const r = (label, v, cls) => rows.push(h('div', { class: 'sum ' + (cls || '') }, h('span', {}, label), h('span', {}, v)));
    if (['buy', 'sell', 'div', 'interest'].includes(o.type) && s) {
      const g = grossEur(o, s);
      r(['div', 'interest'].includes(o.type) ? 'Brutto' : 'Kurswert', fmtEur(g));
      if (o.accrued) r('Stückzinsen', fmtEur(o.accrued));
      if (o.fees) r('Gebühren', (o.type === 'buy' ? '+ ' : '− ') + fmtEur(o.fees));
      const tax = taxSum(o);
      if (tax) r('Steuern', (o.type === 'buy' ? '+ ' : '− ') + fmtEur(tax));
      const total = txTotal(o, s);
      r(o.type === 'buy' ? 'Belastung' : 'Gutschrift', fmtEur(total), 'total');
      if (tx.planAmount && o.type === 'buy') r('Sparrate laut Plan', fmtEur(tx.planAmount));
    } else if (o.type === 'tax') {
      r(taxSum(o) < 0 ? 'Erstattung' : 'Belastung', fmtEur(Math.abs(taxSum(o))), 'total');
    } else if (o.type === 'split' && o.ratio > 0 && s) {
      const have = model().sharesAt(o.depotId + '|' + o.secId, o.date);
      r('Bestand danach', `${fmtShares(have * o.ratio)} statt ${fmtShares(have)}`, 'total');
    }
    summary.replaceChildren(...(rows.length ? rows : [h('div', { class: 'small muted' }, 'Die Zusammenfassung erscheint nach der Eingabe.')]));
    summary.hidden = false;
  };

  // Ereignisse
  const toNewSecurity = which => {
    const o = read();
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...o, secId: which === 'sec' ? '' : o.secId, targetSecId: which === 'target' ? '' : o.targetSecId })); } catch { /* egal */ }
    const ret = `#/buchung/${existing ? existing.id : 'neu'}?fromNew=1` + (which === 'target' ? '&target=1' : '');
    go('#/wertpapier/neu?ret=' + encodeURIComponent(ret));
  };
  f.sec.addEventListener('change', () => { if (f.sec.value === '__new') toNewSecurity('sec'); else { f.currency.value = ''; layout(); } });
  f.target.addEventListener('change', () => { if (f.target.value === '__new') toNewSecurity('target'); });
  f.type.addEventListener('change', layout);
  f.currency.addEventListener('change', () => { updateFx(); calc(); });
  form.addEventListener('input', calc);
  fxBtn.addEventListener('click', async () => {
    const cur = normCur(f.currency.value).cur;
    fxBtn.disabled = true; fxBtn.textContent = 'Frage EZB ab …';
    try {
      const r = await fxOn(cur, f.date.value || today());
      if (r) { f.fx.value = numIn(r.r); toast(`EZB-Kurs vom ${fmtDate(r.d)}: ${fmtNum(r.r, 4, 4)}`); calc(); }
      else toast('Kein EZB-Kurs gefunden');
    } catch (e) { toast('EZB nicht erreichbar: ' + e.message); }
    fxBtn.disabled = false; fxBtn.textContent = 'EZB-Kurs vom Tag einsetzen';
  });
  const saveBtn = h('button', { class: 'btn block', type: 'submit' }, 'Sichern');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = read();
    const e = validate(o);
    if (e.length) {
      errors.replaceChildren(h('div', { class: 'banner bad' }, h('div', { class: 'main' }, h('b', {}, 'Bitte prüfen'), e.join(' · '))));
      errors.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!existing) o.seq = Date.now();
    saveBtn.disabled = true;
    await save('txs', o);
    await setMeta('set.lastDepot', o.depotId);
    toast('Buchung gesichert');
    go(p.ret || (p.plan ? '#/sparplaene' : `#/wp/${o.secId}`));
  });

  form.append(fieldsBox, h('h2', {}, 'Zusammenfassung'), summary, errors, saveBtn);
  if (existing) {
    form.append(h('button', { class: 'btn block danger mt', type: 'button', onclick: async () => {
      if (await confirmSheet('Buchung löschen?', 'Die Buchung wird endgültig entfernt.', 'Löschen', true)) {
        await remove('txs', existing.id); toast('Buchung gelöscht'); go(back);
      }
    } }, 'Buchung löschen'));
  }
  form.append(h('datalist', { id: 'venue-list' }, ['Xetra', 'Tradegate', 'gettex', 'Frankfurt', 'Stuttgart', 'München', 'Quotrix', 'LS Exchange', 'Fondsgesellschaft', 'NYSE', 'Nasdaq', 'außerbörslich'].map(v => h('option', { value: v }))));
  view.replaceChildren(head(existing ? 'Buchung bearbeiten' : 'Neue Buchung', { back }), form);
  layout();
}
