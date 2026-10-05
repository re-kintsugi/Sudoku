// Sudoku puzzle generation and solving.
// Boards are flat arrays of 81 numbers, 0 = empty.

const ROW = [], COL = [], BOX = [], PEERS = [];
for (let i = 0; i < 81; i++) {
  ROW[i] = Math.floor(i / 9);
  COL[i] = i % 9;
  BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
}
for (let i = 0; i < 81; i++) {
  const p = [];
  for (let j = 0; j < 81; j++) {
    if (i !== j && (ROW[i] === ROW[j] || COL[i] === COL[j] || BOX[i] === BOX[j])) p.push(j);
  }
  PEERS[i] = p;
}
export { ROW, COL, BOX, PEERS };

const ALL = 0x3fe; // bits 1..9

function popcount(n) {
  let c = 0;
  while (n) { n &= n - 1; c++; }
  return c;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Count solutions up to `limit`. If `out` is given, the first solution is copied into it.
export function countSolutions(board, limit = 2, out = null, randomize = false) {
  const g = board.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (v) {
      const b = 1 << v;
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & b) return 0;
      rows[ROW[i]] |= b; cols[COL[i]] |= b; boxes[BOX[i]] |= b;
    }
  }
  let count = 0;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function solve() {
    // pick the empty cell with the fewest candidates
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const c = popcount(mask);
      if (c < bestCount) {
        best = i; bestMask = mask; bestCount = c;
        if (c <= 1) break;
      }
    }
    if (best === -1) {
      count++;
      if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
      return count >= limit;
    }
    if (bestCount === 0) return false;
    const order = randomize ? shuffle(digits.slice()) : digits;
    for (const v of order) {
      const b = 1 << v;
      if (!(bestMask & b)) continue;
      g[best] = v;
      rows[ROW[best]] |= b; cols[COL[best]] |= b; boxes[BOX[best]] |= b;
      if (solve()) return true;
      rows[ROW[best]] &= ~b; cols[COL[best]] &= ~b; boxes[BOX[best]] &= ~b;
      g[best] = 0;
    }
    return false;
  }
  solve();
  return count;
}

export const DIFFICULTIES = {
  easy: { label: 'Easy', clues: 40 },
  medium: { label: 'Medium', clues: 33 },
  hard: { label: 'Hard', clues: 28 },
  expert: { label: 'Expert', clues: 24 },
};

export function generate(difficulty = 'medium') {
  // Pair removal can get stuck above the target; take the best of a few attempts.
  const target = (DIFFICULTIES[difficulty] || DIFFICULTIES.medium).clues;
  let best = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const g = generateOnce(difficulty);
    const clues = g.puzzle.filter(Boolean).length;
    if (!best || clues < best.clues) best = { ...g, clues };
    if (clues <= target) break;
  }
  delete best.clues;
  return best;
}

function generateOnce(difficulty) {
  const target = (DIFFICULTIES[difficulty] || DIFFICULTIES.medium).clues;
  const solution = new Array(81).fill(0);
  countSolutions(new Array(81).fill(0), 1, solution, true);

  const puzzle = solution.slice();
  let clues = 81;
  // Remove cells in symmetric pairs while the puzzle keeps a unique solution.
  const order = shuffle([...Array(41).keys()]);
  for (const i of order) {
    if (clues <= target) break;
    const j = 80 - i;
    const a = puzzle[i], b = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[i] = a; puzzle[j] = b;
    } else {
      clues -= i === j ? 1 : 2;
    }
  }
  return { puzzle, solution, difficulty };
}
