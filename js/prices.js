// Online-Quellen: onvista (Wertpapiersuche, Börsenplätze, Schlusskurse) und EZB (Devisen-Referenzkurse)
import { addDays, addMonths, tsToDate, today } from './util.js';
import { normCur } from './calc.js';

const OV = 'https://api.onvista.de/api/v1';
const OV_PATH = { STOCK: 'stocks', FUND: 'funds', ETF: 'etfs', BOND: 'bonds', DERIVATIVE: 'derivatives', INDEX: 'indices' };
const OV_KIND = { STOCK: 'stock', FUND: 'fund', ETF: 'etf', BOND: 'bond' };

async function fetchText(url, timeout = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    let res;
    try { res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' }); }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'Zeitüberschreitung' : 'Keine Verbindung oder vom Browser blockiert'); }
    const text = await res.text();
    if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
    return text;
  } finally { clearTimeout(timer); }
}
async function getJSON(url) {
  const t = await fetchText(url);
  try { return JSON.parse(t); } catch { throw new Error('Unerwartete Antwort'); }
}

// ---------- Wertpapier suchen (ISIN oder WKN) ----------
export async function lookup(id) {
  id = id.toUpperCase();
  const s = await getJSON(`${OV}/instruments/search/facet?searchValue=${encodeURIComponent(id)}`);
  const items = [];
  for (const f of s.facets || []) for (const r of f.results || []) if (r.isin) items.push(r);
  const inst = items.find(r => String(r.isin).toUpperCase() === id || String(r.wkn || '').toUpperCase() === id)
    || (items.length === 1 ? items[0] : null);
  if (!inst) throw new Error('Nicht gefunden');
  const isin = String(inst.isin).toUpperCase();
  const path = OV_PATH[inst.entityType] || String(inst.entityType || '').toLowerCase() + 's';
  const snap = await getJSON(`${OV}/${path}/ISIN:${isin}/snapshot`);
  const ins = snap.instrument || {};
  const notations = ((snap.quoteList && snap.quoteList.list) || []).map(n => ({
    id: (n.market && n.market.idNotation) != null ? n.market.idNotation : n.idNotation,
    name: (n.market && n.market.name) || '',
    currency: n.isoCurrency || (n.market && n.market.isoCurrency) || (n.quote && n.quote.isoCurrency) || '',
  })).filter(n => n.id != null);
  const name = ins.name || inst.name || isin;
  let kind = OV_KIND[inst.entityType] || 'other';
  if (kind === 'fund' && /\bETF\b|UCITS ETF|\bETC\b/i.test(name)) kind = 'etf';
  return {
    isin, wkn: ins.wkn || inst.wkn || '', name, kind,
    ov: { type: inst.entityType, uid: ins.entityValue || inst.entityValue },
    notations,
  };
}

// Bevorzugter Börsenplatz für die Bewertung
export function defaultNotation(notations, kind) {
  const find = re => notations.find(n => re.test(n.name));
  if (kind === 'fund') { const k = find(/fondsgesellschaft|\bKAG\b/i); if (k) return k; }
  return find(/^xetra/i) || find(/tradegate/i) || find(/gettex/i) || find(/frankfurt/i)
    || notations.find(n => n.currency === 'EUR') || notations[0] || null;
}

// ---------- Schlusskurse ----------
// Holt Tagesschlusskurse [{d, c}] für from..to; zuerst in Jahresblöcken, sonst in Monatsblöcken
export async function fetchHistory(sec, from, to) {
  if (!sec.ov || !sec.ov.notation) throw new Error('Kein Börsenplatz für den Kursabruf hinterlegt');
  const base = `${OV}/instruments/${encodeURIComponent(sec.ov.type)}/${encodeURIComponent(sec.ov.uid)}/eod_history?idNotation=${encodeURIComponent(sec.ov.notation)}`;
  const get = async (range, start) => {
    const e = await getJSON(`${base}&range=${range}&startDate=${start}`);
    const ts = e.datetimeLast || [], last = e.last || [];
    return { cur: e.isoCurrency, pts: ts.map((t, i) => ({ d: tsToDate(t), c: last[i] })).filter(p => typeof p.c === 'number' && isFinite(p.c)) };
  };
  const out = new Map();
  let cur = null;
  const windows = (step) => { const w = []; for (let d = from; d <= to; d = step(d)) w.push(d); return w; };
  let blocks;
  try {
    const first = await get('Y1', from);
    first.pts.forEach(p => out.set(p.d, p)); cur = first.cur;
    blocks = windows(d => addMonths(d, 12, +d.slice(8, 10))).slice(1).map(d => ['Y1', d]);
  } catch {
    blocks = windows(d => addMonths(d, 1, +d.slice(8, 10))).map(d => ['M1', d]);
  }
  // höchstens vier Abrufe gleichzeitig
  for (let i = 0; i < blocks.length; i += 4) {
    const res = await Promise.all(blocks.slice(i, i + 4).map(([r, d]) => get(r, d)));
    for (const x of res) { x.pts.forEach(p => out.set(p.d, p)); cur = cur || x.cur; }
  }
  return { currency: cur, points: [...out.values()].filter(p => p.d >= from && p.d <= to).sort((a, b) => a.d < b.d ? -1 : 1) };
}

