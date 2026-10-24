# Sudoku Together

A phone-friendly Sudoku you can play on your own or with up to seven other people.
It's a plain static website with no build step, no accounts and no server of its own.

## Features

- Puzzles generated in the browser, each with exactly one solution, and **rated by the strategies they need**:
  - Easy: singles only
  - Medium: pointing/claiming, naked or hidden pairs and triples
  - Hard: X-Wing, Swordfish, XY-Wing, Unique Rectangle and similar
  - Expert: wings, finned fish, chains or forcing chains

  The end-of-game summary lists the strategies the puzzle needed.
- **Two number rows**: the big bottom row enters numbers, and the small row above it (✎ Notes) adds pencil marks.
  - *Number first*: with no square selected, tap a number in either row to pick it up. It highlights everywhere.
    Every square you tap then gets that number (or note); tap a square again to take it back out.
    Tapping a filled square switches to its number. Tap the picked number again, or tap outside the board, to put it down.
  - *Square first*: select a square, then tap notes. The square stays selected so you can add several.
    Tapping a big number fills the square and leaves that number picked up for the next squares.
  - Placing a number clears that pencil mark from its row, column and box.
- **Highlighting**: tap a cell to highlight its row, column and box, and every cell with the same number.
- **Show mistakes** toggle: when it's on, wrong numbers turn red and are counted.
  Choose it per game. In solo you can also switch it on or off mid-game.
- **Strategy hints** (solo): instead of filling in a random square, 💡 Hint names the easiest technique that makes progress
  (Hidden Single, Pointing, Naked Pair, X-Wing, XY-Wing, Unique Rectangle, chains…) with a one-line reminder.
  *Show me* highlights the pattern, explains each step and crosses out the notes it removes. *Fill in* places the number.
- **Check** 🔍: marks wrong numbers, squares whose notes have lost the right answer, and notes that clash with a placed number.
  Available in every mode, including races with mistakes hidden.
- **Strategy guide** 📖 on the home screen and in-game: every technique from Singles to Forcing Chains, grouped by chapter,
  each with an example board diagram (real positions found by the solver, or hand-drawn for the techniques it doesn't detect).
- Undo and redo (a hint fill-in or note clean-up counts as one step), erase, a timer, and a count of how many of each number are left
- Your game is saved, so a refresh or closing the tab won't lose it
- Keyboard support on a computer: 1–9, arrow keys, Shift+1–9 for notes, Backspace, `Z` for undo, `Y` for redo

## Multiplayer (2–8 players)

One person taps **Host a multiplayer game** and reads out the 4‑letter code.
Everyone else taps **Join a game** and types it in. The host sees who has joined, picks the mode and taps Start.
Each player gets their own colour.

- **Race**: everyone gets the same puzzle on their own board and sees everyone's progress.
  When the first player finishes, the others are told and can keep going; the results list the full finishing order.
  The host's "Show mistakes" setting applies to every player.
- **Shared board**: one board everyone fills in together. Each player's numbers and selected square show in their colour.
  A correct number earns its value in points (placing a 7 = +7). A wrong number loses that many (−7) and doesn't stay on the board.
  When the board is full, the final leaderboard shows everyone's score.
  Every number has to be checked the moment it's placed to score it, so mistakes are always shown in this mode.

With more than two players, the player cards become one row you can scroll sideways, so the board stays full size.
Players can join or rejoin a game that's already under way, and anyone who leaves stays on the scoreboard marked "left".
When a game finishes, the host can start the next one without anyone reconnecting.
If someone's phone drops out (for example, the screen locks), they get a **Reconnect** button,
and a refreshed page shows **Rejoin game** on the home screen; they come back as the same player with the same score.

### How the phones connect

The phones talk directly over WebRTC, using [PeerJS](https://peerjs.com) (bundled in `vendor/`).
Every phone connects to the host's phone, which passes moves and progress on to everyone else,
so the host needs to keep the game open for the others to keep playing.
PeerJS's free public server is only used for the phones to find each other using the game code.
No sign-up is needed, but every phone needs internet access, which normal home Wi‑Fi has.

## Hosting it (one-time setup)

Both phones need to open the game from the same web address. The easiest option is **GitHub Pages**:

1. Merge this branch into `main`, or use the branch directly in step 3.
2. GitHub Pages is free for **public** repositories. This repo is currently **private**, so either
   make it public (Settings → General → Danger Zone → Change visibility), or use a paid GitHub plan.
3. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, pick `main` (or this branch) and `/ (root)`, then Save.
4. After a minute or so, the site is live at `https://re-kintsugi.github.io/Sudoku/`.
   Open it on both phones. "Add to Home Screen" makes it look like an app.

Any static host works too, for example dragging the folder onto [Netlify Drop](https://app.netlify.com/drop).

## Running it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

ES modules don't load from `file://` URLs, so serve the folder rather than opening `index.html` directly.

To test multiplayer on one computer without the internet, open `http://localhost:8000/?local` in two or more tabs.
That uses the browser's BroadcastChannel instead of WebRTC.

## Files

- `index.html`, `css/style.css`: layout and styling (light and dark mode)
- `js/sudoku.js`: puzzle generator and solver
- `js/solver.js`: human-style technique finder used for hints and difficulty ratings
- `js/generate.js`: generates puzzles until one matches the chosen difficulty
- `js/strategies.js`: strategy guide text
- `js/diagram.js`: draws the guide's example boards as SVG
- `js/examples.js`: example positions, generated by `node tools/build-examples.mjs`
- `js/diagrams-hand.js`: hand-made diagrams for the techniques the solver doesn't detect
- `js/net.js`: the multiplayer connection (PeerJS, or BroadcastChannel with `?local`)
- `js/app.js`: game logic and UI
