// Erfundene Beispieldaten zum Ausprobieren (keine echten Wertpapiere, keine echten Kurse)
import { addDays, addMonths, isWeekend, lastIndexLE } from './util.js';
import { SCHEMA } from './db.js';

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
function series(rand, from, to, start, drift, vol, events = []) {
  const out = [];
  let p = start;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    const z = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    p *= Math.exp((drift - vol * vol / 2) / 252 + vol * z / Math.sqrt(252));
    for (const e of events) if (e.d === d) p *= e.f;
    out.push({ d, c: Math.round(p * 100) / 100 });
  }
  return out;
}
const at = (arr, d) => { const i = lastIndexLE(arr, d); return arr[Math.max(0, i)]; };
const r2 = n => Math.round(n * 100) / 100;

export function buildDemo(until) {
  const rand = rng(20210104);
  const from = '2021-01-04';
  const S = {
    etf: { id: 'demo-etf', name: 'Welt-Aktien ETF (Beispiel)', kind: 'etf', currency: 'EUR', histAdjusted: true },
    tech: { id: 'demo-tech', name: 'US-Technik Inc. (Beispiel)', kind: 'stock', currency: 'USD', histAdjusted: false },
    fund: { id: 'demo-fund', name: 'Rentenmischfonds (Beispiel)', kind: 'fund', currency: 'EUR', histAdjusted: true },
    bond: { id: 'demo-bond', name: 'Bundesanleihe 2032 (Beispiel)', kind: 'bond', currency: 'EUR', histAdjusted: true },
    ins: { id: 'demo-ins', name: 'Versicherung AG (Beispiel)', kind: 'stock', currency: 'EUR', histAdjusted: true },
  };
  for (const s of Object.values(S)) Object.assign(s, { isin: '', wkn: '', note: 'Erfundenes Beispiel' });
  const P = {
    etf: series(rand, from, until, 64, 0.09, 0.15),
    tech: series(rand, from, until, 128, 0.16, 0.28, [{ d: '2022-08-29', f: 0.25 }]),
    fund: series(rand, from, until, 52, 0.03, 0.05),
    bond: series(rand, from, until, 101, -0.002, 0.03),
    ins: series(rand, from, until, 182, 0.09, 0.18),
  };
  const usd = series(rand, from, until, 1.21, -0.01, 0.07).map(p => ({ d: p.d, r: Math.round(p.c * 10000) / 10000 }));
  const fxAt = d => at(usd, d).r;
  const depots = [
    { id: 'demo-d1', name: 'Hauptdepot (Beispiel)', bank: 'Direktbank', note: '' },
    { id: 'demo-d2', name: 'Zweitdepot (Beispiel)', bank: 'Hausbank', note: '' },
  ];
  const txs = [];
  let seq = 1;
  const add = o => txs.push({ id: 'demo-t' + seq, seq: seq++, fx: 1, ...o });
  const tax = g => { const kest = r2(g * 0.25); return { kest, soli: r2(kest * 0.055) }; };

  // Welt-Aktien ETF: Einmalkauf und Sparplan
  add({ type: 'buy', date: '2021-01-12', depotId: 'demo-d1', secId: S.etf.id, shares: 50, price: at(P.etf, '2021-01-12').c, fees: 4.9, venue: 'Xetra' });
  const plan = { id: 'demo-plan', secId: S.etf.id, depotId: 'demo-d1', amount: 150, every: 1, start: '2021-02-01', end: '', active: true, skipped: [] };
  const lastPlanned = addMonths(until.slice(0, 8) + '01', -1, 1);
  for (let k = 0; ; k++) {
    const d = addMonths(plan.start, k, 1);
    if (d > lastPlanned) break;
    const exec = isWeekend(d) ? addDays(d, new Date(d + 'T12:00:00Z').getUTCDay() === 6 ? 2 : 1) : d;
    const price = at(P.etf, exec).c;
    add({ type: 'buy', date: d, depotId: 'demo-d1', secId: S.etf.id, shares: Math.round((150 - 1.5) / price * 10000) / 10000, price, fees: 1.5, planId: plan.id, planDate: d, note: 'Sparplan' });
  }
  // US-Technik: Kauf, Split 1:4, Teilverkauf, Quartalsdividenden
  add({ type: 'buy', date: '2021-03-15', depotId: 'demo-d1', secId: S.tech.id, shares: 20, price: at(P.tech, '2021-03-15').c, currency: 'USD', fx: fxAt('2021-03-15'), fees: 9.9, venue: 'Nasdaq' });
  add({ type: 'split', date: '2022-08-29', depotId: 'demo-d1', secId: S.tech.id, ratio: 4 });
  for (let y = 2021; y <= +until.slice(0, 4); y++) for (const m of ['02', '05', '08', '11']) {
    const d = `${y}-${m}-15`;
    if (d < '2021-04-01' || d > until) continue;
    const n = d < '2022-08-29' ? 20 : (d < '2024-06-10' ? 80 : 50);
    const gross = r2(n * (d < '2022-08-29' ? 0.88 : 0.22));
    const fx = fxAt(d);
    const qst = r2(gross * 0.15 / fx);
    add({ type: 'div', date: d, depotId: 'demo-d1', secId: S.tech.id, amount: gross, currency: 'USD', fx, qst, ...tax(gross / fx * 0.10) });
  }
  if (until >= '2024-06-10') {
    const price = at(P.tech, '2024-06-10').c, fx = fxAt('2024-06-10');
    add({ type: 'sell', date: '2024-06-10', depotId: 'demo-d1', secId: S.tech.id, shares: 30, price, currency: 'USD', fx, fees: 9.9, venue: 'Nasdaq', ...tax(30 * (price - 128 / 4) / fx) });
  }
  // Rentenmischfonds mit Vorabpauschale
  add({ type: 'buy', date: '2021-06-01', depotId: 'demo-d2', secId: S.fund.id, shares: 200, price: at(P.fund, '2021-06-01').c, fees: 0, venue: 'Fondsgesellschaft' });
  for (let y = 2023; y <= +until.slice(0, 4); y++) add({ type: 'tax', date: `${y}-01-02`, depotId: 'demo-d2', secId: S.fund.id, kest: 6.4, soli: 0.35, note: 'Vorabpauschale' });
  // Anleihe mit Stückzinsen und jährlichem Kupon
  add({ type: 'buy', date: '2022-03-10', depotId: 'demo-d2', secId: S.bond.id, shares: 10000, price: at(P.bond, '2022-03-10').c, accrued: 85.07, fees: 12.5, venue: 'Frankfurt' });
  for (let y = 2022; y <= +until.slice(0, 4); y++) {
    const d = `${y}-08-15`;
    if (d <= until) add({ type: 'interest', date: d, depotId: 'demo-d2', secId: S.bond.id, amount: 150, ...tax(150) });
  }
  // Versicherung AG: zwei Käufe, jährliche Dividende
  add({ type: 'buy', date: '2021-09-20', depotId: 'demo-d1', secId: S.ins.id, shares: 15, price: at(P.ins, '2021-09-20').c, fees: 7.9, venue: 'Xetra' });
  add({ type: 'buy', date: '2023-03-14', depotId: 'demo-d1', secId: S.ins.id, shares: 10, price: at(P.ins, '2023-03-14').c, fees: 7.9, venue: 'Tradegate' });
  for (let y = 2022; y <= +until.slice(0, 4); y++) {
    const d = `${y}-05-08`;
    if (d > until) continue;
    const gross = r2((d < '2023-03-14' ? 15 : 25) * (10.8 + (y - 2022) * 0.6));
    add({ type: 'div', date: d, depotId: 'demo-d1', secId: S.ins.id, amount: gross, ...tax(gross) });
  }
  const prices = [];
  for (const [k, arr] of Object.entries(P)) for (const p of arr) prices.push({ secId: S[k].id, d: p.d, c: p.c, src: 'beispiel' });
  return {
    app: 'finanzuebersicht', schema: SCHEMA, exportedAt: new Date().toISOString(),
    depots, securities: Object.values(S), txs, plans: [plan],
    prices, fx: usd.map(p => ({ cur: 'USD', d: p.d, r: p.r })), settings: {},
  };
}
