// Rechenkern: Bestände, Bewertung, Zahlungsströme, Rendite (TWR und IZF).
// Rein rechnerisch, ohne Zugriff auf DOM oder Speicher – dadurch auch in Node testbar.
import { addDays, addMonths, daysBetween, lastIndexLE } from './util.js';

export const TX_TYPES = {
  buy: 'Kauf', sell: 'Verkauf', div: 'Dividende / Ausschüttung', interest: 'Zinszahlung',
  tax: 'Steuerbuchung', in: 'Einlieferung', out: 'Auslieferung',
  split: 'Split / Zusammenlegung', exchange: 'Umtausch', spinoff: 'Abspaltung',
};
export const TX_SHORT = {
  buy: 'Kauf', sell: 'Verkauf', div: 'Dividende', interest: 'Zinsen', tax: 'Steuer',
  in: 'Einlieferung', out: 'Auslieferung', split: 'Split', exchange: 'Umtausch', spinoff: 'Abspaltung',
};
export const KINDS = { stock: 'Aktie', etf: 'ETF', fund: 'Aktiver Fonds', bond: 'Anleihe', other: 'Sonstiges' };

// Untereinheiten, in denen manche Börsen notieren (z. B. London in Pence)
const SUBUNITS = { GBp: ['GBP', 100], GBX: ['GBP', 100], ZAc: ['ZAR', 100], ILA: ['ILS', 100] };
export function normCur(cur) {
  if (SUBUNITS[cur]) return { cur: SUBUNITS[cur][0], div: SUBUNITS[cur][1] };
  return { cur: String(cur || 'EUR').toUpperCase(), div: 1 };
}

export const taxSum = tx => (tx.kest || 0) + (tx.soli || 0) + (tx.kist || 0) + (tx.qst || 0);
const EPS = 1e-9;
const clean = n => Math.abs(n) < 1e-8 ? 0 : n;
const MAX_STALE_PRICE = 14;   // Tage, ab denen ein gespeicherter Kurs als veraltet gilt
const MAX_STALE_FX = 10;
const FX_TYPES = ['buy', 'sell', 'div', 'interest', 'in', 'out'];

// Kurswert einer Buchung in EUR (ohne Gebühren, Steuern, Stückzinsen)
export function grossEur(tx, sec) {
  if (tx.type === 'div' || tx.type === 'interest') {
    const nc = normCur(tx.currency || (sec && sec.currency));
    return (tx.amount || 0) / nc.div / (tx.fx || 1);
  }
  const nc = normCur(tx.currency || (sec && sec.currency));
  const bond = sec && sec.kind === 'bond' ? 0.01 : 1;
  return (tx.shares || 0) * (tx.price || 0) * bond / nc.div / (tx.fx || 1);
}

// Gesamtbetrag einer Buchung aus Sicht des Anlegers (für Anzeige): Kauf = bezahlt, Verkauf/Ertrag = erhalten
export function txTotal(tx, sec) {
  const g = grossEur(tx, sec), fees = tx.fees || 0, acc = tx.accrued || 0, tax = taxSum(tx);
  switch (tx.type) {
    case 'buy': return g + fees + acc + tax;
    case 'sell': return g + acc - fees - tax;
    case 'div': case 'interest': return g - fees - tax;
    case 'tax': return tax;
    default: return null;
  }
}

export class Model {
  // data: { depots, securities, txs, prices: Map(secId → [{d,c,manual}] aufsteigend), fx: Map(cur → [{d,r}] aufsteigend) }
  constructor(data) {
    this.data = data;
    this.secById = new Map(data.securities.map(s => [s.id, s]));
    this.prices = data.prices || new Map();
    this.fx = data.fx || new Map();
    this.missing = new Set();   // Wertpapiere ohne Kurs bei der letzten Rechnung
    this.build();
  }

