// Generate a puzzle whose difficulty is set by the techniques it needs.
import { generate, generateOnce } from './sudoku.js';
import { ratePuzzle, TIERS } from './solver.js';

const pause = () => new Promise((r) => setTimeout(r));

// Keeps generating until a puzzle of the wanted tier turns up, yielding to the
// UI every few dozen ms. If time runs out, returns the closest one found and
// labels it with the tier it really is.
export async function generateRated(tier, { budgetMs = 8000 } = {}) {
  const want = Math.max(0, TIERS.indexOf(tier));
  const start = Date.now();
  let slice = start;
  let best = null;
  for (;;) {
    // Easy puzzles keep more givens; harder tiers come from minimal puzzles.
    const { puzzle, solution } = want === 0 ? generate('easy') : generateOnce(0);
    const r = ratePuzzle(puzzle);
    const got = TIERS.indexOf(r.tier);
    if (got === want) return { puzzle, solution, difficulty: TIERS[got], techs: r.techs };
    if (!best || Math.abs(got - want) < Math.abs(best.got - want)) best = { puzzle, solution, techs: r.techs, got };
    if (Date.now() - start > budgetMs) {
      return { puzzle: best.puzzle, solution: best.solution, difficulty: TIERS[best.got], techs: best.techs };
    }
    if (Date.now() - slice > 30) { await pause(); slice = Date.now(); }
  }
}
