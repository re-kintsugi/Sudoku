# Sudoku Together

A phone-friendly Sudoku you can play on your own or with one other person.
It's a plain static website with no build step, no accounts and no server of its own.

## Features

- Puzzles generated in the browser (Easy / Medium / Hard / Expert), each with exactly one solution
- **Notes** (pencil marks). Placing a number clears that pencil mark from its row, column and box
- **Highlighting**: tap a cell to highlight its row, column and box, and every cell with the same number.
  With no cell selected, tap a number on the pad to highlight that number on the board.
- **Show mistakes** toggle: when it's on, wrong numbers turn red and are counted.
  Choose it per game. In solo you can also switch it on or off mid-game.
- Undo, erase, a hint (solo only), a timer, and a count of how many of each number are left
- Your game is saved, so a refresh or closing the tab won't lose it
- Keyboard support on a computer: 1–9, arrow keys, Backspace, `N` for notes, `Z` for undo

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
- `js/net.js`: the two-player connection (PeerJS, or BroadcastChannel with `?local`)
- `js/app.js`: game logic and UI