  // ---------- Bestände ----------
  build() {
    this.txs = [...this.data.txs].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0));
    this.pos = new Map();       // "depotId|secId" → [{d, n}]
    this.splits = new Map();    // secId → [{d, r}]
    this.txInfo = new Map();    // tx.id → { base } Bestand vor Kapitalmaßnahme
    this.cost = new Map();      // key → { cost, realized, income } laufend bis heute
    const cur = new Map();
    const set = (key, d, n) => {
      n = clean(n);
      if (!this.pos.has(key)) this.pos.set(key, []);
      const arr = this.pos.get(key);
      if (arr.length && arr[arr.length - 1].d === d) arr[arr.length - 1].n = n; else arr.push({ d, n });
      cur.set(key, n);
    };
    for (const tx of this.txs) {
      const key = tx.depotId + '|' + tx.secId;
      const have = cur.get(key) || 0;
      switch (tx.type) {
        case 'buy': case 'in': set(key, tx.date, have + (tx.shares || 0)); break;
        case 'sell': case 'out': set(key, tx.date, have - (tx.shares || 0)); break;
        case 'split':
          set(key, tx.date, have * (tx.ratio || 1));
          this.addSplit(tx.secId, tx.date, tx.ratio || 1);
          break;
        case 'exchange': {
          const k2 = tx.depotId + '|' + tx.targetSecId;
          this.txInfo.set(tx.id, { base: have });
          set(k2, tx.date, (cur.get(k2) || 0) + have * (tx.ratio || 1));
          set(key, tx.date, 0);
          break;
        }
        case 'spinoff': {
          const k2 = tx.depotId + '|' + tx.targetSecId;
          this.txInfo.set(tx.id, { base: have });
          set(k2, tx.date, (cur.get(k2) || 0) + have * (tx.ratio || 1));
          break;
        }
        default:
          if (!this.pos.has(key)) this.pos.set(key, []);
      }
    }
  }
  addSplit(secId, d, r) {
    if (!this.splits.has(secId)) this.splits.set(secId, []);
    const arr = this.splits.get(secId);
    if (!arr.some(x => x.d === d)) arr.push({ d, r });   // gleicher Split in mehreren Depots nur einmal
    arr.sort((a, b) => a.d < b.d ? -1 : 1);
  }
  sharesAt(key, d) {
    const arr = this.pos.get(key);
    if (!arr) return 0;
    const i = lastIndexLE(arr, d);
    return i < 0 ? 0 : arr[i].n;
  }
  keys(filter = () => true) { return [...this.pos.keys()].filter(filter); }
  firstDate() { return this.txs.length ? this.txs[0].date : null; }

  // ---------- Kurse und Devisen ----------
  // Produkt aller Split-Verhältnisse nach dem Datum (zum Zurückrechnen splitbereinigter Kurse)
  splitFactorAfter(secId, d) {
    let f = 1;
    for (const s of this.splits.get(secId) || []) if (s.d > d) f *= s.r;
    return f;
  }
  // Produkt der Split-Verhältnisse mit from < Splittag <= to
  splitFactorBetween(secId, from, to) {
    let f = 1;
    for (const s of this.splits.get(secId) || []) if (s.d > from && s.d <= to) f *= s.r;
    return f;
  }
  // Kurs im Originalmaßstab des jeweiligen Tages: { p, cur, d, src }
  priceAt(secId, d) {
    const sec = this.secById.get(secId);
    if (!sec) return null;
    let best = null;
    const arr = this.prices.get(secId) || [];
    const i = lastIndexLE(arr, d);
    if (i >= 0) {
      const pt = arr[i];
      const adj = !pt.manual && sec.histAdjusted !== false ? this.splitFactorAfter(secId, pt.d) : 1;
      best = { p: pt.c * adj, cur: sec.currency, d: pt.d, src: pt.manual ? 'manuell' : 'kurs' };
    }
    // Ersatz: Kurs der jüngsten Buchung, wenn kein oder nur ein älterer gespeicherter Kurs vorliegt
    if (!best || daysBetween(best.d, d) > 0) {
      for (let j = this.txs.length - 1; j >= 0; j--) {
        const t = this.txs[j];
        if (t.secId !== secId || t.date > d || !t.price || !['buy', 'sell', 'in', 'out'].includes(t.type)) continue;
        // Abrechnungskurs gilt für die damalige Stückzahl: spätere Splits bis zum Stichtag herausrechnen
        if (!best || t.date > best.d) best = { p: t.price / this.splitFactorBetween(secId, t.date, d), cur: t.currency || sec.currency, d: t.date, src: 'buchung' };
        break;
      }
    }
    if (best) best.stale = daysBetween(best.d, d) > MAX_STALE_PRICE;
    return best;
  }
  fxAt(curCode, d) {
    const cur = normCur(curCode).cur;
    if (cur === 'EUR') return 1;
    const arr = this.fx.get(cur) || [];
    const i = lastIndexLE(arr, d);
    if (i >= 0 && daysBetween(arr[i].d, d) <= MAX_STALE_FX) return arr[i].r;
    // Ersatz: Devisenkurs der jüngsten Buchung in dieser Währung (nur Buchungen mit echtem Devisenkurs)
    for (let j = this.txs.length - 1; j >= 0; j--) {
      const t = this.txs[j];
      if (t.date > d || !(t.fx > 0) || !t.currency || !FX_TYPES.includes(t.type)) continue;
      if (normCur(t.currency).cur === cur) return t.fx;
    }
    return i >= 0 ? arr[i].r : (arr.length ? arr[0].r : null);
  }
  // Wert von n Stück am Tag d in EUR
  valueOf(secId, n, d) {
    if (!n) return 0;
    const sec = this.secById.get(secId);
    const pr = this.priceAt(secId, d);
    if (!pr) { this.missing.add(secId); return 0; }
    const nc = normCur(pr.cur);
    const fx = this.fxAt(nc.cur, d);
    if (!fx) { this.missing.add(secId); return 0; }
    return n * pr.p / nc.div * (sec.kind === 'bond' ? 0.01 : 1) / fx;
  }
  valueKey(key, d) { return this.valueOf(key.split('|')[1], this.sharesAt(key, d), d); }

  // ---------- Zahlungsströme ----------
  // Zu- (+) und Abflüsse (−) in EUR aus Sicht des Depots; mode 'pre' = vor Steuern, 'post' = nach Steuern
  flowsOf(tx, mode) {
    const sec = this.secById.get(tx.secId);
    const key = tx.depotId + '|' + tx.secId;
    const g = grossEur(tx, sec), fees = tx.fees || 0, acc = tx.accrued || 0;
    const tax = mode === 'post' ? taxSum(tx) : 0;
    const one = amt => [{ key, d: tx.date, amt }];
    switch (tx.type) {
      case 'buy': return one(g + fees + acc + tax);
      case 'sell': return one(-(g + acc - fees - tax));
      case 'div': case 'interest': return one(-(g - fees - tax));
      case 'tax': return tax ? one(tax) : [];
      case 'in': case 'out': {
        let v = this.valueOf(tx.secId, tx.shares, tx.date);
        if (!v && tx.price) v = g;
        return one(tx.type === 'in' ? v : -v);
      }
      case 'exchange': case 'spinoff': {
        const k2 = tx.depotId + '|' + tx.targetSecId;
        const base = (this.txInfo.get(tx.id) || {}).base || 0;
        const newShares = base * (tx.ratio || 1);
        let v = tx.type === 'exchange' ? this.valueOf(tx.secId, base, addDays(tx.date, -1)) : 0;
        if (!v) v = this.valueOf(tx.targetSecId, newShares, tx.date);
        if (!v && tx.price) v = newShares * tx.price / (tx.fx || 1);
        // interne Umbuchung: hebt sich auf, wenn beide Wertpapiere ausgewertet werden
        return v ? [{ key, d: tx.date, amt: -v, internal: true }, { key: k2, d: tx.date, amt: v, internal: true }] : [];
      }
      default: return [];
    }
  }
  flows(filter, a, b, mode) {
    const out = [];
    for (const tx of this.txs) {
      if (tx.date < a || tx.date > b) continue;
      for (const f of this.flowsOf(tx, mode)) if (filter(f.key)) out.push(f);
    }
    return out;
  }

  // ---------- Rendite ----------
  // Flüsse je Tag, Zufluss (in) und Abfluss (out) getrennt; interne Umbuchungen werden saldiert
  dailyFlows(filter, a, b, mode) {
    const m = new Map();
    for (const f of this.flows(filter, a, b, mode)) {
      if (!m.has(f.d)) m.set(f.d, { in: 0, out: 0, internal: 0 });
      const x = m.get(f.d);
      if (f.internal) x.internal += f.amt; else if (f.amt > 0) x.in += f.amt; else x.out -= f.amt;
    }
    for (const [d, x] of m) {
      if (x.internal > EPS) x.in += x.internal; else if (x.internal < -EPS) x.out -= x.internal;
      if (x.in < EPS && x.out < EPS) m.delete(d);
    }
    return m;
  }
  // Tatsächlicher Beginn: ohne Bestand am Vortag beginnt der Zeitraum mit dem ersten Fluss
  effectiveStart(V, flows, a) {
    if (V(addDays(a, -1)) > EPS) return a;
    const dates = [...flows.keys()].sort();
    return dates.length ? dates[0] : null;
  }

  // filter: (key) → bool; a, b: Zeitraum (einschließlich); mode: 'pre' | 'post'
  // Zuflüsse zählen zum Tagesanfang, Abflüsse zum Tagesende.
  perf(filter, a, b, mode = 'pre') {
    this.missing.clear();
    const keys = this.keys(filter);
    const V = d => keys.reduce((s, k) => s + this.valueKey(k, d), 0);
    const flows = this.dailyFlows(filter, a, b, mode);
    const a0 = this.effectiveStart(V, flows, a);
    if (!a0) {
      return { a, b, days: daysBetween(addDays(a, -1), b), startValue: 0, endValue: V(b), inflow: 0, outflow: 0, net: 0, gain: 0,
        twr: null, twrPa: null, irr: null, irrPeriod: null, missing: [...this.missing] };
    }
    a = a0;
    const start = addDays(a, -1);
    const V0 = V(start);
    const dates = [...flows.keys()].sort();
    if (dates[dates.length - 1] !== b) dates.push(b);
    let prev = V0, prevDay = start, growth = 1, inflow = 0, outflow = 0, lastBase = 0;
    const cfs = V0 > EPS ? [{ t: 0, v: -V0 }] : [];
    for (const d of dates) {
      const f = flows.get(d) || NO_FLOW;
      // Entwicklung bis zum Vortag, dann der Tag selbst mit seinen Flüssen
      const dayBefore = addDays(d, -1);
      if (f !== NO_FLOW && dayBefore > prevDay) { const Vy = V(dayBefore); if (prev > EPS) growth *= Vy / prev; prev = Vy; }
      const Vd = V(d);
      growth *= step(prev, Vd, f, lastBase);
      prevDay = d;
      if (prev + f.in > EPS) lastBase = Vd + f.out;
      prev = Vd;
      inflow += f.in; outflow += f.out;
      if (f.in || f.out) cfs.push({ t: daysBetween(start, d), v: f.out - f.in });
    }
    const Vb = prev;
    if (Vb > EPS) cfs.push({ t: daysBetween(start, b), v: Vb });
    const days = daysBetween(start, b);
    const twr = growth - 1;
    const irr = xirr(cfs);
    return {
      a, b, days, startValue: V0, endValue: Vb, inflow, outflow,
      net: inflow - outflow, gain: Vb - V0 - (inflow - outflow),
      twr, twrPa: days >= 365 ? Math.pow(1 + twr, 365 / days) - 1 : null,
      irr, irrPeriod: irr != null ? Math.pow(1 + irr, days / 365) - 1 : null,
      missing: [...this.missing],
    };
  }

  // Verlauf: Wert, eingesetztes Kapital und zeitgewichteter Index über den Zeitraum
  series(filter, a, b, mode = 'pre', points = 120) {
    const keys = this.keys(filter);
    const V = d => keys.reduce((s, k) => s + this.valueKey(k, d), 0);
    const flows = this.dailyFlows(filter, a, b, mode);
    a = this.effectiveStart(V, flows, a) || a;
    const start = addDays(a, -1);
    const total = daysBetween(start, b);
    const stepDays = Math.max(1, Math.floor(total / points));
    const samples = new Set();
    for (let i = 0; i <= total; i += stepDays) samples.add(addDays(start, i));
    samples.add(b);
    const events = [...new Set([...samples, ...flows.keys()])].sort();
    const out = [];
    let prev = V(start), prevDay = start, growth = 1, invested = prev, lastBase = 0;
    for (const d of events) {
      const f = flows.get(d) || NO_FLOW;
      const dayBefore = addDays(d, -1);
      if (f !== NO_FLOW && dayBefore > prevDay) { const Vy = V(dayBefore); if (prev > EPS) growth *= Vy / prev; prev = Vy; }
      const Vd = V(d);
      if (d !== start) {
        growth *= step(prev, Vd, f, lastBase);
        prevDay = d;
        if (prev + f.in > EPS) lastBase = Vd + f.out;
        invested += f.in - f.out;
      }
      prev = Vd;
      if (samples.has(d)) out.push({ d, v: Vd, invested, idx: growth });
    }
    return out;
  }

  yearly(filter, mode = 'pre', until) {
    const first = this.firstDate();
    if (!first) return [];
    const res = [];
    for (let y = +first.slice(0, 4); y <= +until.slice(0, 4); y++) {
      const a = `${y}-01-01` < first ? first : `${y}-01-01`;
      const b = `${y}-12-31` > until ? until : `${y}-12-31`;
      res.push({ year: y, ...this.perf(filter, a, b, mode) });
    }
    return res;
  }

  // ---------- Positionen ----------
  // Einstand nach Durchschnittskosten, realisierte Gewinne und Erträge je Position bis zum Datum
  costBasis(key, d, mode = 'pre') {
    let n = 0, cost = 0, realized = 0, income = 0, taxes = 0;
    const [depotId, secId] = key.split('|');
    const sec = this.secById.get(secId);
    for (const tx of this.txs) {
      if (tx.date > d || tx.depotId !== depotId) continue;
      const own = tx.secId === secId, target = tx.targetSecId === secId;
      if (!own && !target) continue;
      const g = own ? grossEur(tx, sec) : 0;
      const tax = mode === 'post' ? taxSum(tx) : 0;
      if (own) taxes += taxSum(tx);
      switch (own ? tx.type : 'target:' + tx.type) {
        case 'buy': n += tx.shares; cost += g + (tx.fees || 0) + tax; income -= tx.accrued || 0; break;
        case 'in': n += tx.shares; cost += tx.price ? g : this.valueOf(secId, tx.shares, tx.date); break;
        case 'sell': case 'out': {
          const part = n > EPS ? Math.min(1, tx.shares / n) : 0;
          const c = cost * part;
          // Stückzinsen sind Zinsertrag (gezahlte negativ, erhaltene positiv), nicht Kursgewinn
          if (tx.type === 'sell') { realized += g - (tx.fees || 0) - tax - c; income += tx.accrued || 0; }
          cost -= c; n -= tx.shares;
          break;
        }
        case 'div': case 'interest': income += g - (tx.fees || 0) - tax; break;
        case 'tax': income -= tax; break;
        case 'split': n *= tx.ratio || 1; break;
        case 'exchange': n = 0; cost = 0; break;
        case 'spinoff': {
          const f = this.flowsOf(tx, mode).find(x => x.amt < 0);
          if (f) cost = Math.max(0, cost + f.amt);
          break;
        }
        case 'target:exchange': {
          const base = (this.txInfo.get(tx.id) || {}).base || 0;
          const oldKey = tx.depotId + '|' + tx.secId;
          n += base * (tx.ratio || 1);
          cost += this.costBasis(oldKey, addDays(tx.date, -1), mode).cost;
          break;
        }
        case 'target:spinoff': {
          const f = this.flowsOf(tx, mode).find(x => x.amt > 0);
          n += ((this.txInfo.get(tx.id) || {}).base || 0) * (tx.ratio || 1);
          if (f) cost += f.amt;
          break;
        }
      }
      n = clean(n);
    }
    return { shares: n, cost, realized, income, taxes };
  }

  positions(d, filter = () => true, mode = 'pre') {
    this.missing.clear();
    const res = [];
    for (const key of this.keys(filter)) {
      const n = this.sharesAt(key, d);
      if (!n) continue;
      const [depotId, secId] = key.split('|');
      const value = this.valueOf(secId, n, d);
      const cb = this.costBasis(key, d, mode);
      res.push({
        key, depotId, secId, shares: n, value, price: this.priceAt(secId, d),
        cost: cb.cost, unreal: value - cb.cost, unrealPct: cb.cost > EPS ? value / cb.cost - 1 : null,
        realized: cb.realized, income: cb.income,
      });
    }
    return res.sort((x, y) => y.value - x.value);
  }

  // ---------- Plausibilität ----------
  // Auffällige Kurssprünge zwischen zwei aufeinanderfolgenden gespeicherten Kursen
  priceJumps(secId, limit = 0.2) {
    const arr = this.prices.get(secId) || [];
    const sec = this.secById.get(secId);
    const res = [];
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1], b = arr[i];
      if (!a.c || !b.c) continue;
      let ratio = b.c / a.c;
      // Bei nicht bereinigter Historie erklärt ein Split am Tag den Sprung
      if (sec && sec.histAdjusted === false) {
        for (const s of this.splits.get(secId) || []) if (s.d > a.d && s.d <= b.d) ratio *= s.r;
      }
      if (Math.abs(ratio - 1) > limit) res.push({ from: a, to: b, change: ratio - 1 });
    }
    return res;
  }
  // Buchungskurs gegen Schlusskurs desselben Tages
  txPriceDeviations(secId, limit = 0.03) {
    const arr = this.prices.get(secId) || [];
    const sec = this.secById.get(secId);
    const res = [];
    for (const tx of this.txs) {
      if (tx.secId !== secId || !tx.price || !['buy', 'sell'].includes(tx.type)) continue;
      if (normCur(tx.currency || sec.currency).cur !== normCur(sec.currency).cur) continue;
      const i = lastIndexLE(arr, tx.date);
      if (i < 0 || arr[i].d !== tx.date) continue;
      const pr = this.priceAt(secId, tx.date);
      const dev = tx.price / pr.p - 1;
      if (Math.abs(dev) > limit) res.push({ tx, close: pr.p, dev });
    }
    return res;
  }
}

