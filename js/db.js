// Lokale Speicherung in IndexedDB und Zustand im Arbeitsspeicher
const DB_NAME = 'finanzuebersicht';
const DB_VERSION = 1;
const LISTS = ['depots', 'securities', 'txs', 'plans'];
export const SCHEMA = 1;

export const state = {
  depots: [], securities: [], txs: [], plans: [],
  prices: new Map(),   // secId → [{d, c, src, venue, at, manual}] aufsteigend
  fx: new Map(),       // cur → [{d, r}] aufsteigend
  meta: {},
  version: 0,          // zählt jede Änderung, damit Berechnungen neu laufen
};

let db;
function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function tx(stores, mode = 'readonly') { return db.transaction(stores, mode); }
function done(t) { return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }

export async function open() {
  const r = indexedDB.open(DB_NAME, DB_VERSION);
  r.onupgradeneeded = () => {
    const d = r.result;
    for (const s of LISTS) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    for (const s of ['prices', 'fx', 'meta']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'k' });
  };
  db = await req(r);
  await loadAll();
  // Bitte an Safari, die Daten nicht automatisch zu löschen
  try { if (navigator.storage && navigator.storage.persist) state.meta._persisted = await navigator.storage.persist(); } catch { /* egal */ }
}

async function loadAll() {
  const t = tx([...LISTS, 'prices', 'fx', 'meta']);
  const [depots, securities, txs, plans, prices, fx, meta] = await Promise.all(
    [...LISTS, 'prices', 'fx', 'meta'].map(s => req(t.objectStore(s).getAll())));
  Object.assign(state, { depots, securities, txs, plans });
  state.prices = groupSorted(prices, p => p.secId);
  state.fx = groupSorted(fx, p => p.cur);
  state.meta = Object.fromEntries(meta.map(m => [m.k, m.v]));
  state.version++;
}
function groupSorted(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  for (const arr of m.values()) arr.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  return m;
}

// ---------- Listen (Depots, Wertpapiere, Buchungen, Sparpläne) ----------
export async function save(store, obj) {
  const t = tx([store, 'meta'], 'readwrite');
  t.objectStore(store).put(obj);
  bumpChanges(t);
  await done(t);
  const list = state[store];
  const i = list.findIndex(x => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  state.version++;
}
export async function remove(store, id) {
  const t = tx([store, 'meta'], 'readwrite');
  t.objectStore(store).delete(id);
  bumpChanges(t);
  await done(t);
  state[store] = state[store].filter(x => x.id !== id);
  state.version++;
}
function bumpChanges(t) {
  state.meta.changes = (state.meta.changes || 0) + 1;
  t.objectStore('meta').put({ k: 'changes', v: state.meta.changes });
}

export async function setMeta(k, v) {
  const t = tx(['meta'], 'readwrite');
  t.objectStore('meta').put({ k, v });
  await done(t);
  state.meta[k] = v;
}

// ---------- Kurse ----------
// Fügt Kurse hinzu; von Hand gesetzte Kurse werden durch Abrufe nie überschrieben
export async function putPrices(secId, points) {
  const arr = state.prices.get(secId) || [];
  const byDate = new Map(arr.map(p => [p.d, p]));
  const t = tx(['prices'], 'readwrite');
  const st = t.objectStore('prices');
  for (const p of points) {
    const old = byDate.get(p.d);
    if (old && old.manual && !p.manual) continue;
    const row = { ...p, secId, k: secId + '|' + p.d };
    st.put(row);
    byDate.set(p.d, row);
  }
  await done(t);
  state.prices.set(secId, [...byDate.values()].sort((a, b) => a.d < b.d ? -1 : 1));
  state.version++;
}
export async function deletePrice(secId, d) {
  const t = tx(['prices'], 'readwrite');
  t.objectStore('prices').delete(secId + '|' + d);
  await done(t);
  state.prices.set(secId, (state.prices.get(secId) || []).filter(p => p.d !== d));
  state.version++;
}
export async function deletePricesOf(secId) {
  const arr = state.prices.get(secId) || [];
  const t = tx(['prices'], 'readwrite');
  for (const p of arr) t.objectStore('prices').delete(p.k);
  await done(t);
  state.prices.delete(secId);
  state.version++;
}
export async function putFx(cur, points) {
  const arr = state.fx.get(cur) || [];
  const byDate = new Map(arr.map(p => [p.d, p]));
  const t = tx(['fx'], 'readwrite');
  for (const p of points) {
    const row = { cur, d: p.d, r: p.r, k: cur + '|' + p.d };
    t.objectStore('fx').put(row);
    byDate.set(p.d, row);
  }
  await done(t);
  state.fx.set(cur, [...byDate.values()].sort((a, b) => a.d < b.d ? -1 : 1));
  state.version++;
}

// ---------- Sicherung ----------
export function exportData() {
  return {
    app: 'finanzuebersicht', schema: SCHEMA, exportedAt: new Date().toISOString(),
    depots: state.depots, securities: state.securities, txs: state.txs, plans: state.plans,
    prices: [...state.prices.values()].flat().map(({ k, ...p }) => p),
    fx: [...state.fx.values()].flat().map(({ k, ...p }) => p),
    settings: Object.fromEntries(Object.entries(state.meta).filter(([k]) => k.startsWith('set.'))),
  };
}
export function validateImport(d) {
  if (!d || d.app !== 'finanzuebersicht') throw new Error('Das ist keine Sicherung dieser App.');
  if (d.schema > SCHEMA) throw new Error('Die Sicherung stammt aus einer neueren App-Version. Bitte zuerst die App neu laden.');
  for (const k of LISTS) if (!Array.isArray(d[k])) throw new Error(`Sicherung unvollständig (${k} fehlt).`);
  return d;
}
export async function importData(d) {
  validateImport(d);
  const stores = [...LISTS, 'prices', 'fx', 'meta'];
  const t = tx(stores, 'readwrite');
  for (const s of stores) t.objectStore(s).clear();
  for (const s of LISTS) for (const o of d[s]) t.objectStore(s).put(o);
  for (const p of d.prices || []) t.objectStore('prices').put({ ...p, k: p.secId + '|' + p.d });
  for (const p of d.fx || []) t.objectStore('fx').put({ ...p, k: p.cur + '|' + p.d });
  for (const [k, v] of Object.entries(d.settings || {})) t.objectStore('meta').put({ k, v });
  t.objectStore('meta').put({ k: 'lastBackup', v: new Date().toISOString() });
  t.objectStore('meta').put({ k: 'changes', v: 0 });
  await done(t);
  await loadAll();
}
export async function clearAll() {
  const stores = [...LISTS, 'prices', 'fx', 'meta'];
  const t = tx(stores, 'readwrite');
  for (const s of stores) t.objectStore(s).clear();
  await done(t);
  await loadAll();
}
