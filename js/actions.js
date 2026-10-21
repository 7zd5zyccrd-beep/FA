// Abläufe, die von mehreren Ansichten ausgelöst werden
import { h, today, fmtDate } from './util.js';
import { toast, confirmSheet, shareFile } from './ui.js';
import * as db from './db.js';
import { state } from './db.js';
import { updateAll } from './prices.js';
import { rerender, go } from './ctx.js';
import { buildDemo } from './demo.js';

let running = false;
export async function runPriceUpdate() {
  if (running) return;
  if (state.meta.demo) { toast('Die Beispieldaten haben erfundene Kurse – es wird nichts abgerufen.'); return; }
  if (!state.securities.some(s => s.ov && s.ov.notation)) { toast('Kein Wertpapier mit Börsenplatz für den Kursabruf.'); return; }
  running = true;
  const msg = h('span', {}, 'Starte …');
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'spin' }), ' ', msg);
  document.body.append(el);
  try {
    const r = await updateAll(state, db, t => { msg.textContent = t; });
    await db.setMeta('lastPriceErrors', r.errors);
    el.remove();
    toast(r.errors.length ? `${r.added} Kurse geladen, ${r.errors.length} Fehler – Details unter Mehr → Kurse und Devisen` : `Kurse aktuell (${r.added} neu geladen)`, 4000);
  } catch (e) {
    el.remove();
    toast('Abruf fehlgeschlagen: ' + e.message, 4000);
  }
  running = false;
  rerender();
}

export async function exportBackup() {
  const data = db.exportData();
  const ok = await shareFile(`finanzuebersicht-sicherung-${today()}.json`, JSON.stringify(data), 'application/json');
  if (!ok) return;
  await db.setMeta('lastBackup', new Date().toISOString());
  await db.setMeta('changes', 0);
  toast('Sicherung erstellt');
  rerender();
}

export async function importBackup(file) {
  let data;
  try { data = db.validateImport(JSON.parse(await file.text())); }
  catch (e) { toast(e instanceof SyntaxError ? 'Die Datei ist keine gültige Sicherung.' : e.message, 4000); return; }
  const text = `Sicherung vom ${fmtDate(String(data.exportedAt).slice(0, 10))}: ${data.depots.length} Depots, ${data.securities.length} Wertpapiere, ${data.txs.length} Buchungen. Die aktuellen Daten auf diesem Gerät werden ersetzt.`;
  if (!await confirmSheet('Sicherung einlesen?', text, 'Einlesen und ersetzen', true)) return;
  await db.importData(data);
  toast('Sicherung eingelesen');
  go('#/');
}

export async function loadDemo() {
  if ((state.txs.length || state.securities.length) && !state.meta.demo) {
    if (!await confirmSheet('Beispieldaten laden?', 'Deine eigenen Daten auf diesem Gerät werden dabei ersetzt. Vorher eine Sicherung erstellen!', 'Ersetzen', true)) return;
  }
  await db.importData(buildDemo(today()));
  await db.setMeta('demo', true);
  toast('Beispieldaten geladen');
  go('#/');
}

// Neu laden an allen Zwischenspeichern vorbei: Safari hält Programmdateien sonst bis zu
// 10 Minuten (Vorgabe von GitHub Pages). Jede geladene Datei wird frisch geholt, dann neu gestartet.
const APP_FILES = ['index.html', 'css/app.css', 'manifest.webmanifest', 'js/app.js', 'js/ctx.js', 'js/util.js', 'js/ui.js', 'js/db.js',
  'js/calc.js', 'js/prices.js', 'js/chart.js', 'js/actions.js', 'js/demo.js',
  'js/views/overview.js', 'js/views/holdings.js', 'js/views/txs.js', 'js/views/analysis.js', 'js/views/more.js'];
export async function hardReload() {
  toast('Hole die neueste Version …', 8000);
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const loaded = performance.getEntriesByType('resource').map(e => e.name.split('?')[0])
    .filter(u => u.startsWith(location.origin) && /\.(js|css|webmanifest)$/.test(u));
  const urls = [...new Set([location.origin + location.pathname, ...APP_FILES.map(f => base + f), ...loaded])];
  await Promise.all(urls.map(u => fetch(u, { cache: 'reload', credentials: 'omit' }).catch(() => null)));
  location.replace(location.pathname + '?neu=' + Date.now() + location.hash);
}
