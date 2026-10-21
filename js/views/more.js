import { h, fmtEur, fmtNum, fmtDate, fmtShares, today, parseNum, numIn, uid, isinValid, isWkn, daysBetween } from '../util.js';
import { head, iconBtn, list, row, field, numInput, select, confirmSheet, toast, sheet } from '../ui.js';
import { state, save, remove, setMeta, deletePricesOf, clearAll } from '../db.js';
import { KINDS, duePlanDates } from '../calc.js';
import { model, params, sec, secName, depotName, kindName, go, goBack, rerender, VERSION } from '../ctx.js';
import { lookup, defaultNotation } from '../prices.js';
import { runPriceUpdate, exportBackup, importBackup, loadDemo, hardReload } from '../actions.js';

export function more(view) {
  const due = state.plans.reduce((s, p) => s + duePlanDates(p, state.txs, today()).length, 0);
  view.replaceChildren(
    head('Mehr'),
    list(
      row({ title: 'Depots', rightSub: String(state.depots.length), href: '#/depots' }),
      row({ title: 'Wertpapiere', rightSub: String(state.securities.length), href: '#/wertpapiere' }),
      row({ title: 'Sparpläne', rightSub: due ? `${due} offen` : String(state.plans.length), href: '#/sparplaene' })),
    list(
      row({ title: 'Kurse und Devisen', sub: state.meta.lastPriceUpdate ? `Zuletzt abgerufen ${fmtDate(state.meta.lastPriceUpdate.slice(0, 10))}` : 'Noch nie abgerufen', href: '#/kurse' }),
      row({ title: 'Sicherung', sub: state.meta.lastBackup ? `Letzte Sicherung ${fmtDate(state.meta.lastBackup.slice(0, 10))}` : 'Noch keine Sicherung', href: '#/sicherung' })),
    list(
      row({ title: 'So rechnet die App', href: '#/hilfe' }),
      row({ title: 'Kurs-Test', sub: 'Kursquellen vergleichen', href: 'kurs-test.html' }),
      row({ title: 'Neu laden', sub: 'Neueste Version holen', onclick: () => hardReload() })),
    h('p', { class: 'tiny muted center' }, `Finanzübersicht v${VERSION} · Daten nur auf diesem Gerät`));
}

// ---------- Depots ----------
export function depots(view) {
  view.replaceChildren(
    head('Depots', { back: '#/mehr', actions: [iconBtn('plus', 'Depot anlegen', null, '#/depot/neu')] }),
    state.depots.length ? list(...state.depots.map(d => row({ title: d.name, sub: d.bank || null, href: `#/depot/${d.id}` })))
      : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Noch kein Depot.', h('div', {}, h('a', { class: 'btn', href: '#/depot/neu' }, 'Depot anlegen')))));
}
export function depotForm(view, id) {
  const p = params();
  const d = id === 'neu' ? { id: uid(), name: '', bank: '', note: '' } : state.depots.find(x => x.id === id);
  if (!d) { view.replaceChildren(head('Nicht gefunden', { back: '#/depots' })); return; }
  const name = h('input', { value: d.name, placeholder: 'z. B. Comdirect Depot', autocapitalize: 'sentences' });
  const bank = h('input', { value: d.bank || '', placeholder: 'z. B. Comdirect' });
  const note = h('textarea', { rows: 2 }, d.note || '');
  const used = state.txs.some(t => t.depotId === d.id) || state.plans.some(x => x.depotId === d.id);
  const back = p.ret || '#/depots';
  const form = h('form', { class: 'form', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) { name.classList.add('invalid'); toast('Bitte einen Namen angeben.'); return; }
    await save('depots', { ...d, name: name.value.trim(), bank: bank.value.trim(), note: note.value.trim() });
    toast('Depot gesichert');
    if (p.erst) go('#/buchung/neu', { replace: true }); else goBack(back);
  } },
  h('div', { class: 'card' }, field('Name', name), field('Bank', bank), field('Notiz', note)),
  h('button', { class: 'btn block', type: 'submit' }, 'Sichern'),
  id !== 'neu' ? h('button', { class: 'btn block danger mt', type: 'button', disabled: used, onclick: async () => {
    if (await confirmSheet('Depot löschen?', 'Das Depot wird entfernt.', 'Löschen', true)) { await remove('depots', d.id); go('#/depots'); }
  } }, 'Depot löschen') : null,
  used ? h('p', { class: 'small muted center' }, 'Löschen ist nur ohne Buchungen und Sparpläne möglich.') : null);
  view.replaceChildren(head(id === 'neu' ? 'Neues Depot' : 'Depot bearbeiten', { back }), form);
  if (id === 'neu') setTimeout(() => name.focus(), 50);
}

