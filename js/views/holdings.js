import { h, fmtEur, fmtPct, fmtShares, fmtDate, fmtNum, today, addDays, parseNum, numIn } from '../util.js';
import { head, iconBtn, list, row, chips, seg, kpi, money, pct, signCls, sheet, field, numInput, confirmSheet, toast } from '../ui.js';
import { lineChart } from '../chart.js';
import { state, putPrices, deletePrice } from '../db.js';
import { TX_TYPES, txTotal, normCur } from '../calc.js';
import { model, params, setting, sec, depotName, kindName, periodRange, go, rerender } from '../ctx.js';

export function holdings(view) {
  const t = today();
  const m = model();
  const mode = setting('taxMode', 'pre');
  const p = params();
  const depotId = p.depot && state.depots.some(d => d.id === p.depot) ? p.depot : 'all';
  const filter = depotId === 'all' ? () => true : k => k.startsWith(depotId + '|');
  const pos = m.positions(t, filter, mode);
  const total = pos.reduce((s, x) => s + x.value, 0);
  const cost = pos.reduce((s, x) => s + x.cost, 0);

  const out = [head('Bestand', { actions: [iconBtn('plus', 'Buchung erfassen', null, '#/buchung/neu' + (depotId !== 'all' ? '?depot=' + depotId : ''))] })];
  if (state.depots.length > 1) {
    out.push(chips([['all', 'Alle Depots'], ...state.depots.map(d => [d.id, d.name])], depotId,
      v => go('#/bestand' + (v === 'all' ? '' : '?depot=' + v))));
  }
  out.push(h('div', { class: 'kpis' },
    kpi('Wert', fmtEur(total)),
    kpi('Kursgewinn offen', money(total - cost, true), cost > 0 ? fmtPct((total - cost) / cost) + ' auf den Einstand' : null)));

  if (!pos.length) {
    out.push(h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Noch keine Positionen.',
      h('div', {}, h('a', { class: 'btn', href: '#/buchung/neu' }, 'Buchung erfassen')))));
  } else {
    out.push(h('h2', {}, `${pos.length} Positionen`), list(...pos.map(x => {
      const s = sec(x.secId) || {};
      const stale = !x.price || x.price.stale;
      return row({
        title: s.name || '?',
        badge: stale ? h('span', { class: 'badge warn' }, 'Kurs alt') : null,
        sub: `${fmtShares(x.shares)} ${s.kind === 'bond' ? 'nominal' : 'Stk'}` + (depotId === 'all' && state.depots.length > 1 ? ' · ' + depotName(x.depotId) : ''),
        right: fmtEur(x.value), rightSub: x.unrealPct != null ? pct(x.unrealPct) : null,
        href: `#/wp/${x.secId}`,
      });
    })));
  }

  // Abgeschlossene Positionen
  const closed = m.keys(filter).filter(k => !m.sharesAt(k, t) && m.txs.some(tx => tx.depotId + '|' + tx.secId === k));
  if (closed.length) {
    out.push(h('h2', {}, 'Nicht mehr im Bestand'), list(...closed.map(k => {
      const [d, sId] = k.split('|');
      const cb = m.costBasis(k, t, mode);
      return row({ title: (sec(sId) || {}).name || '?', sub: depotName(d), right: money(cb.realized + cb.income, true), rightSub: 'Gewinn inkl. Erträge', href: `#/wp/${sId}` });
    })));
  }
  view.replaceChildren(...out);
}

