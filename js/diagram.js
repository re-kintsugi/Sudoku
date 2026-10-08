// Draws a small annotated board as SVG for the strategy guide.
//
// spec: {
//   values: 81-char string ('0' = empty) or { r4c4: 5, ... },
//   cands:  { cell: bitmask } or { r4c8: [2, 5], ... },
//   pattern, focus, shade: cells,  elims: [[cell, digit]],  place: { cell, digit },
//   lines: [[cellA, cellB, 's' | 'w']]  (strong = solid, weak = dashed),
//   marks: { cell: text }               (a label drawn in the cell)
//   digit: n                            (placed copies of n are drawn darker)
// }
// Cells can be indexes (0-80) or names like 'r3c7'. `shade` also accepts 'row 3', 'col 7', 'box 5'.

const S = 34;   // cell size
const M = 16;   // margin for row/column numbers
const W = M + S * 9 + 2;

function cellIndex(c) {
  if (typeof c === 'number') return c;
  const m = /^r(\d)c(\d)$/i.exec(c);
  return (m[1] - 1) * 9 + (m[2] - 1);
}

function expandHouse(h) {
  const m = /^(row|col|box) (\d)$/.exec(h);
  if (!m) return [cellIndex(h)];
  const n = +m[2] - 1, out = [];
  for (let k = 0; k < 9; k++) {
    if (m[1] === 'row') out.push(n * 9 + k);
    else if (m[1] === 'col') out.push(k * 9 + n);
    else out.push((Math.floor(n / 3) * 3 + Math.floor(k / 3)) * 9 + (n % 3) * 3 + (k % 3));
  }
  return out;
}

const x0 = (i) => M + (i % 9) * S;
const y0 = (i) => M + Math.floor(i / 9) * S;
const candXY = (i, d) => [x0(i) + ((d - 1) % 3 + 0.5) * (S / 3), y0(i) + (Math.floor((d - 1) / 3) + 0.5) * (S / 3)];

export function diagramSVG(spec) {
  const values = new Array(81).fill(0);
  if (typeof spec.values === 'string') for (let i = 0; i < 81; i++) values[i] = +spec.values[i];
  else for (const [c, v] of Object.entries(spec.values || {})) values[cellIndex(c)] = v;

  const cands = new Map();
  for (const [c, m] of Object.entries(spec.cands || {})) {
    const i = /^\d+$/.test(c) ? +c : cellIndex(c);
    cands.set(i, Array.isArray(m) ? m.reduce((a, d) => a | (1 << d), 0) : m);
  }
  const cells = (list) => (list || []).map(cellIndex);
  const pattern = new Set(cells(spec.pattern));
  const focus = new Set(cells(spec.focus));
  const shade = new Set((spec.shade || []).flatMap((h) => (typeof h === 'string' ? expandHouse(h) : [h])));
  const elims = (spec.elims || []).map(([c, d]) => [cellIndex(c), d]);
  const elimCells = new Set(elims.map((e) => e[0]));
  const isElim = (i, d) => elims.some(([c, x]) => c === i && x === d);
  const place = spec.place ? { cell: cellIndex(spec.place.cell), digit: spec.place.digit } : null;

  const out = [`<svg class="diagram-svg" viewBox="0 0 ${W} ${W}" role="img" aria-label="Example board">`];
  out.push(`<rect class="dg-bg" x="${M}" y="${M}" width="${S * 9}" height="${S * 9}"/>`);
  for (let i = 0; i < 81; i++) {
    let cls = '';
    if (shade.has(i)) cls = 'dg-shade';
    if (elimCells.has(i)) cls = 'dg-elimcell';
    if (pattern.has(i)) cls = 'dg-pat';
    if (cls) out.push(`<rect class="${cls}" x="${x0(i)}" y="${y0(i)}" width="${S}" height="${S}"/>`);
  }
  // grid
  for (let k = 0; k <= 9; k++) {
    const thick = k % 3 === 0 ? ' dg-thick' : '';
    out.push(`<line class="dg-grid${thick}" x1="${M + k * S}" y1="${M}" x2="${M + k * S}" y2="${M + 9 * S}"/>`);
    out.push(`<line class="dg-grid${thick}" x1="${M}" y1="${M + k * S}" x2="${M + 9 * S}" y2="${M + k * S}"/>`);
    if (k < 9) {
      out.push(`<text class="dg-label" x="${M + k * S + S / 2}" y="${M - 4}">${k + 1}</text>`);
      out.push(`<text class="dg-label" x="${M / 2}" y="${M + k * S + S / 2 + 3}">${k + 1}</text>`);
    }
  }
  for (const i of focus) out.push(`<rect class="dg-focus" x="${x0(i) + 1}" y="${y0(i) + 1}" width="${S - 2}" height="${S - 2}" rx="2"/>`);
  if (place) out.push(`<rect class="dg-target" x="${x0(place.cell) + 1}" y="${y0(place.cell) + 1}" width="${S - 2}" height="${S - 2}" rx="2"/>`);
  // links between cell centres
  for (const [a, b, kind] of spec.lines || []) {
    const A = cellIndex(a), B = cellIndex(b);
    out.push(`<line class="dg-link ${kind === 's' ? 'dg-strong' : 'dg-weak'}" x1="${x0(A) + S / 2}" y1="${y0(A) + S / 2}" x2="${x0(B) + S / 2}" y2="${y0(B) + S / 2}"/>`);
  }
  // numbers
  for (let i = 0; i < 81; i++) {
    if (values[i]) {
      const hl = values[i] === spec.digit ? ' dg-valhl' : '';
      out.push(`<text class="dg-val${hl}" x="${x0(i) + S / 2}" y="${y0(i) + S / 2 + 7}">${values[i]}</text>`);
    } else if (place && place.cell === i) {
      out.push(`<text class="dg-new" x="${x0(i) + S / 2}" y="${y0(i) + S / 2 + 7}">${place.digit}</text>`);
    } else if (cands.has(i)) {
      const m = cands.get(i);
      for (let d = 1; d <= 9; d++) {
        if (!(m & (1 << d))) continue;
        const [cx, cy] = candXY(i, d);
        const x = isElim(i, d);
        out.push(`<text class="dg-cand${x ? ' dg-x' : ''}" x="${cx}" y="${cy + 3.5}">${d}</text>`);
        if (x) out.push(`<line class="dg-strike" x1="${cx - 4}" y1="${cy + 4}" x2="${cx + 4}" y2="${cy - 4}"/>`);
      }
    }
  }
  for (const [c, text] of Object.entries(spec.marks || {})) {
    const i = cellIndex(c);
    out.push(`<text class="dg-mark" x="${x0(i) + S / 2}" y="${y0(i) + S / 2 + 6}">${text}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

export const LEGEND = `<div class="dg-legend">
  <span><i class="lg-pat"></i>pattern</span>
  <span><i class="lg-elim"></i>candidate removed</span>
  <span><i class="lg-target"></i>answer</span>
  <span><i class="lg-strong"></i>strong link</span>
  <span><i class="lg-weak"></i>weak link</span>
</div>`;
