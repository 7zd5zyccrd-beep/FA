import { h, fmtEur, fmtPct, fmtDate, today } from '../util.js';
import { head, seg, chips, kpi, money, pct, signCls, field, select } from '../ui.js';
import { lineChart, yearBars } from '../chart.js';
import { state, setMeta } from '../db.js';
import { model, setting, secName, depotName, periodRange, PERIODS, rerender } from '../ctx.js';

const KEY = 'ana.state';
function load() {
  try { return { scope: 'all', depot: '', sec: '', period: 'ytd', from: '', to: '', chart: 'value', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { scope: 'all', depot: '', sec: '', period: 'ytd', from: '', to: '', chart: 'value' }; }
}
function store(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* egal */ } }

export function analysis(view) {
  const st = load();
  const m = model();
  const mode = setting('taxMode', 'pre');
  const set = patch => { Object.assign(st, patch); store(st); rerender(); };
  const out = [head('Auswertung')];

  if (!state.txs.length) {
    view.replaceChildren(...out, h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Sobald Buchungen erfasst sind, erscheint hier die Rendite.')));
    return;
  }

  // Umfang
  const heldSecs = [...new Set(m.txs.flatMap(t => [t.secId, t.targetSecId]).filter(Boolean))]
    .map(id => [id, secName(id)]).sort((a, b) => a[1].localeCompare(b[1], 'de'));
  if (st.scope === 'depot' && !state.depots.some(d => d.id === st.depot)) st.depot = state.depots[0] ? state.depots[0].id : '';
  if (st.scope === 'sec' && !heldSecs.some(([id]) => id === st.sec)) st.sec = heldSecs[0] ? heldSecs[0][0] : '';
  const scopeBox = h('div', { class: 'card' },
    seg([['all', 'Gesamt'], ['depot', 'Depot'], ['sec', 'Wertpapier']], st.scope, v => set({ scope: v })),
    st.scope === 'depot' ? field('Depot', select(state.depots.map(d => [d.id, d.name]), st.depot, { onchange: e => set({ depot: e.target.value }) })) : null,
    st.scope === 'sec' ? field('Wertpapier', select(heldSecs, st.sec, { onchange: e => set({ sec: e.target.value }) })) : null,
    h('div', { style: 'margin-top:12px' }, seg([['pre', 'Vor Steuern'], ['post', 'Nach Steuern']], mode, async v => { await setMeta('set.taxMode', v); rerender(); })));
  out.push(scopeBox);

  const filter = st.scope === 'depot' ? k => k.startsWith(st.depot + '|')
    : st.scope === 'sec' ? k => k.endsWith('|' + st.sec) : () => true;

  // Zeitraum
  out.push(h('h2', {}, 'Zeitraum'), chips(PERIODS, st.period, v => set({ period: v })));
  const { a, b } = periodRange(st.period, st.from, st.to);
  if (st.period === 'custom') {
    const from = h('input', { type: 'date', value: a, max: today(), onchange: e => set({ from: e.target.value }) });
    const to = h('input', { type: 'date', value: b, max: today(), onchange: e => set({ to: e.target.value }) });
    out.push(h('div', { class: 'card' }, h('div', { class: 'grid2' }, field('Von', from), field('Bis', to))));
  }

  const r = m.perf(filter, a, b, mode);
  out.push(h('p', { class: 'small muted', style: 'margin:0 4px 10px' }, `${fmtDate(a)} – ${fmtDate(b)} · ${r.days} Tage · ${mode === 'post' ? 'nach' : 'vor'} Steuern`));
  if (r.twr == null) {
    out.push(h('div', { class: 'list' }, h('div', { class: 'empty' }, 'In diesem Zeitraum gab es keinen Bestand.')));
    view.replaceChildren(...out);
    return;
  }
  out.push(h('div', { class: 'kpis' },
    kpi('Zeitgewichtete Rendite', fmtPct(r.twr), r.twrPa != null ? `${fmtPct(r.twrPa)} p. a.` : 'im Zeitraum', signCls(r.twr)),
    kpi('Interner Zinsfuß', r.irr != null ? fmtPct(r.irr) + ' p. a.' : '–', r.irrPeriod != null ? `${fmtPct(r.irrPeriod)} im Zeitraum` : null, signCls(r.irr)),
    kpi('Gewinn', money(r.gain, true), 'Kurse, Erträge, Kosten'),
    kpi('Wert am Ende', fmtEur(r.endValue), fmtDate(b))));
  if (r.missing.length) {
    out.push(h('div', { class: 'banner' }, h('div', { class: 'main' }, h('b', {}, 'Kurse fehlen'),
      `Für ${r.missing.map(secName).join(', ')} fehlt an einzelnen Tagen ein Kurs. Die Werte sind dort zu niedrig.`)));
  }
  out.push(h('div', { class: 'card' },
    sum('Wert am Anfang', fmtEur(r.startValue)),
    sum('+ Einzahlungen (Käufe, Einlieferungen)', fmtEur(r.inflow)),
    sum('− Auszahlungen (Verkäufe, Erträge)', fmtEur(r.outflow)),
    sum('Wert am Ende', fmtEur(r.endValue)),
    sum('Gewinn', money(r.gain, true), 'total')));
  out.push(h('details', { class: 'more card small' },
    h('summary', {}, 'Was bedeuten die beiden Renditen?'),
    h('p', {}, h('b', {}, 'Zeitgewichtet: '), 'Wie gut sich die Anlagen selbst entwickelt haben – unabhängig davon, wann und wie viel du eingezahlt hast. Vergleichbar mit Fonds- und Indexrenditen.'),
    h('p', {}, h('b', {}, 'Interner Zinsfuß: '), 'Deine persönliche Verzinsung pro Jahr. Er berücksichtigt Zeitpunkt und Höhe jeder Ein- und Auszahlung: Ein Kauf kurz vor einem Anstieg zählt stärker als einer danach.'),
    h('p', {}, h('b', {}, 'Nach Steuern: '), 'Zieht die in den Abrechnungen ausgewiesenen Steuern ab (inkl. Vorabpauschale). Steuern auf noch nicht verkaufte Gewinne sind nicht berücksichtigt.')));

  // Verlauf
  const ser = m.series(filter, a, b, mode);
  const chartView = st.chart || 'value';
  out.push(h('h2', {}, 'Verlauf'), h('div', { class: 'card' },
    seg([['value', 'Wert'], ['twr', 'Rendite']], chartView, v => set({ chart: v })),
    h('div', { style: 'margin-top:12px' }, chartView === 'twr'
      ? lineChart(ser.map(p => p.d), [{ label: 'Zeitgewichtete Rendite', values: ser.map(p => p.idx - 1), color: 'var(--chart-1)' }],
        { fmtY: v => fmtPct(v, false).replace(',00', ''), fmtTip: v => fmtPct(v) })
      : lineChart(ser.map(p => p.d), [
        { label: 'Wert', values: ser.map(p => p.v), color: 'var(--chart-1)' },
        { label: 'Eingesetztes Kapital', values: ser.map(p => p.invested), color: 'var(--chart-2)', dash: '4 3' },
      ], { fmtY: v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' T€' : v.toLocaleString('de-DE') + ' €', fmtTip: fmtEur }))));

  // Jahresvergleich
  const years = m.yearly(filter, mode, today()).filter(y => y.twr != null);
  if (years.length) {
    out.push(h('h2', {}, 'Jahresvergleich'), h('div', { class: 'card' },
      yearBars(years.map(y => ({ label: String(y.year), value: y.twr }))),
      h('div', { class: 'scroll-x mt' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Jahr'), h('th', {}, 'Zeitgew.'), h('th', {}, 'Zinsfuß'), h('th', {}, 'Gewinn'))),
        h('tbody', {}, years.slice().reverse().map(y => h('tr', {},
          h('td', {}, y.year + (y.b < `${y.year}-12-31` ? ' *' : '')),
          h('td', { class: signCls(y.twr) }, fmtPct(y.twr)),
          h('td', { class: signCls(y.irr) }, fmtPct(y.irr)),
          h('td', { class: signCls(y.gain) }, fmtEur(y.gain))))))),
      years.some(y => y.b < `${y.year}-12-31` || y.a > `${y.year}-01-01`) ? h('p', { class: 'tiny muted' }, '* angefangenes Jahr. Zinsfuß jeweils p. a.') : h('p', { class: 'tiny muted' }, 'Zinsfuß jeweils p. a.')));
  }

  // Einzelne Positionen im Zeitraum
  if (st.scope !== 'sec') {
    const secIds = [...new Set(m.keys(filter).map(k => k.split('|')[1]))];
    const rows = secIds.map(id => ({ id, r: m.perf(k => filter(k) && k.endsWith('|' + id), a, b, mode) }))
      .filter(x => x.r.twr != null).sort((x, y) => y.r.gain - x.r.gain);
    if (rows.length > 1) {
      out.push(h('h2', {}, 'Nach Wertpapier'), h('div', { class: 'card' }, h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Wertpapier'), h('th', {}, 'Zeitgew.'), h('th', {}, 'Gewinn'))),
        h('tbody', {}, rows.map(x => h('tr', { onclick: () => set({ scope: 'sec', sec: x.id }), style: 'cursor:pointer' },
          h('td', { style: 'max-width:170px;overflow:hidden;text-overflow:ellipsis' }, secName(x.id)),
          h('td', { class: signCls(x.r.twr) }, fmtPct(x.r.twr)),
          h('td', { class: signCls(x.r.gain) }, fmtEur(x.r.gain)))))))),
        h('p', { class: 'tiny muted', style: 'margin:0 4px' }, 'Zeile antippen, um das Wertpapier einzeln auszuwerten.'));
    }
  }
  view.replaceChildren(...out);
}

function sum(label, val, cls) {
  return h('div', { class: 'sum ' + (cls || '') }, h('span', {}, label), h('span', {}, val));
}
