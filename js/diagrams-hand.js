// Hand-made diagrams for guide entries the solver doesn't detect (or that are
// about concepts rather than a single deduction). Same format as diagram.js.

export const HAND_DIAGRAMS = {
  terms: {
    shade: ['row 3', 'col 7', 'box 3'],
    marks: { r3c7: '★' },
    text: 'R3C7 (★) sits in row 3, column 7 and box 3. Every shaded square shares a house with it, so it "sees" them all.',
  },
  cleanup: {
    shade: ['row 4', 'col 4', 'box 5'],
    place: { cell: 'r4c4', digit: 5 },
    cands: { r4c8: [2, 5], r7c4: [5, 9], r5c6: [1, 5], r4c1: [3, 6], r9c9: [5, 7] },
    elims: [['r4c8', 5], ['r7c4', 5], ['r5c6', 5]],
    text: 'Placing 5 in R4C4 removes the 5 note from every square in row 4, column 4 and box 5. R9C9 doesn\'t see R4C4, so its 5 stays.',
  },
  'ur-other': {
    pattern: ['r1c1', 'r1c4', 'r2c1', 'r2c4', 'r2c7'],
    cands: { r1c1: [1, 2], r1c4: [1, 2], r2c1: [1, 2, 3], r2c4: [1, 2, 4], r2c7: [3, 4], r2c8: [3, 6], r2c9: [4, 8] },
    elims: [['r2c8', 3], ['r2c9', 4]],
    text: 'Type 3: one roof square (R2C1 or R2C4) must avoid 1 and 2, so between them the roof acts like a single {3,4} square. With R2C7 {3,4} that makes a naked pair in row 2, so 3 and 4 go from the rest of the row.',
  },
  'sue-de-coq': {
    pattern: ['r1c1', 'r1c2', 'r1c5', 'r2c3'],
    cands: { r1c1: [1, 2, 3], r1c2: [2, 3, 4], r1c5: [1, 2], r2c3: [3, 4], r1c8: [1, 5], r3c2: [3, 7] },
    elims: [['r1c8', 1], ['r3c2', 3]],
    text: 'The overlap R1C1–R1C2 holds {1,2,3,4}. R1C5 {1,2} in the row and R2C3 {3,4} in the box complete four squares for four numbers. So 1 and 2 stay in row 1\'s pattern squares and 3 and 4 in box 1\'s: remove 1 from R1C8 and 3 from R3C2.',
  },
  links: {
    cands: { r3c2: [6], r3c8: [6], r1c9: [6], r7c5: [2, 9] },
    pattern: ['r3c2', 'r3c8', 'r1c9'],
    lines: [['r3c2', 'r3c8', 's'], ['r3c8', 'r1c9', 'w']],
    text: 'Solid: row 3 has only two places for 6, so one of them must be 6 (strong link). Dashed: R3C8 and R1C9 share box 3, so they can\'t both be 6 (weak link). A two-candidate square like R7C5 {2,9} is a strong link inside one square.',
  },
  aic: {
    pattern: ['r2c1', 'r2c6', 'r7c6', 'r7c2'],
    cands: { r2c1: [4, 5], r2c6: [4, 8], r7c6: [4, 5], r7c2: [5, 9], r3c2: [5, 6] },
    elims: [['r3c2', 5]],
    lines: [['r2c1', 'r2c6', 'w'], ['r2c6', 'r7c6', 's'], ['r7c6', 'r7c2', 's']],
    text: 'If R2C1 isn\'t 5 it\'s 4, so R2C6 isn\'t 4, so R7C6 is 4 (column 6\'s only other 4), so R7C6 isn\'t 5, so R7C2 is 5 (row 7\'s only other 5). One end is 5 either way, so R3C2, which sees both (box 1 and column 2), can\'t be 5.',
  },
  'als-xz': {
    pattern: ['r2c2', 'r6c2', 'r6c7'],
    cands: { r2c2: [1, 5], r6c2: [1, 2], r6c7: [2, 5], r2c7: [5, 8] },
    elims: [['r2c7', 5]],
    lines: [['r2c2', 'r6c2', 'w']],
    text: 'Set A is R2C2 {1,5}. Set B is R6C2 + R6C7 {1,2,5}. Their 1s see each other, so only one set can hold the 1, and the other set is locked. If A loses 1, R2C2 is 5. If B loses 1, R6C7 is 5. R2C7 sees both 5s, so it can\'t be 5.',
  },
  'als-xy-wing': {
    pattern: ['r5c5', 'r5c1', 'r1c4', 'r1c5'],
    cands: { r5c5: [1, 2], r5c1: [1, 3], r1c4: [3, 7], r1c5: [2, 7], r1c1: [3, 8] },
    elims: [['r1c1', 3]],
    lines: [['r5c5', 'r5c1', 'w'], ['r5c5', 'r1c5', 'w']],
    text: 'Pivot R5C5 {1,2}. If it\'s 1, R5C1 becomes 3. If it\'s 2, R1C5 becomes 7, which makes R1C4 3. The set R1C4 + R1C5 {2,3,7} acts like one big pincer. Either way a 3 lands where R1C1 can see it.',
  },
  'forcing-net': {
    marks: { r1c1: '3?', r1c6: '7', r4c1: '2', r4c6: '✗' },
    lines: [['r1c1', 'r1c6', 'w'], ['r1c1', 'r4c1', 'w'], ['r1c6', 'r4c6', 'w'], ['r4c1', 'r4c6', 'w']],
    pattern: ['r1c1'],
    focus: ['r4c6'],
    text: 'Suppose R1C1 is 3. One branch forces R1C6 = 7, another forces R4C1 = 2, and together they leave R4C6 with no candidates. The branches combine, which makes it a net. So R1C1 can\'t be 3.',
  },
};
