import { h, $ } from './util.js';
import { icon } from './ui.js';
import { open } from './db.js';
import { trackNav } from './ctx.js';
import { overview } from './views/overview.js';
import { holdings, securityDetail } from './views/holdings.js';
import { txList, txForm } from './views/txs.js';
import { analysis } from './views/analysis.js';
import { openItems } from './views/open.js';
import { more, depots, depotForm, securities, securityForm, plans, planForm, pricesView, backup, help } from './views/more.js';

const ROUTES = [
  [/^\/?$/, overview, 'home'],
  [/^\/bestand$/, holdings, 'holdings'],
  [/^\/wp\/([^/]+)$/, securityDetail, 'holdings'],
  [/^\/buchungen$/, txList, 'txs'],
  [/^\/buchung\/([^/]+)$/, txForm, 'txs'],
  [/^\/auswertung$/, analysis, 'chart'],
  [/^\/mehr$/, more, 'more'],
  [/^\/depots$/, depots, 'more'],
  [/^\/depot\/([^/]+)$/, depotForm, 'more'],
  [/^\/wertpapiere$/, securities, 'more'],
  [/^\/wertpapier\/([^/]+)$/, securityForm, 'more'],
  [/^\/sparplaene$/, plans, 'more'],
  [/^\/sparplan\/([^/]+)$/, planForm, 'more'],
  [/^\/kurse$/, pricesView, 'more'],
  [/^\/sicherung$/, backup, 'more'],
  [/^\/hilfe$/, help, 'more'],
  [/^\/offen$/, openItems, 'more'],
];
const TABS = [['home', '#/', 'Übersicht'], ['holdings', '#/bestand', 'Bestand'], ['txs', '#/buchungen', 'Buchungen'], ['chart', '#/auswertung', 'Auswertung'], ['more', '#/mehr', 'Mehr']];

const view = $('#view');
const tabbar = $('#tabbar');
let lastPath = null;

function render() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  let match = null;
  for (const [re, fn, tab] of ROUTES) { const m = path.match(re); if (m) { match = { fn, tab, args: m.slice(1).map(decodeURIComponent) }; break; } }
  if (!match) match = { fn: overview, tab: 'home', args: [] };
  for (const a of tabbar.querySelectorAll('a')) {
    const on = a.dataset.tab === match.tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  trackNav(location.hash);
  const samePage = path === lastPath;
  const y = window.scrollY;
  try {
    match.fn(view, ...match.args);
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'banner bad', style: 'margin-top:20px' }, h('div', { class: 'main' }, h('b', {}, 'Da ist etwas schiefgelaufen'), String(e.message || e))));
  }
  // Beim Neuzeichnen derselben Seite Position halten, sonst nach oben
  window.scrollTo(0, samePage ? y : 0);
  lastPath = path;
}

async function start() {
  tabbar.replaceChildren(...TABS.map(([tab, href, label]) => h('a', { href, 'data-tab': tab }, icon(tab), h('span', {}, label))));
  try {
    await open();
  } catch (e) {
    view.replaceChildren(h('div', { class: 'banner bad', style: 'margin-top:20px' }, h('div', { class: 'main' },
      h('b', {}, 'Speicher nicht verfügbar'), 'Die App braucht den lokalen Speicher des Browsers (IndexedDB). Im privaten Modus von Safari ist er gesperrt. ', String(e && e.message || ''))));
    return;
  }
  // Nach „Neu laden“ den Zusatz aus der Adresse entfernen
  if (location.search.includes('neu=')) history.replaceState(null, '', location.pathname + location.hash);
  window.addEventListener('hashchange', render);
  render();
}
start();