// Teilrendite eines Tages: Zufluss zum Tagesanfang, Abfluss zum Tagesende.
// Ohne Bestand wird eine Auszahlung, z. B. eine Ausschüttung nach dem vollständigen Verkauf,
// dem letzten Abschnitt mit Bestand zugerechnet.
const NO_FLOW = { in: 0, out: 0 };
function step(prev, value, f, lastBase) {
  const base = prev + f.in;
  if (base > EPS) return (value + f.out) / base;
  if (f.out > EPS && lastBase > EPS && value < EPS) return 1 + f.out / lastBase;
  return 1;
}

// Interner Zinsfuß (p. a.) für Zahlungen [{t: Tage ab Start, v: Betrag}]; null, wenn nicht bestimmbar
export function xirr(cfs) {
  if (!cfs.some(c => c.v > EPS) || !cfs.some(c => c.v < -EPS)) return null;
  const f = r => cfs.reduce((s, c) => s + c.v / Math.pow(1 + r, c.t / 365), 0);
  const df = r => cfs.reduce((s, c) => s - (c.t / 365) * c.v / Math.pow(1 + r, c.t / 365 + 1), 0);
  let r = 0.05;
  for (let i = 0; i < 60; i++) {
    const y = f(r), dy = df(r);
    if (!isFinite(y) || !isFinite(dy) || dy === 0) break;
    const nr = r - y / dy;
    if (!isFinite(nr) || nr <= -0.999999) break;
    if (Math.abs(nr - r) < 1e-10) return nr;
    r = nr;
  }
  // Ersatz: Intervallhalbierung
  let lo = -0.999999, hi = 1;
  while (f(lo) * f(hi) > 0 && hi < 1e9) hi *= 10;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

// Fällige, noch nicht erfasste Sparplan-Ausführungen
export function duePlanDates(plan, txs, until) {
  const res = [];
  if (!plan.active || !plan.start) return res;
  const done = new Set(txs.filter(t => t.planId === plan.id).map(t => t.planDate));
  const skipped = new Set(plan.skipped || []);
  const day = +plan.start.slice(8, 10);
  for (let k = 0; k < 600; k++) {
    const d = addMonths(plan.start, k * (plan.every || 1), day);
    if (d > until || (plan.end && d > plan.end)) break;
    if (!done.has(d) && !skipped.has(d)) res.push(d);
  }
  return res;
}
