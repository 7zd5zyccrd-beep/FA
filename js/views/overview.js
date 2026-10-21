import { h, fmtEur, fmtPct, fmtDate, addDays, today, daysBetween } from '../util.js';
import { head, iconBtn, kpi, money, seg, list, row, signCls } from '../ui.js';
import { lineChart, allocation } from '../chart.js';
import { state } from '../db.js';
import { duePlanDates } from '../calc.js';
import { model, setting, depotName, kindName, sec, periodRange, backupDue, rerender } from '../ctx.js';
import { runPriceUpdate, loadDemo } from '../actions.js';

const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };

export function overview(view) {
  const t = today();
  const m = model();
  const mode = setting('taxMode', 'pre');
  const out = [head('Übersicht', { actions: [iconBtn('refresh', 'Kurse aktualisieren', () => runPriceUpdate())] })];

  if (!state.txs.length) {
    view.replaceChildren(h('div', { class: 'card welcome' },
      h('img', { src: 'icons/icon-192.png', alt: '' }),
      h('h1', {}, 'Willkommen'),
      h('p', {}, 'Deine Depots und Wertpapiere mit tagesgenauer Rendite. Die Daten bleiben nur auf diesem Gerät.'),
      h('a', { class: 'btn', href: state.depots.length ? '#/buchung/neu' : '#/depot/neu?erst=1' }, state.depots.length ? 'Erste Buchung erfassen' : 'Depot anlegen'),
      h('div', { class: 'links' },
        h('button', { class: 'btn small text', type: 'button', onclick: () => loadDemo() }, 'Beispieldaten ansehen'),
        h('a', { class: 'btn small text', href: '#/sicherung' }, 'Sicherung einlesen'))));
    return;
  }

  out.push(...banners(m, t));

  // Gesamtwert und Tagesveränderung
  const pos = m.positions(t, () => true, mode);
  const total = pos.reduce((s, p) => s + p.value, 0);
  const stored = pos.filter(p => p.price && p.price.src !== 'buchung');
  const lastPriceDate = stored.reduce((d, p) => p.price.d > d ? p.price.d : d, '');
  // Tagesveränderung nur, wenn beide Kurse gespeichert und aktuell sind
  let day = null;
  if (lastPriceDate && daysBetween(lastPriceDate, t) <= 4 && stored.length === pos.length) {
    const prevOk = pos.every(p => { const pr = m.priceAt(p.secId, addDays(lastPriceDate, -1)); return pr && pr.src !== 'buchung' && daysBetween(pr.d, lastPriceDate) <= 5; });
    if (prevOk) day = m.perf(() => true, lastPriceDate, lastPriceDate, mode);
  }
  const dayPct = day && day.startValue > 0 ? day.gain / day.startValue : null;
  out.push(h('div', { class: 'card hero' },
    h('div', { class: 'label' }, 'Gesamtwert'),
    h('div', { class: 'big' }, fmtEur(total)),
    day && day.startValue > 0 ? h('div', { class: 'delta ' + signCls(day.gain) }, `${day.gain > 0 ? '+' : ''}${fmtEur(day.gain)} (${fmtPct(dayPct)}) zum Vortag`) : null,
    h('div', { class: 'tiny muted', style: 'margin-top:4px' }, lastPriceDate ? `Kursstand ${fmtDate(lastPriceDate, true)}` : 'Noch keine abgerufenen Kurse', state.meta.lastPriceUpdate ? ` · abgerufen ${fmtDate(state.meta.lastPriceUpdate.slice(0, 10))}` : '')));

  // Kennzahlen
  const all = m.perf(() => true, m.firstDate(), t, mode);
  const ytd = periodRange('ytd');
  const y = m.perf(() => true, ytd.a, ytd.b, mode);
  const pa = all.days >= 365;
  const longTwr = pa ? all.twrPa : all.twr;
  const irrShown = pa ? all.irr : all.irrPeriod;
  out.push(h('div', { class: 'kpis k4' },
    kpi('Gewinn seit Beginn', money(all.gain, true), mode === 'post' ? 'nach Steuern' : 'vor Steuern'),
    kpi('Rendite lfd. Jahr', fmtPct(y.twr), y.twr != null ? `zeitgewichtet${y.a > ytd.a ? ', seit ' + fmtDate(y.a) : ''}` : 'kein Bestand', signCls(y.twr)),
    kpi('Rendite seit Beginn', fmtPct(longTwr), pa ? 'zeitgewichtet, p. a.' : `zeitgewichtet, seit ${fmtDate(all.a)}`, signCls(longTwr)),
    kpi('Interner Zinsfuß', fmtPct(irrShown), pa ? 'seit Beginn, p. a.' : `seit ${fmtDate(all.a)}`, signCls(irrShown))));

  // Verlauf
  const chartKey = lsGet('ov.chart', 'all');
  const chartBox = h('div');
  const drawChart = key => {
    lsSet('ov.chart', key);
    const { a, b } = periodRange(key);
    const ser = m.series(() => true, a, b, mode);
    chartBox.replaceChildren(
      seg([['1y', '1 J'], ['3y', '3 J'], ['5y', '5 J'], ['all', 'Max']], key, drawChart),
      lineChart(ser.map(p => p.d), [
        { label: 'Depotwert', values: ser.map(p => p.v), color: 'var(--chart-1)' },
        { label: 'Eingesetztes Kapital', values: ser.map(p => p.invested), color: 'var(--chart-2)', dash: '4 3' },
      ], { fmtY: v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' T€' : v.toLocaleString('de-DE') + ' €', fmtTip: fmtEur }));
  };
  drawChart(chartKey);
  out.push(h('h2', {}, 'Verlauf'), h('div', { class: 'card' }, chartBox));

  // Depots
  const byDepot = new Map();
  for (const p of pos) byDepot.set(p.depotId, (byDepot.get(p.depotId) || 0) + p.value);
  if (state.depots.length) {
    out.push(h('h2', {}, 'Depots'), list(...state.depots.map(d => row({
      title: d.name, sub: d.bank || null, right: fmtEur(byDepot.get(d.id) || 0),
      rightSub: total > 0 ? fmtPct((byDepot.get(d.id) || 0) / total, false) : null, href: `#/bestand?depot=${d.id}`,
    }))));
  }

  // Aufteilung
  if (pos.length > 1) {
    const byKind = new Map(), byCur = new Map();
    for (const p of pos) {
      const s = sec(p.secId) || {};
      byKind.set(kindName(s.kind), (byKind.get(kindName(s.kind)) || 0) + p.value);
      const c = (s.currency || 'EUR').replace(/^GB[Xp]$/, 'GBP');
      byCur.set(c, (byCur.get(c) || 0) + p.value);
    }
    const allocBox = h('div');
    const drawAlloc = k => {
      lsSet('ov.alloc', k);
      const src = k === 'cur' ? byCur : byKind;
      allocBox.replaceChildren(seg([['kind', 'Nach Art'], ['cur', 'Nach Währung']], k, drawAlloc),
        allocation([...src].map(([label, value]) => ({ label, value })), fmtEur));
    };
    drawAlloc(lsGet('ov.alloc', 'kind'));
    out.push(h('h2', {}, 'Aufteilung'), h('div', { class: 'card' }, allocBox));
  }
  view.replaceChildren(...out);
}

