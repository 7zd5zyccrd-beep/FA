import { h, fmtDate, fmtShares, fmtNum, numIn } from '../util.js';
import { head, list, confirmSheet, toast } from '../ui.js';
import { state, setMeta } from '../db.js';
import { openSplits, openDividends, depotName, rerender } from '../ctx.js';
import { runPriceUpdate } from '../actions.js';

const g = n => n.toLocaleString('de-DE', { maximumFractionDigits: 4 });

// Offene Vorschläge: Kapitalmaßnahmen aus onvista und fällige Dividenden aus der eigenen Historie
export function openItems(view) {
  const splits = openSplits();
  const out = [head('Offene Vorschläge', { back: '#/mehr' })];
  out.push(h('h2', {}, 'Kapitalmaßnahmen'));
  if (!splits.length) {
    out.push(h('div', { class: 'list' }, h('div', { class: 'empty' },
      'Keine offenen Splits. Geprüft wird bei jedem „Kurse aktualisieren“ für alle Aktien mit Börsenplatz.',
      h('div', {}, h('button', { class: 'btn small sec', type: 'button', onclick: () => runPriceUpdate() }, 'Jetzt prüfen')))));
  } else {
    out.push(h('p', { class: 'small muted', style: 'margin:0 4px 8px' }, 'Laut onvista. Bitte mit der Mitteilung der Bank vergleichen, dann erfassen.'));
    out.push(list(...splits.map(x => h('div', { class: 'row', style: 'flex-wrap:wrap' },
      h('div', { class: 'main', style: 'min-width:100%' },
        h('div', { class: 'title' }, x.sec.name),
        h('div', { class: 'sub' }, `${x.factor >= 1 ? 'Split 1 : ' + g(x.factor) : 'Zusammenlegung ' + g(1 / x.factor) + ' : 1'} am ${fmtDate(x.d, true)}`),
        h('div', { class: 'sub' }, `${depotName(x.depotId)}: ${fmtShares(x.before)} → ${fmtShares(x.before * x.factor)} Stück`)),
      h('div', { class: 'rowbtns' },
        h('a', { class: 'btn small', href: `#/buchung/neu?typ=split&wp=${x.sec.id}&depot=${x.depotId}&datum=${x.d}&ratio=${numIn(x.factor).replace(',', '.')}` }, 'Erfassen'),
        h('button', { class: 'btn small text', type: 'button', onclick: async () => {
          if (!await confirmSheet('Vorschlag ausblenden?', `Der Split vom ${fmtDate(x.d)} wird für ${depotName(x.depotId)} nicht mehr vorgeschlagen.`, 'Ausblenden')) return;
          await setMeta('ca.dismissed', [...(state.meta['ca.dismissed'] || []), x.key + '|' + x.d]);
          toast('Ausgeblendet'); rerender();
        } }, 'Entfällt'))))));
  }
  // Dividenden aus der eigenen Historie
  const divs = openDividends();
  out.push(h('h2', {}, 'Dividenden und Zinsen'));
  if (!divs.length) {
    out.push(h('div', { class: 'list' }, h('div', { class: 'empty small' }, 'Keine fälligen Zahlungen. Vorschläge entstehen aus deinen erfassten Dividenden – ab der ersten Zahlung je Wertpapier.')));
  } else {
    out.push(h('p', { class: 'small muted', style: 'margin:0 4px 8px' }, 'Geschätzt aus deinen bisherigen Zahlungen. Betrag und Steuern beim Erfassen aus der Abrechnung übernehmen.'));
    const EVERY = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };
    out.push(list(...divs.slice(0, 60).map(x => {
      const info = `${fmtShares(x.shares)} × ${fmtNum(x.perShare, 2, 4)} ${x.currency}`;
      const href = `#/buchung/neu?typ=${x.type}&wp=${x.sec.id}&depot=${x.depotId}&datum=${x.d}&betrag=${x.amount}&waehrung=${encodeURIComponent(x.currency)}&vorschlag=${encodeURIComponent(info)}`;
      return h('div', { class: 'row', style: 'flex-wrap:wrap' },
        h('a', { class: 'main', href, style: 'color:inherit;min-width:100%' },
          h('div', { class: 'title' }, x.sec.name),
          h('div', { class: 'sub' }, `um ${fmtDate(x.d, true)} · ca. ${fmtNum(x.amount)} ${x.currency} brutto`),
          h('div', { class: 'sub' }, `${depotName(x.depotId)} · ${info} · ${EVERY[x.every]}${x.guessed ? ' (geschätzt)' : ''}`)),
        h('div', { class: 'rowbtns' },
          h('a', { class: 'btn small', href }, 'Erfassen'),
          h('button', { class: 'btn small text', type: 'button', onclick: async () => {
            if (!await confirmSheet('Vorschlag ausblenden?', `Die erwartete Zahlung um den ${fmtDate(x.d)} wird nicht mehr vorgeschlagen.`, 'Ausblenden')) return;
            await setMeta('div.dismissed', [...(state.meta['div.dismissed'] || []), x.key + '|' + x.d]);
            toast('Ausgeblendet'); rerender();
          } }, 'Entfällt')));
    })));
  }
  view.replaceChildren(...out);
}
