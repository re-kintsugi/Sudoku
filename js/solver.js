// Human-style solver used for hints. It works on a candidate grid and finds
// the easiest technique that makes progress, then explains it.
//
// A step looks like:
//   { tech, place: {cell, digit} | null, elims: [[cell, digit]], premise: [[cell, digit]],
//     cells: [pattern cells], text: 'specific explanation' }
// `premise` lists the candidates that had to be absent for the step to work,
// which lets us drop steps that don't lead to the next placement.

import { ROW, COL, BOX, PEERS } from './sudoku.js';

const HOUSES = [];
for (let r = 0; r < 9; r++) HOUSES.push([...Array(9)].map((_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) HOUSES.push([...Array(9)].map((_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
  const h = [];
  for (let k = 0; k < 9; k++) h.push((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
  HOUSES.push(h);
}
const CELL_HOUSES = [];
for (let i = 0; i < 81; i++) CELL_HOUSES.push([ROW[i], 9 + COL[i], 18 + BOX[i]]);
const PEER_SET = PEERS.map((p) => new Set(p));

export function houseName(h) {
  if (h < 9) return `row ${h + 1}`;
  if (h < 18) return `column ${h - 8}`;
  return `box ${h - 17}`;
}
export function cellName(i) { return `R${ROW[i] + 1}C${COL[i] + 1}`; }
function cellList(cells) {
  const names = cells.map(cellName);
  return names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}
function digitList(ds) {
  return ds.length <= 1 ? ds.join('') : ds.slice(0, -1).join(', ') + ' and ' + ds[ds.length - 1];
}

const sees = (a, b) => a !== b && PEER_SET[a].has(b);
const bit = (d) => 1 << d;
function digitsOf(mask) { const out = []; for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d); return out; }
function popcount(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }
function combos(arr, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push(acc.slice()); return out; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]); combos(arr, k, i + 1, acc, out); acc.pop();
  }
  return out;
}

// Candidate grid from placed values only.
export function basicCandidates(values) {
  const cands = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (values[i]) continue;
    let m = 0x3fe;
    for (const p of PEERS[i]) if (values[p]) m &= ~bit(values[p]);
    cands[i] = m;
  }
  return cands;
}

function positions(st, house, d) {
  const out = [];
  for (const c of HOUSES[house]) if (!st.values[c] && (st.cands[c] & bit(d))) out.push(c);
  return out;
}

function elimsFor(st, cells, digits, exclude) {
  const ex = new Set(exclude);
  const out = [];
  for (const c of cells) {
    if (ex.has(c) || st.values[c]) continue;
    for (const d of digits) if (st.cands[c] & bit(d)) out.push([c, d]);
  }
  return out;
}

// ------------------------------------------------------------------ singles

function fullHouse(st) {
  for (let h = 0; h < 27; h++) {
    const empty = HOUSES[h].filter((c) => !st.values[c]);
    if (empty.length !== 1) continue;
    const c = empty[0];
    let used = 0;
    for (const x of HOUSES[h]) if (st.values[x]) used |= bit(st.values[x]);
    const d = digitsOf(0x3fe & ~used)[0];
    if (!d || !(st.cands[c] & bit(d))) continue;
    return {
      tech: 'full-house', place: { cell: c, digit: d }, elims: [], premise: [], cells: HOUSES[h].slice(), focus: [c],
      text: `${cap(houseName(h))} has only one empty square left, ${cellName(c)}. The missing number is ${d}.`,
    };
  }
  return null;
}

function nakedSingle(st) {
  for (let c = 0; c < 81; c++) {
    if (st.values[c] || popcount(st.cands[c]) !== 1) continue;
    const d = digitsOf(st.cands[c])[0];
    return {
      tech: 'naked-single', place: { cell: c, digit: d }, elims: [],
      premise: digitsOf(0x3fe & ~bit(d)).map((x) => [c, x]), cells: [c], focus: [c],
      text: `Every number except ${d} is already ruled out for ${cellName(c)} by its row, column and box, so it must be ${d}.`,
    };
  }
  return null;
}

function hiddenSingle(st) {
  // boxes first: they're usually easiest to spot
  const order = [...Array(9)].map((_, k) => 18 + k).concat([...Array(18).keys()]);
  for (const h of order) {
    for (let d = 1; d <= 9; d++) {
      if (HOUSES[h].some((c) => st.values[c] === d)) continue;
      const pos = positions(st, h, d);
      if (pos.length !== 1) continue;
      const c = pos[0];
      return {
        tech: 'hidden-single', place: { cell: c, digit: d }, elims: [],
        premise: HOUSES[h].filter((x) => x !== c && !st.values[x]).map((x) => [x, d]),
        cells: HOUSES[h].slice(), focus: [c],
        text: `In ${houseName(h)}, ${cellName(c)} is the only square where a ${d} can go, so it must be ${d}.`,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ intersections

function lockedCandidates(st) {
  // Pointing: box -> line
  for (let b = 18; b < 27; b++) {
    for (let d = 1; d <= 9; d++) {
      const pos = positions(st, b, d);
      if (pos.length < 2) continue;
      for (const line of [ROW[pos[0]], 9 + COL[pos[0]]]) {
        if (!pos.every((c) => HOUSES[line].includes(c))) continue;
        const elims = elimsFor(st, HOUSES[line], [d], pos);
        if (!elims.length) continue;
        return {
          tech: 'pointing', place: null, elims,
          premise: HOUSES[b].filter((c) => !pos.includes(c) && !st.values[c]).map((c) => [c, d]),
          cells: pos, house: b,
          text: `In ${houseName(b)}, every possible ${d} is in ${houseName(line)}. Whichever square gets it, ${houseName(line)}'s ${d} is inside ${houseName(b)}, so ${d} can be removed from the rest of ${houseName(line)}: ${cellList(elims.map((e) => e[0]))}.`,
        };
      }
    }
  }
  // Claiming: line -> box
  for (let line = 0; line < 18; line++) {
    for (let d = 1; d <= 9; d++) {
      const pos = positions(st, line, d);
      if (pos.length < 2) continue;
      const b = 18 + BOX[pos[0]];
      if (!pos.every((c) => 18 + BOX[c] === b)) continue;
      const elims = elimsFor(st, HOUSES[b], [d], pos);
      if (!elims.length) continue;
      return {
        tech: 'claiming', place: null, elims,
        premise: HOUSES[line].filter((c) => !pos.includes(c) && !st.values[c]).map((c) => [c, d]),
        cells: pos, house: line,
        text: `In ${houseName(line)}, every possible ${d} is inside ${houseName(b)}. So ${houseName(b)}'s ${d} must be on ${houseName(line)}, and ${d} can be removed from the rest of ${houseName(b)}: ${cellList(elims.map((e) => e[0]))}.`,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ subsets

const SIZE_NAME = { 2: 'Pair', 3: 'Triple', 4: 'Quadruple' };

function nakedSubset(n) {
  return (st) => {
    for (let h = 0; h < 27; h++) {
      const pool = HOUSES[h].filter((c) => !st.values[c] && popcount(st.cands[c]) >= 2 && popcount(st.cands[c]) <= n);
      if (pool.length < n) continue;
      for (const set of combos(pool, n)) {
        let mask = 0;
        for (const c of set) mask |= st.cands[c];
        if (popcount(mask) !== n) continue;
        const ds = digitsOf(mask);
        // Locked version: the cells also share a second house.
        const shared = CELL_HOUSES[set[0]].filter((x) => x !== h && set.every((c) => CELL_HOUSES[c].includes(x)));
        const houses = [h, ...shared];
        const area = [...new Set(houses.flatMap((x) => HOUSES[x]))];
        const elims = elimsFor(st, area, ds, set);
        if (!elims.length) continue;
        const locked = shared.length > 0 && n <= 3;
        const tech = (locked ? 'locked-' : 'naked-') + SIZE_NAME[n].toLowerCase();
        const where = houses.map(houseName).join(' and ');
        return {
          tech, place: null, elims,
          premise: set.flatMap((c) => digitsOf(0x3fe & ~mask).map((d) => [c, d])),
          cells: set, house: h,
          text: `${cellList(set)} in ${where} can only hold ${digitList(ds)} between them. Those ${n} numbers must go in these ${n} squares, so they can be removed from the other squares in ${where}: ${cellList([...new Set(elims.map((e) => e[0]))])}.`,
        };
      }
    }
    return null;
  };
}

function hiddenSubset(n) {
  return (st) => {
    for (let h = 0; h < 27; h++) {
      const ds = [];
      for (let d = 1; d <= 9; d++) {
        if (HOUSES[h].some((c) => st.values[c] === d)) continue;
        const p = positions(st, h, d);
        if (p.length >= 2 && p.length <= n) ds.push(d);
      }
      if (ds.length < n) continue;
      for (const set of combos(ds, n)) {
        const cells = [...new Set(set.flatMap((d) => positions(st, h, d)))];
        if (cells.length !== n) continue;
        const keep = set.reduce((m, d) => m | bit(d), 0);
        const elims = [];
        for (const c of cells) for (const d of digitsOf(st.cands[c] & ~keep)) elims.push([c, d]);
        if (!elims.length) continue;
        return {
          tech: 'hidden-' + SIZE_NAME[n].toLowerCase(), place: null, elims,
          premise: HOUSES[h].filter((c) => !cells.includes(c) && !st.values[c]).flatMap((c) => set.map((d) => [c, d])),
          cells, house: h,
          text: `In ${houseName(h)}, ${digitList(set)} can only go in ${cellList(cells)}. Those squares are reserved for ${digitList(set)}, so their other candidates (${digitList([...new Set(elims.map((e) => e[1]))].sort())}) can be removed.`,
        };
      }
    }
    return null;
  };
}

// ------------------------------------------------------------------ fish

const FISH_NAME = { 2: 'X-Wing', 3: 'Swordfish', 4: 'Jellyfish' };

function basicFish(n) {
  return (st) => {
    for (let d = 1; d <= 9; d++) {
      for (const rowsBase of [true, false]) {
        const bases = [];
        for (let k = 0; k < 9; k++) {
          const h = rowsBase ? k : 9 + k;
          const pos = positions(st, h, d);
          if (pos.length >= 2 && pos.length <= n) bases.push({ h, pos });
        }
        for (const set of combos(bases, n)) {
          const covers = [...new Set(set.flatMap((b) => b.pos.map((c) => (rowsBase ? COL[c] : ROW[c]))))];
          if (covers.length !== n) continue;
          const coverHouses = covers.map((x) => (rowsBase ? 9 + x : x)).sort((a, b) => a - b);
          const baseCells = set.flatMap((b) => HOUSES[b.h]);
          const elims = elimsFor(st, coverHouses.flatMap((x) => HOUSES[x]), [d], baseCells);
          if (!elims.length) continue;
          const baseNames = set.map((b) => b.h).sort((a, b) => a - b);
          return {
            tech: FISH_NAME[n].toLowerCase(), place: null, elims,
            premise: baseNames.flatMap((h) => HOUSES[h].filter((c) => !st.values[c] && !coverHouses.some((x) => HOUSES[x].includes(c))).map((c) => [c, d])),
            cells: set.flatMap((b) => b.pos),
            text: `Look at the ${d}s. In ${plural(baseNames, rowsBase)}, the ${d}s can only be in ${plural(coverHouses, !rowsBase)}. Those ${n} ${d}s use up ${plural(coverHouses, !rowsBase)}, so ${d} can be removed from the rest of them: ${cellList(elims.map((e) => e[0]))}.`,
          };
        }
      }
    }
    return null;
  };
}

function finnedFish(n) {
  return (st) => {
    for (let d = 1; d <= 9; d++) {
      for (const rowsBase of [true, false]) {
        const bases = [];
        for (let k = 0; k < 9; k++) {
          const h = rowsBase ? k : 9 + k;
          const pos = positions(st, h, d);
          if (pos.length >= 1 && pos.length <= n + 2) bases.push({ h, pos });
        }
        for (const set of combos(bases, n)) {
          const all = set.flatMap((b) => b.pos);
          const idx = (c) => (rowsBase ? COL[c] : ROW[c]);
          const coverIdx = [...new Set(all.map(idx))];
          if (coverIdx.length <= n) continue;
          for (const covers of combos(coverIdx, n)) {
            const fins = all.filter((c) => !covers.includes(idx(c)));
            if (!fins.length || fins.length > 3) continue;
            const fb = BOX[fins[0]];
            if (!fins.every((c) => BOX[c] === fb)) continue;
            // every base line must still touch the covers
            if (!set.every((b) => b.pos.some((c) => covers.includes(idx(c))))) continue;
            const coverHouses = covers.map((x) => (rowsBase ? 9 + x : x));
            const baseHouses = set.map((b) => b.h);
            const targets = [];
            for (const x of coverHouses) for (const c of HOUSES[x]) {
              if (BOX[c] !== fb || baseHouses.some((h) => HOUSES[h].includes(c))) continue;
              if (!st.values[c] && (st.cands[c] & bit(d))) targets.push([c, d]);
            }
            if (!targets.length) continue;
            const sashimi = set.some((b) => b.pos.filter((c) => covers.includes(idx(c))).length < 2);
            const name = (sashimi ? 'sashimi-' : 'finned-') + FISH_NAME[n].toLowerCase();
            const sb = baseHouses.slice().sort((a, b) => a - b);
            const sc = coverHouses.slice().sort((a, b) => a - b);
            return {
              tech: name, place: null, elims: targets,
              premise: sb.flatMap((h) => HOUSES[h].filter((c) => !st.values[c] && !all.includes(c)).map((c) => [c, d])),
              cells: all, focus: fins,
              text: `Look at the ${d}s. In ${plural(sb, rowsBase)} they would form ${FISH_NAME[n] === 'X-Wing' ? 'an' : 'a'} ${FISH_NAME[n]} on ${plural(sc, !rowsBase)}, except for the extra "fin" at ${cellList(fins)}. Either the ${FISH_NAME[n]} holds or the fin is ${d}. Both cases rule out ${d} from ${cellList(targets.map((e) => e[0]))}, which sees the fin and lies in the ${FISH_NAME[n]}'s ${rowsBase ? 'columns' : 'rows'}.`,
            };
          }
        }
      }
    }
    return null;
  };
}

function plural(houses, rows) {
  const nums = houses.map((h) => (h % 9) + 1);
  return (rows ? 'rows ' : 'columns ') + digitList(nums);
}

// ------------------------------------------------------------------ wings

function bivalues(st) {
  const out = [];
  for (let c = 0; c < 81; c++) if (!st.values[c] && popcount(st.cands[c]) === 2) out.push(c);
  return out;
}

function commonPeers(st, cells, d) {
  const out = [];
  for (let c = 0; c < 81; c++) {
    if (st.values[c] || cells.includes(c) || !(st.cands[c] & bit(d))) continue;
    if (cells.every((x) => sees(c, x))) out.push([c, d]);
  }
  return out;
}

function bivaluePremise(st, cells) {
  return cells.flatMap((c) => digitsOf(0x3fe & ~st.cands[c]).map((d) => [c, d]));
}

function xyWing(st) {
  const bv = bivalues(st);
  for (const p of bv) {
    const [x, y] = digitsOf(st.cands[p]);
    const wings = bv.filter((c) => sees(c, p));
    for (const a of wings) {
      if (!(st.cands[a] & bit(x)) || (st.cands[a] & bit(y))) continue;
      const z = digitsOf(st.cands[a] & ~bit(x))[0];
      for (const b of wings) {
        if (b === a || st.cands[b] !== (bit(y) | bit(z))) continue;
        const elims = commonPeers(st, [a, b], z);
        if (!elims.length) continue;
        return {
          tech: 'xy-wing', place: null, elims, premise: bivaluePremise(st, [p, a, b]),
          cells: [p, a, b], focus: [p],
          text: `The pivot ${cellName(p)} is ${x} or ${y}. If it's ${x}, ${cellName(a)} must be ${z}; if it's ${y}, ${cellName(b)} must be ${z}. Either way one of those two is ${z}, so ${z} can be removed from any square that sees both: ${cellList(elims.map((e) => e[0]))}.`,
        };
      }
    }
  }
  return null;
}

function xyzWing(st) {
  const bv = bivalues(st);
  for (let p = 0; p < 81; p++) {
    if (st.values[p] || popcount(st.cands[p]) !== 3) continue;
    const wings = bv.filter((c) => sees(c, p) && (st.cands[c] & ~st.cands[p]) === 0);
    for (const [a, b] of combos(wings, 2)) {
      if ((st.cands[a] | st.cands[b]) !== st.cands[p] || st.cands[a] === st.cands[b]) continue;
      const z = digitsOf(st.cands[a] & st.cands[b])[0];
      const elims = commonPeers(st, [p, a, b], z);
      if (!elims.length) continue;
      const [x, y] = digitsOf(st.cands[p] & ~bit(z));
      return {
        tech: 'xyz-wing', place: null, elims, premise: bivaluePremise(st, [p, a, b]),
        cells: [p, a, b], focus: [p],
        text: `The pivot ${cellName(p)} is ${x}, ${y} or ${z}, and its pincers ${cellName(a)} and ${cellName(b)} each pair one of those with ${z}. Whatever the pivot is, one of these three squares ends up ${z}. So ${z} can be removed from squares that see all three: ${cellList(elims.map((e) => e[0]))}.`,
      };
    }
  }
  return null;
}

function wWing(st) {
  const bv = bivalues(st);
  for (const [c1, c2] of combos(bv, 2)) {
    if (st.cands[c1] !== st.cands[c2] || sees(c1, c2)) continue;
    const ds = digitsOf(st.cands[c1]);
    for (const a of ds) {
      const b = ds.find((x) => x !== a);
      for (let h = 0; h < 27; h++) {
        const pos = positions(st, h, a);
        if (pos.length !== 2 || pos.includes(c1) || pos.includes(c2)) continue;
        const [p, q] = pos;
        const ok = (sees(c1, p) && sees(c2, q)) || (sees(c1, q) && sees(c2, p));
        if (!ok) continue;
        const elims = commonPeers(st, [c1, c2], b);
        if (!elims.length) continue;
        return {
          tech: 'w-wing', place: null, elims,
          premise: bivaluePremise(st, [c1, c2]).concat(HOUSES[h].filter((c) => !pos.includes(c) && !st.values[c]).map((c) => [c, a])),
          cells: [c1, c2, p, q], focus: [c1, c2],
          text: `${cellName(c1)} and ${cellName(c2)} are both ${a}/${b}. In ${houseName(h)}, ${a} can only be at ${cellName(p)} or ${cellName(q)}, and each of those sees one of the pair. Whichever gets the ${a} forces its pair square to be ${b}, so ${b} can be removed from squares that see both: ${cellList(elims.map((e) => e[0]))}.`,
        };
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ chains

function xyChain(st) {
  const bv = bivalues(st);
  const bvSet = new Set(bv);
  const MAX = 8;
  let best = null;
  for (const start of bv) {
    for (const z of digitsOf(st.cands[start])) {
      // start is "not z" => it's the other digit; walk on.
      const path = [start];
      const walk = (cell, entering) => {
        if (best && best.cells.length <= path.length) return;
        const out = digitsOf(st.cands[cell] & ~bit(entering))[0]; // this cell's value if 'entering' is false
        if (path.length >= 3 && out === z) {
          const elims = commonPeers(st, [start, cell], z);
          if (elims.length && (!best || path.length < best.cells.length)) {
            best = { cells: path.slice(), z, elims };
          }
        }
        if (path.length >= MAX) return;
        for (const nxt of PEERS[cell]) {
          if (!bvSet.has(nxt) || path.includes(nxt) || !(st.cands[nxt] & bit(out))) continue;
          path.push(nxt);
          walk(nxt, out);
          path.pop();
        }
      };
      walk(start, z);
    }
  }
  if (!best) return null;
  const { cells, z, elims } = best;
  const same = cells.every((c) => st.cands[c] === st.cands[cells[0]]);
  const ends = `${cellName(cells[0])} and ${cellName(cells[cells.length - 1])}`;
  return {
    tech: same ? 'remote-pair' : 'xy-chain', place: null, elims, premise: bivaluePremise(st, cells),
    cells, focus: [cells[0], cells[cells.length - 1]],
    text: same
      ? `The squares ${cellList(cells)} all hold only ${digitList(digitsOf(st.cands[cells[0]]))} and form a chain where each sees the next, so the values alternate along it. The two ends must be different, so one of them is ${z}. Remove ${z} from squares that see both ends: ${cellList(elims.map((e) => e[0]))}.`
      : `Follow the chain of two-candidate squares ${cellList(cells)}. If ${cellName(cells[0])} isn't ${z}, each square forces the next until ${cellName(cells[cells.length - 1])} is ${z}. So one of ${ends} must be ${z}, and ${z} can be removed from squares that see both: ${cellList(elims.map((e) => e[0]))}.`,
  };
}

function xChain(st) {
  const MAX_CELLS = 8;
  let best = null;
  for (let d = 1; d <= 9; d++) {
    const strong = new Map(); // cell -> [{ to, h }]
    for (let h = 0; h < 27; h++) {
      const pos = positions(st, h, d);
      if (pos.length !== 2) continue;
      for (const [a, b] of [[pos[0], pos[1]], [pos[1], pos[0]]]) {
        if (!strong.has(a)) strong.set(a, []);
        strong.get(a).push({ to: b, h });
      }
    }
    for (const start of strong.keys()) {
      const path = [start], links = [];
      // At `cell` the chain continues with a strong link (only two places for d in a house).
      const walk = (cell) => {
        if (best && best.cells.length <= path.length + 1) return;
        for (const { to, h } of strong.get(cell)) {
          if (path.includes(to)) continue;
          path.push(to); links.push(h);
          if (path.length >= 4) {
            const elims = commonPeers(st, [start, to], d).filter(([c]) => !path.includes(c));
            if (elims.length && (!best || path.length < best.cells.length)) {
              best = { d, cells: path.slice(), links: links.slice(), elims };
            }
          }
          if (path.length + 2 <= MAX_CELLS) {
            // weak link: any peer that can also be d
            for (const w of PEERS[to]) {
              if (!strong.has(w) || path.includes(w)) continue;
              path.push(w);
              walk(w);
              path.pop();
            }
          }
          path.pop(); links.pop();
        }
      };
      walk(start);
    }
  }
  if (!best) return null;
  const { d, cells, links, elims } = best;
  const a = cells[0], b = cells[cells.length - 1];
  return {
    tech: 'x-chain', place: null, elims,
    premise: links.flatMap((h) => HOUSES[h].filter((c) => !st.values[c] && !cells.includes(c)).map((c) => [c, d])),
    cells, focus: [a, b],
    text: `Follow the ${d}s along ${cellList(cells)}. The links alternate between "${d} has only these two places in a house" and "these two can't both be ${d}". If ${cellName(a)} isn't ${d}, the chain forces ${cellName(b)} to be ${d}. So one end is ${d}, and ${d} can be removed from squares that see both ends: ${cellList(elims.map((e) => e[0]))}.`,
  };
}

// ------------------------------------------------------------------ uniqueness

function rectangles(st) {
  const out = [];
  for (const [r1, r2] of combos([...Array(9).keys()], 2)) {
    for (const [c1, c2] of combos([...Array(9).keys()], 2)) {
      const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      if (new Set(cells.map((c) => BOX[c])).size !== 2) continue;
      if (cells.some((c) => st.values[c])) continue;
      out.push(cells);
    }
  }
  return out;
}

function uniqueRectangle(st) {
  for (const cells of rectangles(st)) {
    const common = cells.reduce((m, c) => m & st.cands[c], 0x3fe);
    if (popcount(common) < 2) continue;
    for (const pair of combos(digitsOf(common), 2)) {
      const pm = bit(pair[0]) | bit(pair[1]);
      const floor = cells.filter((c) => st.cands[c] === pm);
      const roof = cells.filter((c) => st.cands[c] !== pm);
      const ab = `${pair[0]}/${pair[1]}`;
      // Type 1: three corners are exactly the pair
      if (floor.length === 3) {
        const t = roof[0];
        const elims = pair.map((d) => [t, d]);
        return {
          tech: 'ur-type-1', place: null, elims, premise: bivaluePremise(st, floor), cells, focus: [t],
          text: `${cellList(floor)} are all ${ab}, and with ${cellName(t)} they form a rectangle across two boxes. If ${cellName(t)} were also ${pair[0]} or ${pair[1]}, the ${pair[0]}s and ${pair[1]}s could swap and the puzzle would have two solutions. So ${cellName(t)} can't be ${pair[0]} or ${pair[1]}.`,
        };
      }
      if (floor.length !== 2 || roof.length !== 2) continue;
      const sameLine = ROW[roof[0]] === ROW[roof[1]] || COL[roof[0]] === COL[roof[1]];
      if (!sameLine) continue;
      // Type 2: both roof cells have the same single extra digit
      const ex0 = st.cands[roof[0]] & ~pm, ex1 = st.cands[roof[1]] & ~pm;
      if (ex0 === ex1 && popcount(ex0) === 1) {
        const x = digitsOf(ex0)[0];
        const elims = commonPeers(st, roof, x);
        if (elims.length) {
          return {
            tech: 'ur-type-2', place: null, elims, premise: bivaluePremise(st, floor).concat(roof.flatMap((c) => digitsOf(0x3fe & ~(pm | ex0)).map((d) => [c, d]))),
            cells, focus: roof,
            text: `${cellList(floor)} are ${ab}, and ${cellList(roof)} are ${ab} plus ${x}. If neither roof square were ${x}, the rectangle could swap and the puzzle would have two solutions. So one of them is ${x}, and ${x} can be removed from squares that see both: ${cellList(elims.map((e) => e[0]))}.`,
          };
        }
      }
      // Type 4: a strong link on one pair digit across the roof
      const roofHouses = CELL_HOUSES[roof[0]].filter((h) => CELL_HOUSES[roof[1]].includes(h));
      for (const h of roofHouses) {
        for (const [u, v] of [pair, [pair[1], pair[0]]]) {
          const pos = positions(st, h, u);
          if (pos.length !== 2 || !roof.every((c) => pos.includes(c))) continue;
          const elims = roof.filter((c) => st.cands[c] & bit(v)).map((c) => [c, v]);
          if (!elims.length) continue;
          return {
            tech: 'ur-type-4', place: null, elims,
            premise: bivaluePremise(st, floor).concat(HOUSES[h].filter((c) => !roof.includes(c) && !st.values[c]).map((c) => [c, u])),
            cells, focus: roof,
            text: `${cellList(floor)} are ${ab}. In ${houseName(h)}, ${u} can only go in ${cellList(roof)}, so one of them is ${u}. If either were ${v}, the rectangle could swap for a second solution. So ${v} can be removed from ${cellList(elims.map((e) => e[0]))}.`,
          };
        }
      }
    }
  }
  return null;
}

function bugPlusOne(st) {
  let tri = -1;
  for (let c = 0; c < 81; c++) {
    if (st.values[c]) continue;
    const n = popcount(st.cands[c]);
    if (n === 2) continue;
    if (n === 3 && tri < 0) { tri = c; continue; }
    return null;
  }
  if (tri < 0) return null;
  for (const d of digitsOf(st.cands[tri])) {
    if (positions(st, ROW[tri], d).length === 3 || positions(st, 9 + COL[tri], d).length === 3 || positions(st, 18 + BOX[tri], d).length === 3) {
      return {
        tech: 'bug-plus-one', place: { cell: tri, digit: d }, elims: [], premise: [], cells: [tri], focus: [tri],
        text: `Every unsolved square has exactly two candidates except ${cellName(tri)}. If it weren't ${d}, every candidate would appear exactly twice in each house, a pattern with more than one solution. So ${cellName(tri)} must be ${d}.`,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ last resort

// Assume a candidate and follow singles until something breaks.
function contradictionAfter(st0, cell, digit) {
  const st = { values: st0.values.slice(), cands: st0.cands.slice() };
  const placeAt = (c, d) => {
    st.values[c] = d; st.cands[c] = 0;
    for (const p of PEERS[c]) st.cands[p] &= ~bit(d);
  };
  placeAt(cell, digit);
  for (let guard = 0; guard < 81; guard++) {
    for (let c = 0; c < 81; c++) if (!st.values[c] && !st.cands[c]) return `${cellName(c)} would have no possible numbers left`;
    for (let h = 0; h < 27; h++) {
      for (let d = 1; d <= 9; d++) {
        if (HOUSES[h].some((c) => st.values[c] === d)) continue;
        if (!positions(st, h, d).length) return `${houseName(h)} would have nowhere to put a ${d}`;
      }
    }
    const s = nakedSingle(st) || hiddenSingle(st);
    if (!s) return null;
    placeAt(s.place.cell, s.place.digit);
  }
  return null;
}

function forcingChain(st) {
  // Prefer two-candidate squares: a contradiction there places the other number.
  const cells = [];
  for (let c = 0; c < 81; c++) if (!st.values[c] && st.cands[c]) cells.push(c);
  cells.sort((a, b) => popcount(st.cands[a]) - popcount(st.cands[b]));
  for (const c of cells) {
    for (const d of digitsOf(st.cands[c])) {
      const why = contradictionAfter(st, c, d);
      if (!why) continue;
      const rest = digitsOf(st.cands[c] & ~bit(d));
      const base = { premise: [], cells: [c], focus: [c] };
      if (rest.length === 1) {
        return {
          ...base, tech: 'forcing-chain', place: { cell: c, digit: rest[0] }, elims: [],
          text: `Suppose ${cellName(c)} were ${d}. Following the singles from there, ${why}. That's impossible, so ${cellName(c)} isn't ${d} and must be ${rest[0]}.`,
        };
      }
      return {
        ...base, tech: 'forcing-chain', place: null, elims: [[c, d]],
        text: `Suppose ${cellName(c)} were ${d}. Following the singles from there, ${why}. That's impossible, so ${d} can be removed from ${cellName(c)}.`,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ driver

// Ordered easiest first; `level` is used to pick the headline technique.
const TECHNIQUES = [
  fullHouse, nakedSingle, hiddenSingle, lockedCandidates,
  nakedSubset(2), hiddenSubset(2), nakedSubset(3), hiddenSubset(3),
  basicFish(2), xyWing, nakedSubset(4), hiddenSubset(4), basicFish(3),
  uniqueRectangle, bugPlusOne, xyzWing, wWing, finnedFish(2), finnedFish(3),
  basicFish(4), xChain, xyChain, forcingChain,
];

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

function apply(st, step) {
  for (const [c, d] of step.elims) st.cands[c] &= ~bit(d);
  if (step.place) {
    const { cell, digit } = step.place;
    st.values[cell] = digit;
    st.cands[cell] = 0;
    for (const p of PEERS[cell]) st.cands[p] &= ~bit(digit);
  }
}

function findStep(st) {
  for (let k = 0; k < TECHNIQUES.length; k++) {
    const s = TECHNIQUES[k](st);
    if (s) { s.rank = k; return s; }
  }
  return null;
}

// Steps from the current position to the next placed number, keeping only
// the ones that matter for it. Returns null if the techniques run out.
export function nextHint(values) {
  const st = { values: values.slice(), cands: basicCandidates(values) };
  const steps = [];
  for (let guard = 0; guard < 200; guard++) {
    const s = findStep(st);
    if (!s) return null;
    steps.push(s);
    apply(st, s);
    if (s.place) break;
  }
  // Walk backwards keeping steps whose eliminations the later ones relied on.
  const need = new Set();
  const key = (c, d) => c * 10 + d;
  const kept = [];
  for (let k = steps.length - 1; k >= 0; k--) {
    const s = steps[k];
    const relevant = k === steps.length - 1 || s.elims.some(([c, d]) => need.has(key(c, d)));
    if (!relevant) continue;
    kept.unshift(s);
    for (const [c, d] of s.premise) need.add(key(c, d));
  }
  return kept;
}

// Rate a puzzle by the hardest technique a full logical solve needs.
export function solveLogically(values) {
  const st = { values: values.slice(), cands: basicCandidates(values) };
  let hardest = -1;
  const used = new Set();
  for (let guard = 0; guard < 2000; guard++) {
    if (st.values.every((v) => v)) return { solved: true, hardest, used: [...used], values: st.values };
    const s = findStep(st);
    if (!s) return { solved: false, hardest, used: [...used], values: st.values };
    hardest = Math.max(hardest, s.rank);
    used.add(s.tech);
    apply(st, s);
  }
  return { solved: false, hardest, used: [...used], values: st.values };
}

export { HOUSES };

// Difficulty tiers by technique, matching the strategy guide's grouping.
const TIER_OF = {
  'full-house': 0, 'naked-single': 0, 'hidden-single': 0,
  pointing: 1, claiming: 1, 'naked-pair': 1, 'locked-pair': 1, 'hidden-pair': 1,
  'naked-triple': 1, 'locked-triple': 1, 'hidden-triple': 1,
  'x-wing': 2, swordfish: 2, 'naked-quadruple': 2, 'hidden-quadruple': 2,
  'xy-wing': 2, 'ur-type-1': 2, 'ur-type-2': 2, 'bug-plus-one': 2,
};
export const TIERS = ['easy', 'medium', 'hard', 'expert'];

// Which tier a puzzle belongs to, and the techniques a logical solve used.
export function ratePuzzle(puzzle) {
  const r = solveLogically(puzzle);
  const tier = r.used.reduce((t, id) => Math.max(t, TIER_OF[id] ?? 3), 0);
  return { tier: TIERS[tier], techs: r.used };
}