// ---------- Wertpapiere ----------
export function securities(view) {
  const m = model();
  const t = today();
  const rows = state.securities.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(s => {
    const n = m.keys(k => k.endsWith('|' + s.id)).reduce((x, k) => x + m.sharesAt(k, t), 0);
    return row({ title: s.name, sub: [kindName(s.kind), s.isin].filter(Boolean).join(' · '), rightSub: n ? fmtShares(n) + ' Stk' : 'kein Bestand', href: `#/wp/${s.id}` });
  });
  view.replaceChildren(
    head('Wertpapiere', { back: '#/mehr', actions: [iconBtn('plus', 'Wertpapier anlegen', null, '#/wertpapier/neu')] }),
    rows.length ? list(...rows) : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Noch keine Wertpapiere. Sie werden meist direkt beim Erfassen einer Buchung angelegt.')));
}

export function securityForm(view, id) {
  const p = params();
  const isNew = id === 'neu';
  const s = isNew ? { id: uid(), name: '', isin: '', wkn: '', kind: 'etf', currency: 'EUR', histAdjusted: true, note: '' } : { ...sec(id) };
  if (!isNew && !s.id) { view.replaceChildren(head('Nicht gefunden', { back: '#/wertpapiere' })); return; }
  const back = p.ret || (isNew ? '#/wertpapiere' : `#/wp/${id}`);
  let found = s.ov ? { notations: s.ov.notations || [] } : null;

  const idIn = h('input', { value: s.isin || s.wkn || '', placeholder: 'ISIN oder WKN', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', maxlength: 12, style: 'text-transform:uppercase' });
  const findBtn = h('button', { class: 'btn small', type: 'button' }, 'Suchen');
  const findMsg = h('div', { class: 'hint' }, isNew ? 'Sucht bei onvista nach Name, Art und Börsenplätzen.' : '');
  const name = h('input', { value: s.name });
  const isin = h('input', { value: s.isin || '', autocapitalize: 'characters', maxlength: 12, style: 'text-transform:uppercase' });
  const wkn = h('input', { value: s.wkn || '', autocapitalize: 'characters', maxlength: 6, style: 'text-transform:uppercase' });
  const kind = select(Object.entries(KINDS), s.kind);
  const currency = h('input', { value: s.currency || 'EUR', maxlength: 3, autocapitalize: 'characters', style: 'text-transform:uppercase' });
  const notation = select([], null);
  const adjusted = h('input', { type: 'checkbox', checked: s.histAdjusted !== false });
  const note = h('textarea', { rows: 2 }, s.note || '');
  const notationBox = h('div');

  const fillNotations = (selectedId) => {
    const ns = (found && found.notations) || [];
    if (!ns.length) { notationBox.replaceChildren(h('p', { class: 'small muted' }, 'Ohne Börsenplatz gibt es keinen automatischen Kursabruf. Kurse lassen sich dann von Hand eintragen.')); return; }
    notation.replaceChildren(...ns.map(n => h('option', { value: n.id }, `${n.name}${n.currency ? ' · ' + n.currency : ''}`)));
    notation.value = String(selectedId != null ? selectedId : (defaultNotation(ns, kind.value) || ns[0]).id);
    notationBox.replaceChildren(field('Börsenplatz für die Bewertung', notation, 'Von diesem Börsenplatz kommen die Tagesschlusskurse. Am besten immer derselbe.'));
  };
  notation.addEventListener('change', () => {
    const n = ((found && found.notations) || []).find(x => String(x.id) === notation.value);
    if (n && n.currency) currency.value = n.currency;
  });
  fillNotations(s.ov ? s.ov.notation : null);

  findBtn.addEventListener('click', async () => {
    const q = idIn.value.trim().toUpperCase();
    if (!(isinValid(q) || isWkn(q))) { findMsg.textContent = 'Bitte eine gültige ISIN (12 Zeichen) oder WKN (6 Zeichen) eingeben.'; findMsg.className = 'err'; return; }
    findBtn.disabled = true; findMsg.className = 'hint'; findMsg.replaceChildren(h('span', { class: 'spin' }), ' Suche …');
    try {
      const r = await lookup(q);
      found = r;
      name.value = r.name; isin.value = r.isin; wkn.value = r.wkn || ''; kind.value = r.kind;
      fillNotations(null);
      const n = r.notations.find(x => String(x.id) === notation.value);
      if (n && n.currency) currency.value = n.currency;
      findMsg.textContent = `Gefunden: ${r.name} · ${r.notations.length} Börsenplätze`;
    } catch (e) {
      findMsg.className = 'err';
      findMsg.textContent = `Nicht gefunden (${e.message}). Du kannst die Angaben auch von Hand eintragen.`;
    }
    findBtn.disabled = false;
  });

  const form = h('form', { class: 'form', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const o = { ...s, name: name.value.trim(), isin: isin.value.trim().toUpperCase(), wkn: wkn.value.trim().toUpperCase(), kind: kind.value,
      currency: currency.value.trim() || 'EUR', histAdjusted: adjusted.checked, note: note.value.trim() };
    if (/^GB[XP]$/i.test(o.currency)) o.currency = o.currency.toUpperCase() === 'GBX' ? 'GBX' : 'GBp';
    else o.currency = o.currency.toUpperCase();
    const errs = [];
    if (!o.name) errs.push('Name');
    if (o.isin && !isinValid(o.isin)) errs.push('ISIN ungültig');
    if (o.isin && state.securities.some(x => x.id !== o.id && x.isin === o.isin)) errs.push('Diese ISIN gibt es schon');
    if (!/^[A-Z]{3}$|^GBp$/.test(o.currency)) errs.push('Währung (3 Buchstaben)');
    if (errs.length) { toast('Bitte prüfen: ' + errs.join(', ')); return; }
    const ns = (found && found.notations) || [];
    const n = ns.find(x => String(x.id) === notation.value);
    const oldNotation = s.ov && s.ov.notation;
    if (n) o.ov = { type: (found.ov || s.ov || {}).type, uid: (found.ov || s.ov || {}).uid, notation: n.id, venue: n.name, notations: ns };
    if (!isNew && oldNotation != null && n && String(oldNotation) !== String(n.id) && (state.prices.get(o.id) || []).some(x => !x.manual)) {
      if (!await confirmSheet('Börsenplatz wechseln?', 'Die bisher abgerufenen Kurse stammen vom alten Börsenplatz und werden gelöscht. Danach „Kurse aktualisieren“.', 'Wechseln')) return;
      await deletePricesOf(o.id);
    }
    await save('securities', o);
    toast('Wertpapier gesichert');
    if (p.ret) go(p.ret + (p.ret.includes('?') ? '&' : '?') + 'newId=' + o.id, { replace: true });
    else if (isNew) go(`#/wp/${o.id}`, { replace: true });
    else goBack(back);
  } },
  isNew ? h('div', { class: 'card' }, field('ISIN oder WKN', h('div', { style: 'display:flex;gap:8px;align-items:center' }, idIn, findBtn), null), findMsg) : null,
  h('h2', {}, 'Angaben'),
  h('div', { class: 'card' },
    field('Name', name),
    h('div', { class: 'grid2' }, field('ISIN', isin), field('WKN', wkn)),
    h('div', { class: 'grid2' }, field('Art', kind), field('Kurswährung', currency, 'z. B. EUR, USD, GBp')),
    notationBox,
    h('label', { class: 'check' }, adjusted, h('span', {}, 'Abgerufene Kurshistorie ist splitbereinigt')),
    h('div', { class: 'hint' }, 'Üblich bei onvista. Dann rechnet die App Kurse vor einem Split auf die damalige Stückzahl zurück.'),
    field('Notiz', note)),
  h('button', { class: 'btn block', type: 'submit' }, 'Sichern'),
  !isNew ? h('button', { class: 'btn block danger mt', type: 'button', onclick: async () => {
    if (state.txs.some(t => t.secId === s.id || t.targetSecId === s.id) || state.plans.some(x => x.secId === s.id)) { toast('Wertpapier hat noch Buchungen oder Sparpläne.'); return; }
    if (await confirmSheet('Wertpapier löschen?', 'Das Wertpapier und seine gespeicherten Kurse werden entfernt.', 'Löschen', true)) {
      await deletePricesOf(s.id); await remove('securities', s.id); go('#/wertpapiere');
    }
  } }, 'Wertpapier löschen') : null);
  view.replaceChildren(head(isNew ? 'Neues Wertpapier' : 'Wertpapier bearbeiten', { back }), form);
  if (isNew) setTimeout(() => idIn.focus(), 50);
}

// ---------- Sparpläne ----------
const EVERY = [[1, 'monatlich'], [2, 'alle 2 Monate'], [3, 'vierteljährlich'], [6, 'halbjährlich'], [12, 'jährlich']];
export function plans(view) {
  const t = today();
  const out = [head('Sparpläne', { back: '#/mehr', actions: [iconBtn('plus', 'Sparplan anlegen', null, '#/sparplan/neu')] })];
  const due = [];
  for (const p of state.plans) for (const d of duePlanDates(p, state.txs, t)) due.push({ p, d });
  due.sort((a, b) => a.d < b.d ? -1 : 1);
  if (due.length) {
    out.push(h('h2', {}, 'Offene Ausführungen'), h('p', { class: 'small muted', style: 'margin:0 4px 8px' }, 'Antippen und Kurs, Stückzahl und Gebühren aus der Abrechnung eintragen.'));
    out.push(list(...due.slice(0, 60).map(({ p, d }) => h('div', { class: 'row', style: 'flex-wrap:wrap' },
      h('a', { class: 'main', href: `#/buchung/neu?typ=buy&plan=${p.id}&datum=${d}`, style: 'color:inherit;min-width:100%' },
        h('div', { class: 'title' }, secName(p.secId)), h('div', { class: 'sub' }, `${fmtDate(d, true)} · ${fmtEur(p.amount)} · ${depotName(p.depotId)}`)),
      h('div', { class: 'rowbtns' },
        h('a', { class: 'btn small', href: `#/buchung/neu?typ=buy&plan=${p.id}&datum=${d}` }, 'Erfassen'),
        h('button', { class: 'btn small text', type: 'button', onclick: async () => {
          if (!await confirmSheet('Ausführung überspringen?', `Die Ausführung vom ${fmtDate(d)} wird als „entfallen“ markiert und nicht mehr angezeigt.`, 'Überspringen')) return;
          await save('plans', { ...p, skipped: [...(p.skipped || []), d] }); toast('Ausführung übersprungen'); rerender();
        } }, 'Entfällt'))))));
    if (due.length > 60) out.push(h('p', { class: 'small muted center' }, `… und ${due.length - 60} weitere`));
  }
  out.push(h('h2', {}, 'Vorlagen'));
  out.push(state.plans.length ? list(...state.plans.map(p => row({
    title: secName(p.secId), sub: `${fmtEur(p.amount)} ${(EVERY.find(e => e[0] === p.every) || [0, ''])[1]} · ${depotName(p.depotId)}`,
    badge: p.active ? null : h('span', { class: 'badge' }, 'pausiert'), href: `#/sparplan/${p.id}`,
  }))) : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Noch kein Sparplan. Eine Vorlage erinnert an fällige Ausführungen; jede Ausführung wird einzeln mit den Werten der Abrechnung erfasst.')));
  view.replaceChildren(...out);
}
export function planForm(view, id) {
  const isNew = id === 'neu';
  const p = isNew ? { id: uid(), secId: '', depotId: state.depots[0] ? state.depots[0].id : '', amount: null, every: 1, start: today(), end: '', active: true, skipped: [] } : state.plans.find(x => x.id === id);
  if (!p) { view.replaceChildren(head('Nicht gefunden', { back: '#/sparplaene' })); return; }
  if (!state.securities.length || !state.depots.length) {
    view.replaceChildren(head('Neuer Sparplan', { back: '#/sparplaene' }), h('div', { class: 'card' }, h('p', {}, 'Lege zuerst ein Depot und das Wertpapier an – am einfachsten mit der ersten Buchung.'), h('a', { class: 'btn block', href: '#/buchung/neu' }, 'Buchung erfassen')));
    return;
  }
  const secSel = select([['', 'Bitte wählen …'], ...state.securities.map(s => [s.id, s.name])], p.secId);
  const depSel = select(state.depots.map(d => [d.id, d.name]), p.depotId);
  const amount = numInput({ value: numIn(p.amount), placeholder: 'z. B. 150' });
  const every = select(EVERY.map(([v, l]) => [String(v), l]), String(p.every));
  const start = h('input', { type: 'date', value: p.start });
  const end = h('input', { type: 'date', value: p.end || '' });
  const active = h('input', { type: 'checkbox', checked: p.active });
  const form = h('form', { class: 'form', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const o = { ...p, secId: secSel.value, depotId: depSel.value, amount: parseNum(amount.value), every: +every.value, start: start.value, end: end.value || '', active: active.checked };
    if (!o.secId || !(o.amount > 0) || !o.start) { toast('Bitte Wertpapier, Betrag und ersten Termin angeben.'); return; }
    await save('plans', o); toast('Sparplan gesichert'); goBack('#/sparplaene');
  } },
  h('div', { class: 'card' },
    field('Wertpapier', secSel), field('Depot', depSel),
    h('div', { class: 'grid2' }, field('Sparrate (€)', amount), field('Rhythmus', every)),
    h('div', { class: 'grid2' }, field('Erste Ausführung', start, 'legt auch den Tag im Monat fest'), field('Ende (optional)', end)),
    h('label', { class: 'check' }, active, h('span', {}, 'Aktiv'))),
  h('button', { class: 'btn block', type: 'submit' }, 'Sichern'),
  !isNew ? h('button', { class: 'btn block danger mt', type: 'button', onclick: async () => {
    if (await confirmSheet('Sparplan löschen?', 'Erfasste Ausführungen bleiben als Buchungen erhalten.', 'Löschen', true)) { await remove('plans', p.id); go('#/sparplaene'); }
  } }, 'Sparplan löschen') : null);
  view.replaceChildren(head(isNew ? 'Neuer Sparplan' : 'Sparplan bearbeiten', { back: '#/sparplaene' }), form);
}

// ---------- Kurse ----------
export function pricesView(view) {
  const m = model();
  const out = [head('Kurse und Devisen', { back: '#/mehr' })];
  const last = state.meta.lastPriceUpdate;
  out.push(h('div', { class: 'card' },
    h('p', { class: 'small muted', style: 'margin-top:0' }, 'Tagesschlusskurse kommen von onvista (je Wertpapier vom gewählten Börsenplatz), Devisenkurse von der Europäischen Zentralbank. Alles wird lokal gespeichert; abgerufen wird nur, was fehlt.'),
    h('p', { class: 'small' }, last ? `Zuletzt abgerufen: ${fmtDate(last.slice(0, 10))}, ${last.slice(11, 16)} Uhr (UTC)` : 'Noch nie abgerufen.'),
    h('button', { class: 'btn block', type: 'button', onclick: () => runPriceUpdate() }, 'Kurse aktualisieren')));
  const errs = state.meta.lastPriceErrors || [];
  if (errs.length) out.push(h('div', { class: 'banner bad' }, h('div', { class: 'main' }, h('b', {}, 'Beim letzten Abruf'), errs.join(' · '))));
  out.push(h('h2', {}, 'Wertpapiere'));
  out.push(state.securities.length ? list(...state.securities.map(s => {
    const arr = state.prices.get(s.id) || [];
    const lastP = arr[arr.length - 1];
    const warn = m.priceJumps(s.id).length;
    return row({
      title: s.name, sub: `${arr.length} Kurse` + (arr.length ? ` · ${fmtDate(arr[0].d)} – ${fmtDate(lastP.d)}` : '') + (s.ov && s.ov.venue ? ` · ${s.ov.venue}` : ' · kein Börsenplatz'),
      badge: warn ? h('span', { class: 'badge warn' }, `${warn} Hinweis${warn > 1 ? 'e' : ''}`) : null,
      right: lastP ? `${fmtNum(lastP.c, 2, 4)}` : '–', rightSub: s.kind === 'bond' ? '%' : s.currency, href: `#/wp/${s.id}`,
    });
  })) : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Noch keine Wertpapiere.')));
  if (state.fx.size) {
    out.push(h('h2', {}, 'Devisen (EZB)'), list(...[...state.fx].map(([cur, arr]) => {
      const l = arr[arr.length - 1];
      return row({ title: `1 EUR = ${fmtNum(l.r, 4, 4)} ${cur}`, sub: `${arr.length} Kurse · ${fmtDate(arr[0].d)} – ${fmtDate(l.d)}` });
    })));
  }
  view.replaceChildren(...out);
}

// ---------- Sicherung ----------
const ago = n => n <= 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} Tagen`;
export function backup(view) {
  const lastB = state.meta.lastBackup;
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await importBackup(file);
  } });
  const days = select([['3', 'alle 3 Tage'], ['7', 'jede Woche'], ['14', 'alle 2 Wochen'], ['30', 'jeden Monat']], String(state.meta['set.backupDays'] || 7),
    { onchange: async e => { await setMeta('set.backupDays', +e.target.value); toast('Gesichert'); } });
  view.replaceChildren(
    head('Sicherung', { back: '#/mehr' }),
    h('div', { class: 'card' },
      h('p', { style: 'margin-top:0' }, lastB ? `Letzte Sicherung: ${fmtDate(lastB.slice(0, 10))} (${ago(daysBetween(lastB.slice(0, 10), today()))})` : 'Noch keine Sicherung erstellt.'),
      h('p', { class: 'small muted' }, (state.meta.changes || 0) ? `${state.meta.changes} Änderungen seit der letzten Sicherung.` : 'Keine Änderungen seit der letzten Sicherung.'),
      h('p', { class: 'small muted' }, 'Die Sicherung ist eine Datei mit allen Depots, Buchungen und Kursen. Am iPhone über „In Dateien sichern“ z. B. in iCloud Drive ablegen.'),
      h('button', { class: 'btn block', type: 'button', onclick: () => exportBackup() }, 'Sicherung erstellen'),
      h('button', { class: 'btn block sec mt', type: 'button', onclick: () => fileIn.click() }, 'Sicherung einlesen'), fileIn),
    h('h2', {}, 'Erinnerung'),
    h('div', { class: 'card' }, field('An Sicherung erinnern', days, 'Erinnert auf der Übersicht, wenn es seitdem Änderungen gab.'),
      h('p', { class: 'small muted' }, state.meta._persisted ? 'Safari wurde gebeten, die Daten dauerhaft zu behalten.' : 'Safari hat dauerhaftes Speichern nicht bestätigt – regelmäßige Sicherungen sind deshalb besonders wichtig.')),
    h('h2', {}, 'Daten'),
    h('div', { class: 'card' },
      h('button', { class: 'btn block sec', type: 'button', onclick: () => loadDemo() }, 'Beispieldaten laden'),
      h('p', { class: 'small muted' }, 'Ersetzt alle Daten durch ein erfundenes Beispiel zum Ausprobieren.'),
      h('button', { class: 'btn block danger', type: 'button', onclick: async () => {
        if (!await confirmSheet('Alle Daten löschen?', 'Depots, Wertpapiere, Buchungen, Sparpläne und Kurse werden auf diesem Gerät gelöscht. Das lässt sich nur mit einer Sicherung rückgängig machen.', 'Alles löschen', true)) return;
        await clearAll(); toast('Alle Daten gelöscht'); go('#/');
      } }, 'Alle Daten löschen')));
}

// ---------- Erklärung ----------
export function help(view) {
  const P = (t, ...x) => h('p', {}, h('b', {}, t + ' '), ...x);
  view.replaceChildren(head('So rechnet die App', { back: '#/mehr' }), h('div', { class: 'card small' },
    P('Bewertung:', 'Jede Position wird mit dem Tagesschlusskurs ihres Börsenplatzes bewertet. Fehlt an einem Tag ein Kurs (Wochenende, Feiertag), gilt der letzte davor. Fremdwährungen werden mit dem EZB-Referenzkurs des Tages umgerechnet, Anleihen mit Kurs in % vom Nennwert.'),
    P('Zu- und Abflüsse:', 'Gerechnet wird aus Sicht des Depots ohne Verrechnungskonto: Ein Kauf ist eine Einzahlung (inkl. Gebühren und Stückzinsen), ein Verkauf und jede Dividende oder Zinszahlung eine Auszahlung. Ein- und Auslieferungen zählen mit dem Marktwert des Tages.'),
    P('Zeitgewichtete Rendite:', 'Der Zeitraum wird an jedem Tag mit Zu- oder Abfluss geteilt; die Teilrenditen werden verkettet. So zählt nur die Entwicklung der Anlagen. Ab einem Jahr zusätzlich als Wert pro Jahr (p. a.).'),
    P('Interner Zinsfuß:', 'Der Zinssatz pro Jahr, bei dem Anfangswert, alle Zu- und Abflüsse (tagesgenau) und Endwert aufgehen. Ein Kauf am 12. Januar zählt damit anders als einer am 30. November.'),
    P('Vor und nach Steuern:', 'Nach Steuern mindern alle ausgewiesenen Steuern (Kapitalertragsteuer, Soli, Kirchensteuer, Quellensteuer, Vorabpauschale) die Rückflüsse; Erstattungen erhöhen sie. Steuern auf noch nicht verkaufte Gewinne werden nicht vorweggenommen.'),
    P('Kapitalmaßnahmen:', 'Ein Split ändert die Stückzahl; ist die abgerufene Kurshistorie splitbereinigt, rechnet die App ältere Kurse zurück. Umtausch und Abspaltung übertragen den Marktwert vom alten auf das neue Wertpapier – die Gesamtrendite bleibt davon unberührt.'),
    P('Einstand:', 'Nach Durchschnittskosten inklusive Kaufgebühren. Daraus ergeben sich offener und realisierter Kursgewinn.'),
    P('Prüfhinweise:', 'Kurssprünge über 20 % von Tag zu Tag und Abrechnungskurse, die mehr als 3 % vom Schlusskurs abweichen, werden beim Wertpapier gemeldet.')));
}
