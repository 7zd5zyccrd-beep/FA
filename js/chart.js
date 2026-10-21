// Einfache SVG-Diagramme: Linien mit Antippen-Anzeige, Balken je Jahr, Aufteilung
import { h, s, fmtDate, fmtNum, fmtPct } from './util.js';

const W = 360, H = 190, PAD_L = 4, PAD_R = 4, PAD_T = 12, PAD_B = 22;

function niceTicks(min, max, count = 3) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

// series: [{ label, values: [...], color: 'var(--chart-1)', dash }]; dates: ['YYYY-MM-DD', ...]
export function lineChart(dates, series, { fmtY = v => fmtNum(v, 0, 0), fmtTip = v => fmtNum(v), area = true } = {}) {
  const wrap = h('div', { class: 'chart' });
  if (dates.length < 2) { wrap.append(h('div', { class: 'empty small' }, 'Zu wenige Daten für ein Diagramm.')); return wrap; }
  const all = series.flatMap(x => x.values).filter(v => v != null && isFinite(v));
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x = i => PAD_L + (W - PAD_L - PAD_R) * i / (dates.length - 1);
  const y = v => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - lo) / (hi - lo || 1));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': series.map(x => x.label).join(', ') });
  for (const t of ticks) {
    svg.append(s('line', { x1: PAD_L, x2: W - PAD_R, y1: y(t), y2: y(t), stroke: 'var(--chart-grid)', 'stroke-width': 1 }));
    svg.append(s('text', { x: PAD_L + 2, y: y(t) - 3, 'font-size': 10, fill: 'var(--muted)' }, fmtY(t)));
  }
  const xl = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  xl.forEach((i, k) => svg.append(s('text', { x: x(i), y: H - 6, 'font-size': 10, fill: 'var(--muted)', 'text-anchor': ['start', 'middle', 'end'][k] }, fmtDate(dates[i]))));
  series.forEach((ser, si) => {
    const pts = ser.values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
    if (!pts.length) return;
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    if (area && si === 0) {
      const base = y(Math.max(lo, Math.min(0, hi)));
      svg.append(s('path', { d: `${d} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`, fill: ser.color, opacity: 0.08 }));
    }
    svg.append(s('path', { d, fill: 'none', stroke: ser.color, 'stroke-width': si === 0 ? 2 : 1.5, 'stroke-dasharray': ser.dash || null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  });
  // Antippen: senkrechte Linie, Punkte und Werte
  const cursor = s('line', { y1: PAD_T, y2: H - PAD_B, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' });
  const dots = series.map(ser => s('circle', { r: 3.5, fill: ser.color, visibility: 'hidden' }));
  svg.append(cursor, ...dots);
  const tip = h('div', { class: 'tip', hidden: true });
  wrap.append(svg, tip);
  const show = ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(dates.length - 1, Math.round((px - PAD_L) / (W - PAD_L - PAD_R) * (dates.length - 1))));
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('visibility', 'visible');
    series.forEach((ser, k) => {
      const v = ser.values[i];
      if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
      dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); dots[k].setAttribute('visibility', 'visible');
    });
    tip.replaceChildren(h('div', { style: 'font-weight:600' }, fmtDate(dates[i])),
      ...series.map(ser => h('div', {}, h('span', { style: `color:${ser.color}` }, '● '), ser.label + ': ', ser.values[i] == null ? '–' : fmtTip(ser.values[i]))));
    tip.hidden = false;
    const left = x(i) / W * r.width;
    tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, left - tip.offsetWidth / 2)) + 'px';
    tip.style.top = '-8px';
  };
  const hide = () => { cursor.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.hidden = true; };
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', hide);
  wrap.append(h('div', { class: 'legend' }, series.map(ser => h('span', {}, h('i', { style: `background:${ser.color}` }), ser.label))));
  return wrap;
}

// Waagerechte Balken für Jahreswerte (positiv/negativ um eine Nulllinie)
export function yearBars(rows, fmt = v => fmtPct(v)) {
  const vals = rows.map(r => r.value).filter(v => v != null && isFinite(v));
  const wrap = h('div', { class: 'bars' });
  if (!vals.length) { wrap.append(h('div', { class: 'empty small' }, 'Noch keine Jahreswerte.')); return wrap; }
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = max - min || 1;
  const zero = (0 - min) / span * 100;
  for (const r of rows) {
    const v = r.value;
    const track = h('div', { class: 'track' }, h('div', { class: 'zero', style: `left:${zero}%` }));
    if (v != null && isFinite(v)) {
      const left = (Math.min(v, 0) - min) / span * 100, width = Math.abs(v) / span * 100;
      track.append(h('div', { class: 'b', style: `left:${left}%;width:${Math.max(width, 0.8)}%;background:${v >= 0 ? 'var(--pos)' : 'var(--neg)'}` }));
    }
    wrap.append(h('div', { class: 'bar-row' }, h('span', {}, r.label), track, h('span', { class: 'right ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : ''), style: 'text-align:right' }, v == null ? '–' : fmt(v))));
  }
  return wrap;
}

// Aufteilung als Balkenliste: items [{label, value}]
export function allocation(items, fmtVal) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return h('div', { class: 'alloc' }, items.sort((a, b) => b.value - a.value).map(i => h('div', { class: 'a-row' },
    h('div', { class: 'a-top' }, h('span', {}, i.label), h('span', { class: 'muted' }, `${fmtPct(i.value / total, false)} · ${fmtVal(i.value)}`)),
    h('div', { class: 'a-track' }, h('div', { class: 'a-fill', style: `width:${(i.value / total * 100).toFixed(1)}%` })))));
}