// ---------- Wertpapier im Detail ----------
export function securityDetail(view, id) {
  const s = sec(id);
  if (!s) { view.replaceChildren(head('Nicht gefunden', { back: '#/bestand' })); return; }
  const t = today();
  const m = model();
  const mode = setting('taxMode', 'pre');
  const filter = k => k.endsWith('|' + id);
  const keys = m.keys(filter);
  let shares = 0, value = 0, cost = 0, realized = 0, income = 0;
  for (const k of keys) {
    const n = m.sharesAt(k, t);
    shares += n; value += m.valueKey(k, t);
    const cb = m.costBasis(k, t, mode);
    cost += cb.cost; realized += cb.realized; income += cb.income;
  }
  const pr = m.priceAt(id, t);
  const out = [head(s.name, { back: '#/bestand', actions: [iconBtn('edit', 'Wertpapier bearbeiten', null, `#/wertpapier/${id}`)] })];
  out.push(h('p', { class: 'small muted', style: 'margin:-6px 2px 12px' },
    [kindName(s.kind), s.isin, s.wkn ? 'WKN ' + s.wkn : null, s.ov && s.ov.venue ? s.ov.venue : null, s.currency].filter(Boolean).join(' · ')));

  // Kurs
  const priceNote = !pr ? 'kein Kurs' : `${fmtDate(pr.d)} · ${pr.src === 'manuell' ? 'von Hand' : pr.src === 'buchung' ? 'aus Buchung' : (s.ov && s.ov.venue) || 'Kurs'}`;
  out.push(h('div', { class: 'kpis' },
    kpi('Wert', fmtEur(value), `${fmtShares(shares)} ${s.kind === 'bond' ? 'nominal' : 'Stück'}`),
    kpi('Kurs', pr ? `${fmtNum(pr.p, 2, 4)} ${s.kind === 'bond' ? '%' : pr.cur}` : '–', priceNote, pr && pr.stale ? 'warn-text' : ''),
    kpi('Kursgewinn offen', money(value - cost, true), cost > 0 ? fmtPct((value - cost) / cost) : null),
    kpi('Realisiert + Erträge', money(realized + income, true), `davon Erträge ${fmtEur(income)}`)));

  // Rendite
  const perfBox = h('div');
  const drawPerf = key => {
    const { a, b } = periodRange(key);
    const r = m.perf(filter, a, b, mode);
    const pa = r.days >= 365;
    perfBox.replaceChildren(
      seg([['ytd', 'Lfd. J.'], ['1y', '1 J'], ['3y', '3 J'], ['all', 'Max']], key, drawPerf),
      r.twr == null ? h('p', { class: 'small muted' }, 'In diesem Zeitraum kein Bestand.') :
        h('div', { class: 'kpis k3 flat' },
          kpi('Zeitgewichtet', fmtPct(pa ? r.twrPa : r.twr), pa ? 'p. a.' : 'seit ' + fmtDate(r.a), signCls(r.twr)),
          kpi('Zinsfuß', fmtPct(pa ? r.irr : r.irrPeriod), pa ? 'p. a.' : 'im Zeitraum', signCls(r.irr)),
          kpi('Gewinn', money(r.gain, true), mode === 'post' ? 'nach Steuern' : 'vor Steuern')),
      h('a', { class: 'small', href: '#/auswertung', onclick: () => { try { const st = JSON.parse(localStorage.getItem('ana.state') || '{}'); localStorage.setItem('ana.state', JSON.stringify({ ...st, scope: 'sec', sec: id })); } catch { /* egal */ } } }, 'Weitere Zeiträume in der Auswertung ›'));
  };
  drawPerf('all');
  out.push(h('h2', {}, 'Rendite'), h('div', { class: 'card' }, perfBox));

  // Kursverlauf
  const arr = state.prices.get(id) || [];
  if (arr.length > 1) {
    const from = addDays(t, -365);
    const pts = arr.filter(p => p.d >= from);
    const use = pts.length > 1 ? pts : arr;
    const step = Math.max(1, Math.floor(use.length / 150));
    const sample = use.filter((_, i) => i % step === 0 || i === use.length - 1);
    out.push(h('h2', {}, 'Kursverlauf'), h('div', { class: 'card' },
      lineChart(sample.map(p => p.d), [{ label: `Schlusskurs (${s.currency || ''})`, values: sample.map(p => p.c), color: 'var(--chart-1)' }],
        { fmtY: v => fmtNum(v, 0, 2), fmtTip: v => fmtNum(v, 2, 4), area: false })));
  }

  // Auffälligkeiten
  const jumps = m.priceJumps(id);
  const devs = m.txPriceDeviations(id);
  if (jumps.length || devs.length) {
    out.push(h('h2', {}, 'Prüfhinweise'), h('div', { class: 'card small' },
      jumps.map(j => h('p', {}, h('span', { class: 'badge warn' }, 'Kurssprung'), ` ${fmtPct(j.change)} von ${fmtDate(j.from.d)} (${fmtNum(j.from.c)}) auf ${fmtDate(j.to.d)} (${fmtNum(j.to.c)}). Split oder Datenfehler? Ggf. Kurs von Hand korrigieren.`)),
      devs.map(d => h('p', {}, h('span', { class: 'badge warn' }, 'Abweichung'), ` ${TX_TYPES[d.tx.type]} am ${fmtDate(d.tx.date)}: Abrechnungskurs ${fmtNum(d.tx.price)} weicht ${fmtPct(d.dev)} vom Schlusskurs ${fmtNum(d.close)} ab.`))));
  }

  // Buchungen
  const txs = m.txs.filter(x => x.secId === id || x.targetSecId === id).reverse();
  out.push(h('h2', {}, 'Buchungen'), txs.length ? list(...txs.map(x => txRow(x, true))) : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Keine Buchungen.')));
  out.push(h('a', { class: 'btn block sec', href: `#/buchung/neu?wp=${id}` }, 'Buchung hinzufügen'));

  // Kurse von Hand
  const manual = arr.filter(p => p.manual).slice(-20).reverse();
  out.push(h('h2', {}, 'Kurse von Hand'),
    h('div', { class: 'list' },
      manual.length ? manual.map(p => row({ title: `${fmtNum(p.c, 2, 4)} ${s.currency}`, sub: fmtDate(p.d, true), badge: h('span', { class: 'badge warn' }, 'von Hand'), onclick: () => manualPrice(s, p) }))
        : h('div', { class: 'empty small' }, 'Von Hand gesetzte Kurse haben Vorrang vor abgerufenen Kursen.')),
    h('button', { class: 'btn block sec', type: 'button', onclick: () => manualPrice(s) }, 'Kurs von Hand eintragen'));
  view.replaceChildren(...out);
}

export function txRow(x, inSecurity) {
  const s = sec(x.secId) || {};
  const total = txTotal(x, s);
  const sign = ['buy', 'tax'].includes(x.type) ? -1 : 1;
  let sub = TX_TYPES[x.type];
  if (['buy', 'sell', 'in', 'out'].includes(x.type)) sub += ` · ${fmtShares(x.shares)} à ${fmtNum(x.price, 2, 4)} ${s.kind === 'bond' ? '%' : x.currency || s.currency || ''}`;
  if (x.type === 'split') sub += ` · 1 : ${fmtNum(x.ratio, 0, 6)}`;
  if (['exchange', 'spinoff'].includes(x.type)) sub += ` → ${(sec(x.targetSecId) || {}).name || '?'}`;
  if (inSecurity && x.targetSecId === s.id) sub = TX_TYPES[x.type] + ` ← ${s.name || '?'}`;
  return row({
    title: inSecurity ? sub : s.name || '?', sub: inSecurity ? fmtDate(x.date, true) + (x.note ? ' · ' + x.note : '') : `${fmtDate(x.date)} · ${sub}`,
    right: total != null ? money(sign * total, true) : null,
    rightSub: state.depots.length > 1 ? depotName(x.depotId) : null,
    href: `#/buchung/${x.id}`,
  });
}

async function manualPrice(s, existing) {
  const d = h('input', { type: 'date', value: existing ? existing.d : today(), max: today() });
  const c = numInput({ value: existing ? numIn(existing.c) : '', placeholder: '0,00' });
  const res = await sheet(close => [
    h('h3', {}, existing ? 'Kurs von Hand ändern' : 'Kurs von Hand eintragen'),
    h('p', {}, `Schlusskurs in ${s.kind === 'bond' ? '% vom Nennwert' : s.currency}. Er ersetzt einen abgerufenen Kurs vom selben Tag und wird als „von Hand“ markiert.`),
    field('Datum', d), field('Kurs', c),
    h('button', { class: 'btn', type: 'button', onclick: () => close('save') }, 'Sichern'),
    existing ? h('button', { class: 'btn danger', type: 'button', onclick: () => close('delete') }, 'Löschen') : null,
    h('button', { class: 'btn sec', type: 'button', onclick: () => close(null) }, 'Abbrechen'),
  ]);
  if (res === 'delete') { await deletePrice(s.id, existing.d); toast('Kurs gelöscht'); rerender(); return; }
  if (res !== 'save') return;
  const v = parseNum(c.value);
  if (!d.value || !(v > 0)) { toast('Bitte Datum und einen gültigen Kurs angeben.'); return; }
  if (existing && existing.d !== d.value) await deletePrice(s.id, existing.d);
  await putPrices(s.id, [{ d: d.value, c: v, manual: true, src: 'manuell', at: new Date().toISOString() }]);
  toast('Kurs gesichert');
  rerender();
}
