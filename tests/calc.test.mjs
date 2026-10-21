// Prüffälle für den Rechenkern: node tests/calc.test.mjs
import { Model, xirr, duePlanDates, grossEur } from '../js/calc.js';
import assert from 'node:assert/strict';

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} erwartet ${b}, erhalten ${a}`);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok –', name); };
const P = pts => pts.map(([d, c]) => ({ d, c }));

test('IZF: 100 → 110 nach genau einem Jahr = 10 %', () => {
  near(xirr([{ t: 0, v: -100 }, { t: 365, v: 110 }]), 0.10, 1e-9);
});
test('IZF: zwei Einzahlungen', () => {
  // -100 bei t0, -100 nach 1/2 Jahr, Endwert 220 nach 1 Jahr → r mit 100(1+r)+100(1+r)^0.5 = 220
  const r = xirr([{ t: 0, v: -100 }, { t: 182.5, v: -100 }, { t: 365, v: 220 }]);
  near(100 * (1 + r) + 100 * Math.pow(1 + r, 0.5), 220, 1e-6);
});

const sec = { id: 'A', currency: 'EUR', kind: 'stock' };
const base = () => ({ depots: [{ id: 'D' }], securities: [sec], prices: new Map(), fx: new Map() });

test('Kauf, Kursanstieg: TWR und IZF', () => {
  const data = base();
  data.txs = [{ id: 1, type: 'buy', date: '2024-01-02', depotId: 'D', secId: 'A', shares: 10, price: 100, fees: 0 }];
  data.prices.set('A', P([['2024-01-02', 100], ['2024-12-31', 120]]));
  const m = new Model(data);
  const p = m.perf(() => true, '2024-01-02', '2024-12-31');
  near(p.twr, 0.20, 1e-9, 'TWR');
  near(p.endValue, 1200, 1e-9);
  near(p.gain, 200, 1e-9);
  // Einzahlung 1000 am Tag 1 (t=1), Endwert 1200 am Tag 365 → IZF über 364 Tage
  near(p.irr, Math.pow(1.2, 365 / 364) - 1, 1e-6, 'IZF');
});

test('Zeitpunkt zählt: TWR gleich, IZF verschieden', () => {
  // Fall A: Nachkauf vor dem Anstieg; Fall B: Nachkauf nach dem Anstieg
  const mk = second => {
    const data = base();
    data.prices.set('A', P([['2024-01-01', 100], ['2024-06-30', 100], ['2024-07-01', 150], ['2024-12-31', 150]]));
    data.txs = [
      { id: 1, type: 'buy', date: '2024-01-01', depotId: 'D', secId: 'A', shares: 10, price: 100 },
      { id: 2, type: 'buy', date: second, depotId: 'D', secId: 'A', shares: 10, price: second < '2024-07-01' ? 100 : 150 },
    ];
    return new Model(data).perf(() => true, '2024-01-01', '2024-12-31');
  };
  const A = mk('2024-01-12'), B = mk('2024-11-30');
  near(A.twr, 0.5, 1e-9); near(B.twr, 0.5, 1e-9);
  assert.ok(A.irr > B.irr, 'früher Nachkauf vor Anstieg muss höheren IZF haben');
  near(A.gain, 1000, 1e-9); near(B.gain, 500, 1e-9);
});

test('Dividende als Abfluss, vor/nach Steuern', () => {
  const data = base();
  data.prices.set('A', P([['2024-01-01', 100], ['2024-12-31', 100]]));
  data.txs = [
    { id: 1, type: 'buy', date: '2024-01-01', depotId: 'D', secId: 'A', shares: 10, price: 100 },
    { id: 2, type: 'div', date: '2024-06-01', depotId: 'D', secId: 'A', amount: 50, kest: 12.5, soli: 0.69 },
  ];
  const m = new Model(data);
  near(m.perf(() => true, '2024-01-01', '2024-12-31', 'pre').twr, 0.05, 1e-9);
  near(m.perf(() => true, '2024-01-01', '2024-12-31', 'post').twr, (50 - 13.19) / 1000, 1e-9);
});

test('Split: Bestand und splitbereinigte Kurshistorie', () => {
  const data = base();
  // Bereinigte Historie: vor dem Split 1:4 steht 25 statt 100
  data.prices.set('A', P([['2024-01-02', 25], ['2024-06-03', 26], ['2024-12-31', 30]]));
  data.txs = [
    { id: 1, type: 'buy', date: '2024-01-02', depotId: 'D', secId: 'A', shares: 10, price: 100 },
    { id: 2, type: 'split', date: '2024-06-03', depotId: 'D', secId: 'A', ratio: 4 },
  ];
  const m = new Model(data);
  assert.equal(m.sharesAt('D|A', '2024-06-02'), 10);
  assert.equal(m.sharesAt('D|A', '2024-06-03'), 40);
  near(m.valueKey('D|A', '2024-01-02'), 1000, 1e-9, 'Wert vor Split');
  near(m.valueKey('D|A', '2024-12-31'), 1200, 1e-9, 'Wert nach Split');
  near(m.perf(() => true, '2024-01-02', '2024-12-31').twr, 0.2, 1e-9);
  assert.equal(m.priceJumps('A').length, 0);
});

test('Fremdwährung mit EZB-Kurs', () => {
  const data = base();
  data.securities = [{ id: 'U', currency: 'USD', kind: 'stock' }];
  data.prices.set('U', P([['2024-01-02', 110], ['2024-12-31', 110]]));
  data.fx.set('USD', [{ d: '2024-01-02', r: 1.10 }, { d: '2024-12-31', r: 1.00 }]);
  data.txs = [{ id: 1, type: 'buy', date: '2024-01-02', depotId: 'D', secId: 'U', shares: 10, price: 110, currency: 'USD', fx: 1.10 }];
  const m = new Model(data);
  near(m.valueKey('D|U', '2024-12-31'), 1100, 1e-9);
  near(m.perf(() => true, '2024-01-02', '2024-12-31').twr, 0.10, 1e-9, 'Währungsgewinn');
});

test('Anleihe: Kurs in % vom Nennwert, Stückzinsen', () => {
  const data = base();
  data.securities = [{ id: 'B', currency: 'EUR', kind: 'bond' }];
  data.prices.set('B', P([['2024-01-02', 98], ['2024-12-31', 99]]));
  data.txs = [
    { id: 1, type: 'buy', date: '2024-01-02', depotId: 'D', secId: 'B', shares: 10000, price: 98, accrued: 50, fees: 10 },
    { id: 2, type: 'interest', date: '2024-07-01', depotId: 'D', secId: 'B', amount: 300 },
  ];
  const m = new Model(data);
  near(grossEur(data.txs[0], data.securities[0]), 9800, 1e-9);
  near(m.valueKey('D|B', '2024-12-31'), 9900, 1e-9);
  const p = m.perf(() => true, '2024-01-02', '2024-12-31');
  near(p.inflow, 9860, 1e-9);
  near(p.gain, 9900 + 300 - 9860, 1e-9);
});

test('Verkauf: realisierter Gewinn nach Durchschnittskosten', () => {
  const data = base();
  data.prices.set('A', P([['2024-01-01', 100], ['2024-12-31', 130]]));
  data.txs = [
    { id: 1, type: 'buy', date: '2024-01-01', depotId: 'D', secId: 'A', shares: 10, price: 100, fees: 10 },
    { id: 2, type: 'buy', date: '2024-03-01', depotId: 'D', secId: 'A', shares: 10, price: 120, fees: 10 },
    { id: 3, type: 'sell', date: '2024-06-01', depotId: 'D', secId: 'A', shares: 5, price: 130, fees: 5 },
  ];
  const m = new Model(data);
  const cb = m.costBasis('D|A', '2024-12-31');
  near(cb.shares, 15);
  near(cb.cost, 2220 * 0.75, 1e-9);
  near(cb.realized, 650 - 5 - 2220 * 0.25, 1e-9);
});

test('Umtausch: Gesamtrendite unverändert, Bestand wandert', () => {
  const data = base();
  data.securities = [sec, { id: 'N', currency: 'EUR', kind: 'stock' }];
  data.prices.set('A', P([['2024-01-01', 100], ['2024-06-30', 110]]));
  data.prices.set('N', P([['2024-07-01', 55], ['2024-12-31', 60]]));
  data.txs = [
    { id: 1, type: 'buy', date: '2024-01-01', depotId: 'D', secId: 'A', shares: 10, price: 100 },
    { id: 2, type: 'exchange', date: '2024-07-01', depotId: 'D', secId: 'A', targetSecId: 'N', ratio: 2 },
  ];
  const m = new Model(data);
  assert.equal(m.sharesAt('D|N', '2024-12-31'), 20);
  assert.equal(m.sharesAt('D|A', '2024-12-31'), 0);
  near(m.perf(() => true, '2024-01-01', '2024-12-31').twr, 0.2, 1e-9);
  near(m.perf(k => k === 'D|N', '2024-07-01', '2024-12-31').twr, 60 / 55 - 1, 1e-9);
});

test('Sparplan: fällige Termine', () => {
  const plan = { id: 'p', active: true, start: '2024-01-31', every: 1 };
  const due = duePlanDates(plan, [{ planId: 'p', planDate: '2024-01-31' }], '2024-04-30');
  assert.deepEqual(due, ['2024-02-29', '2024-03-31', '2024-04-30']);
});

console.log(`\n${n} Prüffälle bestanden.`);