function banners(m, t) {
  const res = [];
  if (state.meta.demo) {
    res.push(h('div', { class: 'banner info' }, h('div', { class: 'main' },
      h('b', {}, 'Beispieldaten'), 'Alle Werte und Kurse sind erfunden. Vor der eigenen Nutzung unter Mehr → Sicherung „Alle Daten löschen“.')));
  }
  if (backupDue()) {
    const last = state.meta.lastBackup;
    res.push(h('div', { class: 'banner' }, h('div', { class: 'main' },
      h('b', {}, 'Sicherung empfohlen'),
      last ? `Letzte Sicherung am ${fmtDate(last.slice(0, 10))}. Seitdem gab es Änderungen.` : 'Es gibt noch keine Sicherung. Safari kann Daten selten genutzter Seiten löschen.',
      h('div', {}, h('a', { class: 'btn small', href: '#/sicherung' }, 'Jetzt sichern')))));
  }
  let due = 0;
  for (const p of state.plans) due += duePlanDates(p, state.txs, t).length;
  if (due) {
    res.push(h('a', { class: 'banner info', href: '#/sparplaene', style: 'color:inherit' }, h('div', { class: 'main' },
      h('b', {}, due === 1 ? '1 Sparplan-Ausführung offen' : `${due} Sparplan-Ausführungen offen`), 'Antippen, um sie mit den Werten aus der Abrechnung zu erfassen.')));
  }
  const pos = m.positions(t);
  const stale = pos.filter(p => !p.price || p.price.stale || p.price.src === 'buchung').length;
  if (stale && !state.meta.demo) {
    res.push(h('div', { class: 'banner' }, h('div', { class: 'main' },
      h('b', {}, stale === 1 ? '1 Wertpapier ohne aktuellen Kurs' : `${stale} Wertpapiere ohne aktuellen Kurs`),
      'Bewertet wird dann mit dem letzten bekannten Kurs.',
      h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: () => runPriceUpdate() }, 'Kurse aktualisieren')))));
  }
  return res;
}
