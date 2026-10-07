// Strategy guide content. Each technique has a short `summary` (shown with
// hints) and a longer `body` (shown in the guide). Ids match the solver's.

export const CHAPTERS = [
  {
    id: 'basics', title: 'The Basics',
    intro: 'The words used throughout this guide.',
    techniques: [
      {
        id: 'terms', name: 'Cells, houses and candidates', level: 'Basics',
        summary: 'A house is any row, column or box. Each must hold 1–9 exactly once.',
        body: [
          'The grid has 81 <b>cells</b> (squares), in 9 <b>rows</b>, 9 <b>columns</b> and 9 <b>boxes</b> (the bold 3×3 areas). Any row, column or box is called a <b>house</b>.',
          'The one rule: every house contains each digit 1–9 exactly once. A proper puzzle has exactly one solution, and you can always reach it by logic. You never need to guess.',
          'Cells are named by row and column: <b>R3C7</b> is row 3, column 7. Two cells that share a house <b>see</b> each other, and can never hold the same digit.',
          '<b>Candidates</b> are the digits a cell could still be. Writing them as notes is what makes most techniques beyond the singles possible.',
        ],
      },
    ],
  },
  {
    id: 'singles', title: 'Singles',
    intro: 'Every solve is mostly singles. These place numbers directly.',
    techniques: [
      {
        id: 'full-house', name: 'Full House', level: 'Easy',
        summary: 'A row, column or box with just one empty square: it gets the missing number.',
        body: [
          'When a house has only one empty cell left, that cell must take the one digit the house is missing.',
          'It\'s the easiest pattern to spot. Look for rows, columns and boxes that are nearly full.',
        ],
      },
      {
        id: 'naked-single', name: 'Naked Single', level: 'Easy',
        summary: 'A square where every number but one is already used in its row, column or box.',
        body: [
          'Pick a cell and check its row, column and box. If eight different digits already appear among them, the cell can only be the ninth.',
          'With notes, it\'s a cell showing just one candidate. That candidate is "naked".',
        ],
      },
      {
        id: 'hidden-single', name: 'Hidden Single', level: 'Easy',
        summary: 'Pick a number and a house: if that number fits in only one square there, it goes there.',
        body: [
          'Change the question from "what goes in this cell?" to "where can the 5 go in this box?". If every other empty cell in the house is blocked from 5 (a 5 already sits in its row, column or box), the one remaining cell must be the 5.',
          'That cell might still have other candidates. That\'s why the single is "hidden".',
          'Tip: pick up a number on the pad. Every copy of it lights up, which makes the blocked squares easy to see.',
        ],
      },
      {
        id: 'cleanup', name: 'Keeping notes tidy', level: 'Easy',
        summary: 'When you place a number, remove it from the notes of every square that sees it.',
        body: [
          'A solved cell rules its digit out of every other cell in its row, column and box. Remove those candidates as you go. This game does it for you when you place a number.',
          'Use <b>Check</b> to spot notes that clash with a placed number, or squares whose notes have lost the right answer.',
        ],
      },
    ],
  },
  {
    id: 'intersections', title: 'Intersections',
    intro: 'Where a box crosses a row or column, a digit confined to the overlap affects both.',
    techniques: [
      {
        id: 'pointing', name: 'Locked Candidates: Pointing', level: 'Medium',
        summary: 'Inside a box, a number\'s candidates all sit on one row or column, so remove it from the rest of that line.',
        body: [
          'Look inside one box at a single digit. If all its candidates lie on the same row (or column), the box\'s copy of that digit must be on that line.',
          'That line can\'t have the digit anywhere else, so remove it from the line\'s cells outside the box. The candidates "point" along the line.',
        ],
      },
      {
        id: 'claiming', name: 'Locked Candidates: Claiming', level: 'Medium',
        summary: 'In a row or column, a number\'s candidates all sit in one box, so remove it from the rest of that box.',
        body: [
          'The mirror image of Pointing. Look along one row or column at a digit. If all its candidates fall inside a single box, the line "claims" that digit for the overlap.',
          'The box\'s copy of the digit must be on that line, so remove the digit from the box\'s other cells.',
        ],
      },
    ],
  },
  {
    id: 'naked-subsets', title: 'Naked Subsets',
    intro: 'N squares in a house that share only N candidates between them.',
    techniques: [
      {
        id: 'naked-pair', name: 'Naked Pair', level: 'Medium',
        summary: 'Two squares in a house that can only be the same two numbers: remove those numbers from the rest of the house.',
        body: [
          'If two cells in a house both contain exactly the same two candidates, say {4,7}, then one is 4 and the other is 7. You don\'t know which yet.',
          'Either way, no other cell in that house can be 4 or 7, so remove them.',
        ],
      },
      {
        id: 'naked-triple', name: 'Naked Triple', level: 'Medium',
        summary: 'Three squares in a house whose candidates, combined, are just three numbers.',
        body: [
          'Three cells in a house that together hold only three different candidates. Those three digits must fill those three cells, so they can go nowhere else in the house.',
          'Not every cell needs all three: {1,2}, {2,5} and {1,5} is a valid triple.',
        ],
      },
      {
        id: 'naked-quadruple', name: 'Naked Quadruple', level: 'Hard',
        summary: 'Four squares in a house whose candidates, combined, are just four numbers.',
        body: [
          'The same idea with four cells and four digits. Remove those four digits from every other cell in the house. They\'re rare and easy to miss.',
        ],
      },
      {
        id: 'locked-pair', name: 'Locked Pair', level: 'Medium',
        summary: 'A naked pair that sits in both a line and a box, so clear its numbers from both houses.',
        body: [
          'When a naked pair\'s two cells are in the same row (or column) <i>and</i> the same box, it works as a pair for both houses at once.',
          'Remove the two digits from the rest of the line and the rest of the box.',
        ],
      },
      {
        id: 'locked-triple', name: 'Locked Triple', level: 'Medium',
        summary: 'A naked triple inside one box and one line: clear its numbers from both.',
        body: ['A naked triple whose three cells also share a box and a line. Remove its three digits from the rest of both houses.'],
      },
    ],
  },
  {
    id: 'hidden-subsets', title: 'Hidden Subsets',
    intro: 'N numbers that can only go in the same N squares of a house.',
    techniques: [
      {
        id: 'hidden-pair', name: 'Hidden Pair', level: 'Medium',
        summary: 'Two numbers that can only go in the same two squares of a house: remove everything else from those squares.',
        body: [
          'In a house, if digits 2 and 6 each appear as candidates in only the same two cells, those cells must be the 2 and the 6.',
          'Any other candidates in those two cells are "junk" and can be removed. The pair was hidden among them.',
        ],
      },
      {
        id: 'hidden-triple', name: 'Hidden Triple', level: 'Hard',
        summary: 'Three numbers confined to the same three squares of a house: clear the other candidates from them.',
        body: ['If three digits can only go in the same three cells of a house, those cells are reserved for them. Remove every other candidate from the three cells.'],
      },
      {
        id: 'hidden-quadruple', name: 'Hidden Quadruple', level: 'Hard',
        summary: 'Four numbers confined to the same four squares of a house.',
        body: [
          'The same logic with four digits and four cells. Rare in practice.',
          'Any bigger hidden subset is the same as a smaller naked subset in the rest of the house, so you never need to look for one.',
        ],
      },
    ],
  },
  {
    id: 'basic-fish', title: 'Basic Fish',
    intro: 'One digit, N rows whose candidates line up in N columns (or the other way round).',
    techniques: [
      {
        id: 'x-wing', name: 'X-Wing', level: 'Hard',
        summary: 'Two rows where a number fits in only the same two columns: remove it from the rest of those columns.',
        body: [
          'Pick one digit. Find two rows where it has exactly two possible cells, and those cells line up in the same two columns. They form the corners of a rectangle.',
          'Each row needs its digit in one of its two corners, so the two digits sit on opposite corners. Either way, both columns are used up. Remove the digit from every other cell in those two columns.',
          'It works the same with columns as the starting lines and rows as the ones you clear.',
        ],
      },
      {
        id: 'swordfish', name: 'Swordfish', level: 'Hard',
        summary: 'Three rows where a number fits only within the same three columns: remove it from the rest of those columns.',
        body: [
          'The 3×3 version of the X-Wing. Find three rows where a digit\'s candidates all fall within the same three columns. Not every row needs a candidate in every column.',
          'The three rows\' digits must use up those three columns, so remove the digit from the rest of the columns.',
        ],
      },
      {
        id: 'jellyfish', name: 'Jellyfish', level: 'Extreme',
        summary: 'Four rows where a number fits only within the same four columns.',
        body: ['The 4×4 version: four rows confined to four columns for one digit. Clear that digit from the rest of the four columns. Bigger fish are always mirrored by a smaller hidden subset.'],
      },
    ],
  },
  {
    id: 'complex-fish', title: 'Complex Fish',
    intro: 'Fish that are almost complete except for an extra candidate or two, the "fin".',
    techniques: [
      {
        id: 'finned-x-wing', name: 'Finned X-Wing', level: 'Extreme',
        summary: 'An X-Wing with an extra candidate (fin) in one box: you can only clear cells that also see the fin.',
        body: [
          'An X-Wing that would work, except one row has an extra candidate or two (the <b>fin</b>), all inside one box.',
          'Either the X-Wing is real, or the fin holds the digit. A cell in the X-Wing\'s columns that is also in the fin\'s box loses the digit in both cases, so you can remove it there.',
        ],
      },
      {
        id: 'sashimi-x-wing', name: 'Sashimi X-Wing', level: 'Extreme',
        summary: 'A finned X-Wing where one corner is missing: the same "sees the fin" elimination still works.',
        body: ['Like a finned X-Wing, but one of the four corners isn\'t even a candidate. The fin makes up for it. Eliminate the digit only from cells that are in a cover column and see the fin.'],
      },
      {
        id: 'finned-swordfish', name: 'Finned / Sashimi Swordfish', level: 'Extreme',
        summary: 'A Swordfish with a fin: remove the number only from cover cells that also see the fin.',
        body: ['The same fin logic applied to a Swordfish (and, rarely, a Jellyfish). Either the fish holds or the fin is true. Only cells that would lose the digit in both cases can be cleared.'],
      },
    ],
  },
  {
    id: 'uniqueness', title: 'Uniqueness',
    intro: 'A proper puzzle has one solution, so patterns that would allow two can be ruled out.',
    techniques: [
      {
        id: 'ur-type-1', name: 'Unique Rectangle Type 1', level: 'Hard',
        summary: 'Three corners of a rectangle (across two boxes) are the same pair: the fourth corner can\'t be either of them.',
        body: [
          'Four cells forming a rectangle across exactly two rows, two columns and two boxes. If they ended up holding only {a,b}, you could swap the a\'s and b\'s and get a second valid solution.',
          'So if three corners are exactly {a,b}, the fourth must be something else. Remove a and b from it.',
        ],
      },
      {
        id: 'ur-type-2', name: 'Unique Rectangle Type 2', level: 'Hard',
        summary: 'Two corners are the pair and the other two are the pair plus the same extra number: that extra goes in one of them.',
        body: ['If the two "roof" corners both hold {a,b} plus the same extra digit x, one of them must be x to avoid the deadly pattern. Remove x from any cell that sees both roof corners.'],
      },
      {
        id: 'ur-type-4', name: 'Unique Rectangle Type 4', level: 'Extreme',
        summary: 'If the roof corners are the only places for one pair number in their house, the other pair number can be removed from both.',
        body: ['When the two roof cells are the only spots for digit a in a shared house, one of them is a. Then neither can be b, or the rectangle would be deadly. Remove b from both roof cells.'],
      },
      {
        id: 'ur-other', name: 'Other rectangle types', level: 'Extreme',
        summary: 'Types 3, 5 and 6, Hidden Rectangles and Avoidable Rectangles use the same no-two-solutions idea.',
        body: [
          '<b>Type 3</b>: the roof cells\' extra candidates form a naked subset with other cells in their house. <b>Type 5</b>: the same extra digit appears in three corners. <b>Type 6</b>: an X-Wing on one pair digit across the rectangle. <b>Hidden Rectangle</b>: strong links on one digit rule out the other.',
          '<b>Avoidable Rectangles</b> apply the idea to cells you have already solved (not givens): those values must not be able to swap either.',
        ],
      },
      {
        id: 'bug-plus-one', name: 'BUG+1', level: 'Hard',
        summary: 'Every unsolved square has two candidates except one: that square takes the number that appears three times in its houses.',
        body: [
          'A <b>Bivalue Universal Grave</b> is a position where every unsolved cell has exactly two candidates, and each candidate appears twice in every house. It always has multiple solutions, so it can\'t happen.',
          'If all cells are bivalue except one with three candidates, that cell must break the pattern. It takes the digit that appears three times in its row, column or box.',
        ],
      },
    ],
  },
  {
    id: 'wings', title: 'Wings',
    intro: 'Small groups of two- or three-candidate squares that force a number into one of two places.',
    techniques: [
      {
        id: 'xy-wing', name: 'XY-Wing', level: 'Hard',
        summary: 'A pivot {X,Y} sees pincers {X,Z} and {Y,Z}: one pincer must be Z, so clear Z from squares that see both.',
        body: [
          'Find a <b>pivot</b> cell with two candidates {X,Y}. It must see two <b>pincer</b> cells, {X,Z} and {Y,Z}.',
          'If the pivot is X, the first pincer becomes Z. If it\'s Y, the second pincer becomes Z. Either way one pincer is Z, so remove Z from any cell that sees both pincers.',
        ],
      },
      {
        id: 'xyz-wing', name: 'XYZ-Wing', level: 'Extreme',
        summary: 'A pivot {X,Y,Z} with pincers {X,Z} and {Y,Z}: Z goes in one of the three, so clear it from squares seeing all three.',
        body: ['Like an XY-Wing, but the pivot also holds Z. Whatever the pivot turns out to be, one of the three cells is Z. Remove Z from cells that see the pivot and both pincers (these are always in the pivot\'s box).'],
      },
      {
        id: 'w-wing', name: 'W-Wing', level: 'Extreme',
        summary: 'Two far-apart {A,B} squares joined by a strong link on A: one of them must be B.',
        body: [
          'Find two cells with the same two candidates {A,B} that don\'t see each other. Then find a house where A has only two places, one seeing each of the cells.',
          'One end of that link is A, which forces the cell it sees to be B. So one of the two {A,B} cells is B, and B can be removed from any cell that sees both.',
        ],
      },
    ],
  },
  {
    id: 'misc', title: 'Miscellaneous',
    intro: '',
    techniques: [
      {
        id: 'sue-de-coq', name: 'Sue de Coq', level: 'Insane',
        summary: 'Where a box and line cross, split the overlap\'s candidates between the box and the line to make eliminations in both.',
        body: [
          'Take the 2–3 cells where a box and a line overlap, plus some cells only in the line and some only in the box. Together they must hold exactly as many candidates as there are cells.',
          'Then the line-only cells\' digits can be removed from the rest of the line, and the box-only cells\' digits from the rest of the box. A digit used by neither group is locked into the overlap, so remove it from both houses.',
        ],
      },
    ],
  },
  {
    id: 'chains', title: 'Chains',
    intro: 'Linking candidates together so that one end or the other must be true.',
    techniques: [
      {
        id: 'links', name: 'Strong and weak links', level: 'Extreme',
        summary: 'Strong: if one is false the other is true. Weak: if one is true the other is false.',
        body: [
          'A <b>strong link</b> joins two candidates where at least one must be true: a digit with only two places in a house, or a cell with only two candidates.',
          'A <b>weak link</b> joins two candidates that can\'t both be true, such as the same digit in two cells that see each other.',
          'Chains alternate strong and weak links. If a chain starts and ends with strong links, at least one of its two ends is true.',
        ],
      },
      {
        id: 'remote-pair', name: 'Remote Pair', level: 'Extreme',
        summary: 'A chain of squares all holding the same two numbers: the ends alternate, so clear both numbers where ends of opposite parity meet.',
        body: ['A run of bivalue cells that all hold the same pair, each seeing the next. The values alternate along the chain. If the ends are an even number of steps apart, they hold different digits, so any cell seeing both ends can\'t hold either digit.'],
      },
      {
        id: 'x-chain', name: 'X-Chain', level: 'Extreme',
        summary: 'Follow one number through alternating strong and weak links: one end must be it, so clear it from squares that see both ends.',
        body: [
          'A single-digit chain. Strong links are houses where the digit has only two spots. Weak links are any two cells with the digit that see each other.',
          'Starting and ending on strong links, one of the two end cells must hold the digit. Remove it from cells that see both ends. Skyscrapers and 2-String Kites are short X-Chains.',
        ],
      },
      {
        id: 'xy-chain', name: 'XY-Chain', level: 'Extreme',
        summary: 'A chain of two-candidate squares: if the first isn\'t Z, the last is, so clear Z from squares that see both ends.',
        body: ['A chain made only of bivalue cells, each seeing the next and sharing a candidate with it. If the first cell isn\'t Z, the chain forces each next cell in turn until the last cell is Z. So one end is Z, and Z can be removed from cells that see both ends. An XY-Wing is a three-cell XY-Chain.'],
      },
      {
        id: 'aic', name: 'Alternating Inference Chains (AIC)', level: 'Insane',
        summary: 'Chains that mix digits and cells freely, including loops that make eliminations all along the way.',
        body: [
          'An AIC can switch digits inside a cell and travel through houses, as long as links alternate strong and weak. <b>Type 1</b>: both ends are the same digit, so clear it from cells seeing both. <b>Type 2</b>: different digits at the ends, which see each other, so clear the other digit from each end.',
          'A <b>Nice Loop</b> closes back on itself. Every weak link in a continuous loop becomes a place to eliminate. <b>Grouped links</b> treat several cells in a box-line overlap as one node.',
        ],
      },
    ],
  },
  {
    id: 'als', title: 'Almost Locked Sets',
    intro: 'N squares with N+1 candidates: lose any one candidate and the rest are locked.',
    techniques: [
      {
        id: 'als-xz', name: 'ALS-XZ', level: 'Insane',
        summary: 'Two almost-locked sets share a restricted digit X: a shared digit Z can be removed from squares seeing every Z in both.',
        body: [
          'An <b>ALS</b> is N cells in a house holding N+1 candidates. A single bivalue cell is the smallest one.',
          'If two ALSs share a digit X whose copies all see each other (a <b>restricted common</b>), X can only be in one of them, which locks the other. Any other shared digit Z must then be in one of the two sets. Remove Z from cells that see every Z in both sets.',
        ],
      },
      {
        id: 'als-xy-wing', name: 'ALS-XY-Wing and ALS Chains', level: 'Insane',
        summary: 'Three or more ALSs linked by restricted commons, working like an XY-Wing or chain.',
        body: ['A pivot ALS links to two pincer ALSs through different restricted digits. Then a digit shared by both pincers can be removed from cells seeing all its copies in them. Longer chains of ALSs work the same way.'],
      },
    ],
  },
  {
    id: 'last-resort', title: 'Last Resort',
    intro: 'When no pattern fits, test a candidate and follow the consequences.',
    techniques: [
      {
        id: 'forcing-chain', name: 'Forcing Chain', level: 'Insane',
        summary: 'Assume a candidate, follow the forced moves, and if they break the puzzle, that candidate is wrong.',
        body: [
          'Pick a candidate (ideally in a two-candidate square) and suppose it\'s true. Follow every single that it forces.',
          'If you reach a contradiction, such as a square with no candidates left or a house with nowhere for a digit, the assumption was wrong and you can remove it. In a two-candidate square that means the other number is the answer.',
        ],
      },
      {
        id: 'forcing-net', name: 'Forcing Net and Brute Force', level: 'Insane',
        summary: 'Forcing chains whose branches combine, and ultimately trial and error.',
        body: ['A <b>Forcing Net</b> lets branches of the consequences feed into each other, which is very hard to track by hand. <b>Brute force</b> (guess and backtrack) always works but teaches the least. Reach for it only when nothing else does.'],
      },
    ],
  },
];

const BY_ID = {};
for (const ch of CHAPTERS) for (const t of ch.techniques) BY_ID[t.id] = { ...t, chapter: ch.id };
// Solver technique ids that share a guide entry
const ALIASES = {
  'sashimi-swordfish': 'finned-swordfish', 'finned-jellyfish': 'finned-swordfish', 'sashimi-jellyfish': 'finned-swordfish',
};

export function technique(id) {
  return BY_ID[ALIASES[id] || id] || null;
}
