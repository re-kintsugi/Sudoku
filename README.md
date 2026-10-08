# Sudoku Together

A phone-friendly Sudoku you can play on your own or with one other person.
It's a plain static website with no build step, no accounts and no server of its own.

## Features

- Puzzles generated in the browser (Easy / Medium / Hard / Expert), each with exactly one solution
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
- **Strategy guide** 📖 on the home screen and in-game: every technique from Singles to Forcing Chains, grouped by chapter.
- Undo, erase, a timer, and a count of how many of each number are left
- Your game is saved, so a refresh or closing the tab won't lose it
- Keyboard support on a computer: 1–9, arrow keys, Shift+1–9 for notes, Backspace, `Z` for undo

## Two-player modes

One person taps **Host a 2‑player game** and reads out the 4‑letter code.
The other taps **Join a game** and types it in. The host picks the mode and taps Start.

- **Race**: you both get the same puzzle on your own boards and see each other's progress.
  The first to finish wins. The host's "Show mistakes" setting applies to both players.
- **Shared board**: one board you fill in together, and you see each other's numbers and selected cell live.
  A correct number earns its value in points (placing a 7 = +7). A wrong number loses that many (−7) and doesn't stay on the board.
  When the board is full, the higher score wins.
  Every number has to be checked the moment it's placed to score it, so mistakes are always shown in this mode.

When a game finishes, the host can start the next one without reconnecting.
If someone's phone drops out (for example, the screen locks), they get a **Reconnect** button.
A refreshed page shows **Rejoin game** on the home screen.

### How the phones connect

The phones talk to each other directly over WebRTC, using [PeerJS](https://peerjs.com) (bundled in `vendor/`).
PeerJS's free public server is only used for the two phones to find each other using the game code.
No sign-up is needed, but both phones need internet access, which normal home Wi‑Fi has.

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

To test multiplayer on one computer without the internet, open `http://localhost:8000/?local` in two tabs.
That uses the browser's BroadcastChannel instead of WebRTC.

## Files

- `index.html`, `css/style.css`: layout and styling (light and dark mode)
- `js/sudoku.js`: puzzle generator and solver
- `js/solver.js`: human-style technique finder used for hints
- `js/strategies.js`: strategy guide text
- `js/net.js`: the two-player connection (PeerJS, or BroadcastChannel with `?local`)
- `js/app.js`: game logic and UI