// ---------- Splits ----------
// onvista-Snapshot: stocksSplitList.list[] mit dateSplit und factor (= neue Stücke je bisheriges Stück)
export async function fetchSplits(sec) {
  if (!sec.ov || sec.ov.type !== 'STOCK' || !sec.isin) return [];
  const snap = await getJSON(`${OV}/stocks/ISIN:${encodeURIComponent(sec.isin)}/snapshot`);
  const l = (snap.stocksSplitList && snap.stocksSplitList.list) || [];
  return l.map(x => ({ d: String(x.dateSplit || '').slice(0, 10), factor: Number(x.factor) }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.factor > 0 && x.factor !== 1);
}

// ---------- EZB-Referenzkurse ----------
function parseCsv(text) {
  return text.split(/\r?\n/).filter(Boolean).map(line => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  });
}
// Einheiten Fremdwährung je 1 EUR, [{d, r}]
export async function fetchFx(curCode, from, to) {
  const cur = normCur(curCode).cur;
  let text;
  try {
    text = await fetchText(`https://data-api.ecb.europa.eu/service/data/EXR/D.${encodeURIComponent(cur)}.EUR.SP00.A?startPeriod=${from}&endPeriod=${to}&format=csvdata&detail=dataonly`, 30000);
  } catch (e) {
    if (e.status === 404) return [];   // keine Daten im Zeitraum
    throw e;
  }
  const rows = parseCsv(text);
  const head = rows[0] || [];
  const iD = head.indexOf('TIME_PERIOD'), iV = head.indexOf('OBS_VALUE');
  return rows.slice(1).map(r => ({ d: r[iD], r: parseFloat(r[iV]) })).filter(p => p.d && isFinite(p.r));
}
export async function fxOn(curCode, d) {
  const pts = await fetchFx(curCode, addDays(d, -10), d);
  return pts.length ? pts[pts.length - 1] : null;
}

// ---------- Aktualisieren ----------
// Ermittelt fehlende Zeiträume und lädt Kurse und Devisen nach; meldet Fortschritt über onStep(text)
export async function updateAll(state, db, onStep = () => {}) {
  const end = today();
  const errors = [];
  let added = 0;
  const firstTx = new Map();
  for (const t of state.txs) {
    for (const id of [t.secId, t.targetSecId]) if (id && (!firstTx.has(id) || t.date < firstTx.get(id))) firstTx.set(id, t.date);
  }
  const secs = state.securities.filter(s => s.ov && s.ov.notation && firstTx.has(s.id));
  for (const [i, sec] of secs.entries()) {
    onStep(`Kurse ${i + 1}/${secs.length}: ${sec.name}`);
    const need = addDays(firstTx.get(sec.id), -7);
    const have = (state.prices.get(sec.id) || []).filter(p => !p.manual);
    const ranges = [];
    if (!have.length) ranges.push([need, end]);
    else {
      if (have[0].d > addDays(need, 7)) ranges.push([need, have[0].d]);
      const last = have[have.length - 1].d;
      if (last < end) ranges.push([addDays(last, -5), end]);
    }
    for (const [a, b] of ranges) {
      try {
        const { points } = await fetchHistory(sec, a, b);
        const at = new Date().toISOString();
        await db.putPrices(sec.id, points.map(p => ({ d: p.d, c: p.c, src: 'onvista', venue: sec.ov.venue || '', at })));
        added += points.length;
      } catch (e) {
        errors.push(`${sec.name}: ${e.message}`);
      }
    }
  }
  // Devisen für alle Fremdwährungen ab der ersten Buchung
  const curs = new Set();
  for (const s of state.securities) { const c = normCur(s.currency).cur; if (c !== 'EUR') curs.add(c); }
  for (const t of state.txs) { if (t.currency) { const c = normCur(t.currency).cur; if (c !== 'EUR') curs.add(c); } }
  const first = state.txs.reduce((m, t) => !m || t.date < m ? t.date : m, null);
  for (const cur of curs) {
    if (!first) break;
    onStep(`Devisenkurse ${cur}`);
    const have = state.fx.get(cur) || [];
    const need = addDays(first, -10);
    const ranges = [];
    if (!have.length) ranges.push([need, end]);
    else {
      if (have[0].d > addDays(need, 10)) ranges.push([need, have[0].d]);
      if (have[have.length - 1].d < end) ranges.push([addDays(have[have.length - 1].d, -3), end]);
    }
    for (const [a, b] of ranges) {
      try { await db.putFx(cur, await fetchFx(cur, a, b)); } catch (e) { errors.push(`EZB ${cur}: ${e.message}`); }
    }
  }
  // Splits je Aktie (ein Abruf pro Aktie) für die offenen Kapitalmaßnahmen
  for (const sec of state.securities.filter(s => s.ov && s.ov.type === 'STOCK' && s.isin && firstTx.has(s.id))) {
    onStep(`Kapitalmaßnahmen: ${sec.name}`);
    try { await db.setMeta('ca.' + sec.id, { at: new Date().toISOString(), list: await fetchSplits(sec) }); }
    catch (e) { errors.push(`Splits ${sec.name}: ${e.message}`); }
  }
  await db.setMeta('lastPriceUpdate', new Date().toISOString());
  return { added, errors };
}
