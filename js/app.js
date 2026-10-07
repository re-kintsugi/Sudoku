import { generate, ROW, COL, BOX, PEERS, DIFFICULTIES } from './sudoku.js';
import { Connection, randomCode, normalizeCode } from './net.js';

const $ = (id) => document.getElementById(id);

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const SOLO_KEY = 'sudoku-solo';
const MP_KEY = 'sudoku-mp';
const MP_MAX_AGE = 12 * 3600 * 1000;

const S = {
  name: store.get('sudoku-name', '') || '',
  role: null,          // null (solo) | 'host' | 'guest'
  conn: null,
  code: null,
  connected: false,
  oppName: 'Opponent',
  setupKind: 'solo',
  setup: Object.assign({ mode: 'race', difficulty: 'medium', check: true }, store.get('sudoku-setup', {})),
  game: null,
  sel: -1,
  hlDigit: 0,
  pick: null,          // number picked up from a pad: { d, mode: 'num' | 'note' }
  oppCursor: -1,
  screen: 'home',
  lastTick: 0,
  reconnectTries: 0,
  fullWarned: false,
};

// ---------------------------------------------------------------- helpers

function show(screen) {
  S.screen = screen;
  for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
  $('screen-' + screen).classList.remove('hidden');
  if (screen === 'home') refreshResume();
  updateBanner();
}

let toastTimer;
function toast(text, ms = 2200) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

function modal(title, bodyHtml, actions) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml;
  const box = $('modal-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = () => { closeModal(); a.onClick && a.onClick(); };
    box.appendChild(b);
  }
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : m;
  return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
}

function myName() { return S.name.trim() || 'Player'; }
function oppRole() { return S.role === 'host' ? 'guest' : 'host'; }
function isMulti() { return S.game && S.game.mode !== 'solo'; }

function send(msg) {
  if (S.conn) return S.conn.send(msg);
  return false;
}

// ---------------------------------------------------------------- game model

function makeGame({ mode, difficulty, check, puzzle, solution, id }) {
  if (!puzzle) ({ puzzle, solution } = generate(difficulty));
  return {
    id: id || Math.random().toString(36).slice(2, 10),
    mode, difficulty,
    check: mode === 'shared' ? true : !!check,
    puzzle, solution,
    values: puzzle.slice(),
    notes: new Array(81).fill(0),
    owner: new Array(81).fill(null),
    history: [],
    mistakes: 0,
    hints: 0,
    scores: { host: 0, guest: 0 },
    mistakesBy: { host: 0, guest: 0 },
    elapsed: 0,
    finished: false,
    finishTime: null,
    opp: { filled: 0, mistakes: 0, done: false, time: null },
    oppDoneSeen: false,
  };
}

// What the host shares with the guest.
function publicGame(g) {
  return {
    id: g.id, mode: g.mode, difficulty: g.difficulty, check: g.check,
    puzzle: g.puzzle, solution: g.solution,
    values: g.values, owner: g.owner, scores: g.scores, mistakesBy: g.mistakesBy,
    elapsed: g.elapsed, finished: g.mode === 'shared' ? g.finished : false,
  };
}

function emptyCount(g) { return g.puzzle.filter((v) => !v).length; }
function filledCount(g) { let n = 0; for (let i = 0; i < 81; i++) if (!g.puzzle[i] && g.values[i]) n++; return n; }

function isLocked(i) {
  const g = S.game;
  if (g.puzzle[i]) return true;
  if (g.mode === 'shared') return !!g.values[i];
  return g.check && g.values[i] && g.values[i] === g.solution[i];
}

function save() {
  const g = S.game;
  if (!g) return;
  if (g.mode === 'solo') {
    if (g.finished) store.del(SOLO_KEY);
    else store.set(SOLO_KEY, { game: g, savedAt: Date.now() });
  } else if (S.role && S.code) {
    store.set(MP_KEY, { role: S.role, code: S.code, oppName: S.oppName, game: g, savedAt: Date.now() });
  }
}

// ---------------------------------------------------------------- board UI

const cells = [];
function buildBoard() {
  const board = $('board');
  for (let i = 0; i < 81; i++) {
    const c = document.createElement('div');
    c.className = 'cell';
    if (COL[i] % 3 === 2 && COL[i] !== 8) c.classList.add('br');
    if (ROW[i] % 3 === 2 && ROW[i] !== 8) c.classList.add('bb');
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); selectCell(i); });
    board.appendChild(c);
    cells.push(c);
  }
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.className = 'num';
    b.innerHTML = `<b>${d}</b><small></small>`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); tapNumber(d, 'num'); });
    $('numpad').appendChild(b);

    // Notes buttons show the digit where it sits in a pencil-mark grid.
    const n = document.createElement('button');
    n.className = 'num note';
    n.innerHTML = `<b style="grid-row:${Math.floor((d - 1) / 3) + 1};grid-column:${(d - 1) % 3 + 1}">${d}</b>`;
    n.addEventListener('pointerdown', (e) => { e.preventDefault(); tapNumber(d, 'note'); });
    $('notepad').appendChild(n);
  }
}

function render() {
  const g = S.game;
  if (!g) return;
  const sel = S.sel;
  const hd = S.hlDigit;
  for (let i = 0; i < 81; i++) {
    const c = cells[i];
    const v = g.values[i];
    const cl = c.classList;
    cl.toggle('given', !!g.puzzle[i]);
    cl.toggle('sel', i === sel);
    cl.toggle('peer', sel >= 0 && i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]));
    cl.toggle('same', !!hd && v === hd && i !== sel);
    cl.toggle('wrong', g.mode !== 'shared' && g.check && !!v && !g.puzzle[i] && v !== g.solution[i]);
    cl.toggle('opp-owned', g.mode === 'shared' && !!g.owner[i] && g.owner[i] !== S.role);
    cl.toggle('opp-cursor', g.mode === 'shared' && S.oppCursor === i && S.connected);
    if (v) {
      if (c.dataset.v !== String(v)) { c.textContent = v; c.dataset.v = String(v); }
    } else {
      const n = g.notes[i];
      const key = 'n' + n + ':' + hd;
      if (c.dataset.v !== key) {
        c.dataset.v = key;
        if (!n) c.textContent = '';
        else {
          let h = '<div class="notes">';
          for (let d = 1; d <= 9; d++) {
            const on = n & (1 << d);
            h += `<span class="${on && d === hd ? 'hl' : ''}">${on ? d : ''}</span>`;
          }
          c.innerHTML = h + '</div>';
        }
      }
    }
  }
  // number pad
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) if (g.values[i] && (!g.check || g.values[i] === g.solution[i])) counts[g.values[i]]++;
  const pk = S.pick;
  $('numpad').querySelectorAll('.num').forEach((b, k) => {
    const d = k + 1;
    const left = 9 - counts[d];
    b.classList.toggle('done', left <= 0);
    b.classList.toggle('hl', d === hd && !pk);
    b.classList.toggle('armed', !!pk && pk.mode === 'num' && pk.d === d);
    b.querySelector('small').textContent = left > 0 ? left : '';
  });
  $('notepad').querySelectorAll('.num').forEach((b, k) => {
    const d = k + 1;
    b.classList.toggle('done', 9 - counts[d] <= 0);
    b.classList.toggle('armed', !!pk && pk.mode === 'note' && pk.d === d);
  });
  // tools
  $('check-state').textContent = g.check ? 'on' : 'off';
  $('tool-check').classList.toggle('on', g.check);
  $('tool-check').disabled = g.mode !== 'solo';
  $('tool-check').classList.toggle('hidden', g.mode === 'shared');
  $('tool-hint').classList.toggle('hidden', g.mode !== 'solo');
  $('tool-undo').disabled = !g.history.length || g.finished;
  document.querySelector('.tools').style.gridTemplateColumns =
    `repeat(${document.querySelectorAll('.tools .tool:not(.hidden)').length}, 1fr)`;
  renderScorebar();
  renderTitle();
}

function renderTitle() {
  const g = S.game;
  const diff = DIFFICULTIES[g.difficulty].label;
  const m = g.mode === 'solo' ? '' : g.mode === 'race' ? 'Race · ' : 'Shared · ';
  $('game-title').textContent = m + diff;
  $('timer').textContent = fmtTime(g.finished && g.finishTime != null ? g.finishTime : g.elapsed);
}

function pcard({ name, value, sub, pct, opp, offline, id }) {
  return `<div class="pcard ${opp ? 'opp' : ''} ${offline ? 'offline' : ''}" id="${id}">
    <div class="pname">${esc(name)}</div>
    <div class="pval"><span>${value}</span><small>${sub}</small></div>
    ${pct != null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
  </div>`;
}

function renderScorebar() {
  const g = S.game;
  const bar = $('scorebar');
  let html = '';
  if (g.mode === 'solo') {
    html = pcard({ id: 'pc-me', name: 'Mistakes', value: g.mistakes, sub: g.hints ? `${g.hints} hint${g.hints > 1 ? 's' : ''}` : (g.check ? '' : 'checking off') });
  } else if (g.mode === 'race') {
    const total = emptyCount(g);
    const mine = filledCount(g);
    const op = g.opp;
    html = pcard({ id: 'pc-me', name: myName() + ' (you)', value: Math.round((mine / total) * 100) + '%', sub: g.finished ? 'Done ' + fmtTime(g.finishTime) : `${g.mistakes} mistake${g.mistakes === 1 ? '' : 's'}`, pct: (mine / total) * 100 })
      + pcard({ id: 'pc-opp', opp: true, offline: !S.connected, name: S.oppName + (S.connected ? '' : ' · offline'), value: Math.round((op.filled / total) * 100) + '%', sub: op.done ? 'Done ' + fmtTime(op.time) : `${op.mistakes} mistake${op.mistakes === 1 ? '' : 's'}`, pct: (op.filled / total) * 100 });
  } else {
    const me = S.role, op = oppRole();
    html = pcard({ id: 'pc-me', name: myName() + ' (you)', value: g.scores[me], sub: `${g.mistakesBy[me]} mistake${g.mistakesBy[me] === 1 ? '' : 's'}` })
      + pcard({ id: 'pc-opp', opp: true, offline: !S.connected, name: S.oppName + (S.connected ? '' : ' · offline'), value: g.scores[op], sub: `${g.mistakesBy[op]} mistake${g.mistakesBy[op] === 1 ? '' : 's'}` });
  }
  if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
}

function showDelta(role, amount) {
  const card = $(role === S.role ? 'pc-me' : 'pc-opp');
  if (!card) return;
  const el = document.createElement('span');
  el.className = 'delta ' + (amount >= 0 ? 'plus' : 'minus');
  el.textContent = (amount >= 0 ? '+' : '−') + Math.abs(amount);
  card.querySelector('.pval small').replaceWith(el);
  // the next scorebar render puts the normal text back
  setTimeout(() => { $('scorebar').dataset.html = ''; renderScorebar(); }, 1200);
}

function flash(i, kind, ghost) {
  const c = cells[i];
  c.classList.remove('flash-bad', 'flash-good');
  void c.offsetWidth;
  c.classList.add(kind === 'bad' ? 'flash-bad' : 'flash-good');
  if (ghost) {
    c.dataset.v = '';
    c.innerHTML = `<span class="ghost">${ghost}</span>`;
    setTimeout(() => { c.dataset.v = ''; render(); }, 900);
  }
  setTimeout(() => c.classList.remove('flash-bad', 'flash-good'), 900);
}

// ---------------------------------------------------------------- input

function selectCell(i) {
  const g = S.game;
  if (!g) return;
  const pk = S.pick;
  if (pk && !g.finished) {
    if (isLocked(i)) {
      // Tapping a filled square switches the picked-up number to that one.
      pk.d = g.values[i];
      S.hlDigit = pk.d;
      render();
      return;
    }
    if (pk.mode === 'note') {
      if (g.values[i]) return;
      toggleNote(i, pk.d);
      afterChange();
    } else {
      enterNumber(i, pk.d);
    }
    return;
  }
  S.sel = i;
  S.hlDigit = g.values[i] || 0;
  if (g.mode === 'shared') send({ t: 'cursor', i });
  render();
}

function toggleNote(i, d) {
  const g = S.game;
  g.history.push({ i, v: 0, n: g.notes[i] });
  g.notes[i] ^= 1 << d;
}

// mode: 'num' (big bottom row) or 'note' (pencil-mark row)
function tapNumber(d, mode) {
  const g = S.game;
  if (!g || g.finished) return;
  const i = S.sel;

  if (i >= 0 && !isLocked(i)) {
    if (mode === 'note') {
      // The square stays selected so several notes can go in.
      if (g.values[i]) return;
      toggleNote(i, d);
      S.hlDigit = d;
      afterChange();
      return;
    }
    // The square is done; keep the number picked up for other squares.
    enterNumber(i, d);
    S.sel = -1;
    S.pick = { d, mode };
    S.hlDigit = d;
    if (g.mode === 'shared') send({ t: 'cursor', i: -1 });
    render();
    return;
  }

  // Nothing to fill: pick the number up, or put it down if it's already picked.
  if (S.pick && S.pick.d === d && S.pick.mode === mode) {
    S.pick = null;
    S.hlDigit = 0;
  } else {
    S.pick = { d, mode };
    S.hlDigit = d;
    S.sel = -1;
    if (g.mode === 'shared') send({ t: 'cursor', i: -1 });
  }
  render();
}

function enterNumber(i, d) {
  const g = S.game;
  if (g.mode === 'shared') {
    if (S.role === 'host') hostPlace(i, d, 'host');
    else if (!send({ t: 'place', i, d })) toast('Not connected to ' + S.oppName);
    render();
    return;
  }

  // solo / race: entering the same number again clears it
  const entry = { i, v: g.values[i], n: g.notes[i], peers: [], placed: d };
  if (g.values[i] === d) {
    g.values[i] = 0;
  } else {
    g.values[i] = d;
    g.notes[i] = 0;
    const wrong = d !== g.solution[i];
    if (g.check && wrong) { g.mistakes++; flash(i, 'bad'); }
    // A placed number clears that pencil mark from its row, column and box.
    if (!g.check || !wrong) {
      for (const p of PEERS[i]) {
        if (g.notes[p] & (1 << d)) { entry.peers.push(p); g.notes[p] &= ~(1 << d); }
      }
    }
  }
  g.history.push(entry);
  afterChange();
  checkSoloComplete();
}

function undo() {
  const g = S.game;
  if (!g || g.finished) return;
  const h = g.history.pop();
  if (!h) return;
  if (g.mode === 'shared' && g.values[h.i]) { render(); return; }
  g.values[h.i] = h.v;
  g.notes[h.i] = h.n;
  // put back the pencil marks that placing the number cleared
  if (h.peers) for (const p of h.peers) g.notes[p] |= 1 << h.placed;
  if (!S.pick) {
    S.sel = h.i;
    S.hlDigit = g.values[h.i] || 0;
  }
  afterChange();
}

function erase() {
  const g = S.game;
  if (!g || g.finished) return;
  if (S.sel < 0) { toast('Select a square to erase'); return; }
  const i = S.sel;
  if (g.values[i] && !isLocked(i)) {
    g.history.push({ i, v: g.values[i], n: g.notes[i] });
    g.values[i] = 0;
    S.hlDigit = 0;
  } else if (!g.values[i] && g.notes[i]) {
    g.history.push({ i, v: 0, n: g.notes[i] });
    g.notes[i] = 0;
  } else return;
  afterChange();
}

function hint() {
  const g = S.game;
  if (!g || g.finished || g.mode !== 'solo') return;
  let i = S.sel;
  if (i < 0 || isLocked(i) || g.values[i] === g.solution[i]) {
    const empties = [];
    for (let k = 0; k < 81; k++) if (g.values[k] !== g.solution[k]) empties.push(k);
    if (!empties.length) return;
    i = empties[Math.floor(Math.random() * empties.length)];
  }
  const d = g.solution[i];
  const entry = { i, v: g.values[i], n: g.notes[i], peers: [], placed: d };
  g.values[i] = d;
  g.notes[i] = 0;
  for (const p of PEERS[i]) if (g.notes[p] & (1 << d)) { entry.peers.push(p); g.notes[p] &= ~(1 << d); }
  g.history.push(entry);
  g.hints++;
  S.pick = null;
  S.sel = i;
  S.hlDigit = d;
  flash(i, 'good');
  afterChange();
  checkSoloComplete();
}

function afterChange() {
  render();
  save();
  if (S.game.mode === 'race') sendProgress();
}

function moveSel(dr, dc) {
  if (S.sel < 0) { selectCell(40); return; }
  const r = (ROW[S.sel] + dr + 9) % 9, c = (COL[S.sel] + dc + 9) % 9;
  selectCell(r * 9 + c);
}

document.addEventListener('keydown', (e) => {
  if (S.screen !== 'game' || !S.game || e.target.tagName === 'INPUT') return;
  const digit = /^Digit[1-9]$/.test(e.code) ? +e.code.slice(5) : (e.key >= '1' && e.key <= '9' ? +e.key : 0);
  if (digit) tapNumber(digit, e.shiftKey ? 'note' : 'num');
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
  else if (e.key === 'ArrowUp') moveSel(-1, 0);
  else if (e.key === 'ArrowDown') moveSel(1, 0);
  else if (e.key === 'ArrowLeft') moveSel(0, -1);
  else if (e.key === 'ArrowRight') moveSel(0, 1);
  else if (e.key === 'z' || e.key === 'u') undo();
  else return;
  e.preventDefault();
});

// ---------------------------------------------------------------- completion

function checkSoloComplete() {
  const g = S.game;
  if (g.finished) return;
  const full = g.values.every((v) => v);
  if (!full) { S.fullWarned = false; return; }
  const solved = g.values.every((v, i) => v === g.solution[i]);
  if (!solved) {
    if (!S.fullWarned) toast('The board is full, but something isn’t right yet.', 3000);
    S.fullWarned = true;
    return;
  }
  g.finished = true;
  g.finishTime = g.elapsed;
  S.sel = -1; S.hlDigit = 0; S.pick = null;
  render();
  save();
  if (g.mode === 'solo') {
    modal('Solved! 🎉', `<p>${DIFFICULTIES[g.difficulty].label} puzzle in <b>${fmtTime(g.finishTime)}</b>.</p>
      <p>${g.mistakes} mistake${g.mistakes === 1 ? '' : 's'}${g.hints ? `, ${g.hints} hint${g.hints > 1 ? 's' : ''}` : ''}.</p>`,
      [{ label: 'New game', cls: 'primary', onClick: () => openSetup('solo') }, { label: 'Menu', onClick: () => show('home') }]);
  } else {
    sendProgress();
    showRaceResult();
  }
}

function showRaceResult() {
  const g = S.game;
  const op = g.opp;
  let title, body;
  if (op.done && op.time < g.finishTime) {
    title = `${S.oppName} wins`;
    body = `<p>You finished too — ${fmtTime(g.finishTime - op.time)} behind.</p>`;
  } else {
    title = 'You win! 🏆';
    body = op.done ? `<p>${esc(S.oppName)} also finished, ${fmtTime(op.time - g.finishTime)} behind.</p>` : `<p>You finished first.</p>`;
  }
  body += resultRows([
    { name: myName(), val: fmtTime(g.finishTime) + ` · ${g.mistakes} ✗`, win: !(op.done && op.time < g.finishTime) },
    { name: S.oppName, val: op.done ? fmtTime(op.time) + ` · ${op.mistakes} ✗` : 'still playing', win: op.done && op.time < g.finishTime },
  ]);
  endModal(title, body);
}

function resultRows(rows) {
  return rows.map((r) => `<div class="result-row ${r.win ? 'win' : ''}"><span>${esc(r.name)}</span><b>${r.val}</b></div>`).join('');
}

function endModal(title, body) {
  const actions = [];
  if (S.role === 'host') {
    actions.push({ label: 'New game', cls: 'primary', onClick: () => backToLobby() });
  } else {
    body += `<p style="margin-top:10px">${esc(S.oppName)} can start the next game.</p>`;
  }
  actions.push({ label: 'Look at board', onClick: () => {} });
  actions.push({ label: 'Leave', cls: 'link', onClick: () => leaveMultiplayer() });
  modal(title, body, actions);
}

function finishShared() {
  const g = S.game;
  if (g.finished) return;
  g.finished = true;
  g.finishTime = g.elapsed;
  S.sel = -1; S.hlDigit = 0; S.pick = null;
  render();
  save();
  const me = g.scores[S.role], op = g.scores[oppRole()];
  const title = me > op ? 'You win! 🏆' : me < op ? `${S.oppName} wins` : "It's a tie!";
  const body = `<p>Board complete in ${fmtTime(g.finishTime)}.</p>` + resultRows([
    { name: myName(), val: `${me} pts · ${g.mistakesBy[S.role]} ✗`, win: me > op },
    { name: S.oppName, val: `${op} pts · ${g.mistakesBy[oppRole()]} ✗`, win: op > me },
  ]);
  endModal(title, body);
}

// ---------------------------------------------------------------- shared board (host is the referee)

function hostPlace(i, d, by) {
  const g = S.game;
  if (!g || g.mode !== 'shared') return;
  if (g.finished || g.values[i] || d < 1 || d > 9) {
    send({ t: 'cell', i, d: g.values[i], by: g.owner[i], correct: !!g.values[i], stale: true, scores: g.scores, mistakesBy: g.mistakesBy });
    return;
  }
  const correct = g.solution[i] === d;
  if (correct) { g.values[i] = d; g.owner[i] = by; g.scores[by] += d; }
  else { g.scores[by] -= d; g.mistakesBy[by]++; }
  const msg = { t: 'cell', i, d, by, correct, scores: g.scores, mistakesBy: g.mistakesBy };
  send(msg);
  applyCell(msg);
}

function applyCell(msg) {
  const g = S.game;
  if (!g || g.mode !== 'shared') return;
  const { i, d, by, correct } = msg;
  g.scores = { ...msg.scores };
  g.mistakesBy = { ...msg.mistakesBy };
  if (msg.stale) {
    if (msg.d) { g.values[i] = msg.d; g.owner[i] = msg.by; }
    render();
    return;
  }
  if (correct) {
    g.values[i] = d;
    g.owner[i] = by;
    g.notes[i] = 0;
    for (const p of PEERS[i]) g.notes[p] &= ~(1 << d);
    if (S.sel === i) S.hlDigit = d;
  }
  render();
  showDelta(by, correct ? d : -d);
  flash(i, correct ? 'good' : 'bad', correct ? null : d);
  if (!correct && by !== S.role) toast(`${S.oppName} tried a wrong ${d}: −${d}`);
  save();
  if (g.values.every((v) => v)) finishShared();
}

// ---------------------------------------------------------------- race progress

function sendProgress() {
  const g = S.game;
  if (!g || g.mode !== 'race') return;
  send({ t: 'progress', id: g.id, filled: filledCount(g), mistakes: g.mistakes, done: g.finished, time: g.finishTime });
}

function onOppProgress(msg) {
  const g = S.game;
  if (!g || g.mode !== 'race' || msg.id !== g.id) return;
  g.opp = { filled: msg.filled, mistakes: msg.mistakes, done: msg.done, time: msg.time };
  render();
  save();
  if (msg.done && !g.oppDoneSeen) {
    g.oppDoneSeen = true;
    save();
    if (!g.finished) {
      modal(`${S.oppName} finished!`, `<p>${esc(S.oppName)} solved it in <b>${fmtTime(msg.time)}</b>.</p><p>Keep going to finish your board, or call it here.</p>`,
        [{ label: 'Keep playing', cls: 'primary' },
          ...(S.role === 'host' ? [{ label: 'New game', onClick: () => backToLobby() }] : []),
          { label: 'Leave', cls: 'link', onClick: () => leaveMultiplayer() }]);
    } else {
      showRaceResult();
    }
  }
}

// ---------------------------------------------------------------- timer

function tick() {
  const now = Date.now();
  const dt = now - (S.lastTick || now);
  S.lastTick = now;
  const g = S.game;
  if (!g || g.finished || S.screen !== 'game') return;
  // Solo pauses while the app is in the background; multiplayer keeps running.
  if (g.mode === 'solo' && document.hidden) return;
  if (g.mode === 'shared' && S.role === 'guest' && !S.connected) return;
  g.elapsed += Math.min(dt, g.mode === 'solo' ? 5000 : dt);
  renderTitle();
  if (Math.floor(g.elapsed / 5000) !== Math.floor((g.elapsed - dt) / 5000)) save();
}
setInterval(tick, 500);

// ---------------------------------------------------------------- starting games

function startGame(game) {
  S.game = game;
  S.sel = -1;
  S.hlDigit = 0;
  S.pick = null;
  S.oppCursor = -1;
  S.fullWarned = false;
  S.lastTick = Date.now();
  closeModal();
  for (const c of cells) c.dataset.v = '';
  $('scorebar').dataset.html = '';
  show('game');
  render();
  save();
  requestWakeLock();
}

function openSetup(kind) {
  S.setupKind = kind;
  const host = kind === 'host';
  $('setup-title').textContent = host ? 'Host a game' : 'New solo game';
  $('host-code-box').classList.toggle('hidden', !host);
  $('mode-group').classList.toggle('hidden', !host);
  syncSetupUI();
  show('setup');
  if (host) {
    if (!S.conn || S.role !== 'host') startHost(null);
    else updateHostStatus();
  }
}

function syncSetupUI() {
  const st = S.setup;
  for (const b of $('mode-choice').children) b.classList.toggle('selected', b.dataset.value === st.mode);
  for (const b of $('difficulty-choice').children) b.classList.toggle('selected', b.dataset.value === st.difficulty);
  const shared = S.setupKind === 'host' && st.mode === 'shared';
  $('mistake-toggle').checked = shared ? true : st.check;
  $('mistake-toggle').disabled = shared;
  $('mistake-help').textContent = shared
    ? 'Always on for shared board — every number is scored the moment it’s placed.'
    : S.setupKind === 'host' ? 'Applies to both players. Wrong numbers turn red straight away.' : 'Wrong numbers turn red straight away. You can switch this during the game.';
  const btn = $('btn-start');
  if (S.setupKind === 'host') {
    btn.disabled = !S.connected;
    btn.textContent = S.connected ? 'Start game' : 'Waiting for player…';
  } else {
    btn.disabled = false;
    btn.textContent = 'Start';
  }
  store.set('sudoku-setup', st);
}

function onStartPressed() {
  const st = S.setup;
  if (S.setupKind === 'solo') {
    disconnect();
    S.role = null;
    startGame(makeGame({ mode: 'solo', difficulty: st.difficulty, check: st.check }));
    return;
  }
  if (!S.connected) return;
  const game = makeGame({ mode: st.mode, difficulty: st.difficulty, check: st.check });
  startGame(game);
  send({ t: 'start', game: publicGame(game) });
}

// ---------------------------------------------------------------- multiplayer session

function connHandlers() {
  return { onMessage, onStatus };
}

function startHost(code, resume = false) {
  disconnect();
  S.role = 'host';
  S.code = code || randomCode();
  S.connected = false;
  $('host-code').textContent = S.code;
  setHostStatus('Connecting…');
  S.conn = new Connection('host', {
    onMessage,
    onStatus: (status, detail) => {
      if (status === 'error' && detail === 'code-taken') {
        if (resume) { toast('Could not reclaim the old game code — starting a fresh one.'); startHost(null); }
        else startHost(null);
        return;
      }
      onStatus(status, detail);
    },
  });
  S.conn.start(S.code);
}

function startGuest(code) {
  disconnect();
  S.role = 'guest';
  S.code = code;
  S.connected = false;
  S.reconnectTries = 0;
  S.conn = new Connection('guest', connHandlers());
  S.conn.start(code);
}

function disconnect() {
  if (S.conn) { S.conn.close(); S.conn = null; }
  S.connected = false;
  clearTimeout(S.reconnectTimer);
}

function setHostStatus(text, cls = '') {
  const el = $('host-status');
  el.textContent = text;
  el.className = 'status ' + cls;
}
function setJoinStatus(text, cls = '') {
  const el = $('join-status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

function updateHostStatus() {
  if (S.connected) setHostStatus(`${S.oppName} has joined! Pick a mode and start.`, 'ok');
  else setHostStatus('Waiting for the other player to join with this code…');
  syncSetupUI();
}

function onStatus(status, detail) {
  if (status === 'waiting') {
    if (S.role === 'host') updateHostStatus();
  } else if (status === 'connected') {
    S.connected = true;
    S.reconnectTries = 0;
    if (S.role === 'guest') send({ t: 'hello', name: myName(), gameId: S.game && S.game.id });
  } else if (status === 'disconnected') {
    S.connected = false;
    if (S.role === 'host') updateHostStatus();
    if (S.role === 'guest') {
      setJoinStatus('Connection lost. Trying to reconnect…');
      scheduleReconnect();
    }
    if (S.game) render();
  } else if (status === 'error') {
    if (S.role === 'host') setHostStatus(detail, 'err');
    else {
      setJoinStatus(detail, 'err');
      $('btn-join').disabled = false;
      if (S.screen === 'game') scheduleReconnect();
    }
  }
  updateBanner();
}

function scheduleReconnect() {
  clearTimeout(S.reconnectTimer);
  if (S.role !== 'guest' || !S.conn || S.reconnectTries > 20) return;
  S.reconnectTimer = setTimeout(() => {
    if (S.connected || !S.conn) return;
    S.reconnectTries++;
    S.conn.reconnect();
  }, Math.min(2000 + S.reconnectTries * 1000, 8000));
}

function updateBanner() {
  const inSession = S.role && S.conn && (S.screen === 'game' || (S.screen === 'join' && S.game));
  const show = inSession && !S.connected;
  $('conn-banner').classList.toggle('hidden', !show);
  if (show) {
    $('conn-text').textContent = S.role === 'host' ? `${S.oppName} disconnected — waiting for them` : `Lost connection to ${S.oppName}`;
    $('btn-reconnect').classList.toggle('hidden', S.role === 'host');
  }
}

function onMessage(msg) {
  if (!msg || !msg.t) return;
  const g = S.game;
  switch (msg.t) {
    case 'hello': // host <- guest
      S.oppName = (msg.name || 'Guest').slice(0, 16);
      send({ t: 'welcome', name: myName() });
      if (g && g.mode !== 'solo' && !(g.mode === 'race' && g.finished && g.opp.done)) {
        send({ t: 'sync', game: publicGame(g) });
        if (g.mode === 'race') sendProgress();
        toast(`${S.oppName} is connected`);
      }
      updateHostStatus();
      if (g) render();
      break;
    case 'welcome': // guest <- host
      S.oppName = (msg.name || 'Host').slice(0, 16);
      if (S.screen === 'join' || !S.game) showGuestWaiting();
      else toast(`Connected to ${S.oppName}`);
      if (g) render();
      break;
    case 'start':
      onGameFromHost(msg.game, true);
      break;
    case 'sync':
      onGameFromHost(msg.game, false);
      break;
    case 'lobby':
      if (S.role === 'guest') {
        closeModal();
        S.game = null;
        store.del(MP_KEY);
        show('join');
        showGuestWaiting();
        toast(`${S.oppName} is setting up a new game`);
      }
      break;
    case 'progress':
      onOppProgress(msg);
      break;
    case 'place':
      if (S.role === 'host') hostPlace(msg.i, msg.d, 'guest');
      break;
    case 'cell':
      if (S.role === 'guest') applyCell(msg);
      break;
    case 'cursor':
      S.oppCursor = msg.i;
      if (g) render();
      break;
    case 'name':
      S.oppName = (msg.name || S.oppName).slice(0, 16);
      if (g) render();
      break;
    case 'leave':
      store.del(MP_KEY);
      disconnect();
      modal(`${S.oppName} left`, `<p>${esc(S.oppName)} has left the game.</p>`, [{ label: 'Menu', cls: 'primary', onClick: () => { S.role = null; S.game = null; show('home'); } }]);
      updateBanner();
      break;
  }
}

function onGameFromHost(pg, fresh) {
  const local = S.game;
  let g;
  if (!fresh && local && local.id === pg.id) {
    g = local; // keep our own board (race) and our notes
  } else {
    g = makeGame({ ...pg });
  }
  if (pg.mode === 'shared') {
    g.values = pg.values.slice();
    g.owner = pg.owner.slice();
    g.scores = { ...pg.scores };
    g.mistakesBy = { ...pg.mistakesBy };
    g.finished = pg.finished;
    for (let i = 0; i < 81; i++) if (g.values[i]) g.notes[i] = 0;
    if (fresh || !local || local.id !== pg.id) g.elapsed = pg.elapsed || 0;
  }
  if (g === local) {
    S.connected && sendProgress();
    render();
    save();
    return;
  }
  startGame(g);
  sendProgress();
}

function showGuestWaiting() {
  show('join');
  $('join-code').value = S.code || '';
  $('join-code').disabled = true;
  $('btn-join').classList.add('hidden');
  setJoinStatus(`Connected to ${S.oppName}! Waiting for them to start the game…`, 'ok');
}

function resetJoinScreen() {
  $('join-code').disabled = false;
  $('btn-join').classList.remove('hidden');
  $('btn-join').disabled = false;
  setJoinStatus('');
}

function backToLobby() {
  send({ t: 'lobby' });
  S.game = null;
  store.del(MP_KEY);
  openSetup('host');
}

function leaveMultiplayer() {
  send({ t: 'leave' });
  store.del(MP_KEY);
  setTimeout(disconnect, 200);
  S.game = null;
  S.role = null;
  show('home');
}

// ---------------------------------------------------------------- wake lock (keeps phones awake mid-game)

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !document.hidden && S.screen === 'game') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); return; }
  S.lastTick = Date.now();
  requestWakeLock();
  if (S.conn && !S.connected && S.role === 'guest') { S.reconnectTries = 0; S.conn.reconnect(); }
  if (S.conn && S.role === 'host') S.conn.reconnect();
});
window.addEventListener('pagehide', save);

// ---------------------------------------------------------------- home / resume

function refreshResume() {
  const box = $('resume-box');
  const mp = store.get(MP_KEY);
  const solo = store.get(SOLO_KEY);
  if (mp && Date.now() - mp.savedAt < MP_MAX_AGE && mp.game && !(mp.game.finished)) {
    box.classList.remove('hidden');
    $('btn-resume').textContent = `Rejoin game with ${mp.oppName} (code ${mp.code})`;
    $('btn-resume').onclick = () => resumeMultiplayer(mp);
    $('btn-discard').onclick = () => { store.del(MP_KEY); refreshResume(); };
  } else if (solo && solo.game && !solo.game.finished) {
    box.classList.remove('hidden');
    $('btn-resume').textContent = `Continue solo game (${DIFFICULTIES[solo.game.difficulty].label}, ${fmtTime(solo.game.elapsed)})`;
    $('btn-resume').onclick = () => { disconnect(); S.role = null; startGame(solo.game); };
    $('btn-discard').onclick = () => { store.del(SOLO_KEY); refreshResume(); };
  } else {
    box.classList.add('hidden');
  }
}

function resumeMultiplayer(mp) {
  S.oppName = mp.oppName || 'Opponent';
  if (mp.role === 'host') {
    startHost(mp.code, true);
  } else {
    startGuest(mp.code);
  }
  startGame(mp.game);
  updateBanner();
}

// ---------------------------------------------------------------- wiring

function wire() {
  const nameInput = $('name-input');
  nameInput.value = S.name;
  nameInput.addEventListener('input', () => {
    S.name = nameInput.value.slice(0, 16);
    store.set('sudoku-name', S.name);
    send({ t: 'name', name: myName() });
  });

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const go = b.dataset.go;
    if (go === 'solo') openSetup('solo');
    else if (go === 'host') openSetup('host');
    else if (go === 'join') {
      disconnect(); S.role = null; S.game = null;
      resetJoinScreen();
      show('join');
      $('join-code').value = '';
      setTimeout(() => $('join-code').focus(), 50);
    }
  }));

  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
    if (S.role) { if (S.connected) send({ t: 'leave' }); setTimeout(disconnect, 150); }
    S.role = null;
    S.game = null;
    store.del(MP_KEY);
    show('home');
  }));

  for (const b of $('mode-choice').children) b.addEventListener('click', () => { S.setup.mode = b.dataset.value; syncSetupUI(); });
  for (const b of $('difficulty-choice').children) b.addEventListener('click', () => { S.setup.difficulty = b.dataset.value; syncSetupUI(); });
  $('mistake-toggle').addEventListener('change', (e) => { S.setup.check = e.target.checked; syncSetupUI(); });
  $('btn-start').addEventListener('click', onStartPressed);

  const codeInput = $('join-code');
  codeInput.addEventListener('input', () => { codeInput.value = normalizeCode(codeInput.value); });
  const doJoin = () => {
    const code = normalizeCode(codeInput.value);
    if (code.length !== 4) { setJoinStatus('Enter the 4-letter code shown on the host’s screen.', 'err'); return; }
    $('btn-join').disabled = true;
    setJoinStatus('Connecting…');
    startGuest(code);
  };
  $('btn-join').addEventListener('click', doJoin);
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

  $('tool-undo').addEventListener('click', undo);
  $('tool-erase').addEventListener('click', erase);
  $('tool-hint').addEventListener('click', hint);
  $('tool-check').addEventListener('click', () => {
    const g = S.game;
    if (!g || g.mode !== 'solo') return;
    g.check = !g.check;
    toast(g.check ? 'Mistakes will be shown' : 'Mistakes hidden');
    render(); save();
  });

  $('btn-leave').addEventListener('click', () => {
    const g = S.game;
    if (!g || g.mode === 'solo') { show('home'); return; }
    if (S.role === 'host') {
      modal('Leave this game?', '<p>You can start a new game with the same player, or leave altogether.</p>', [
        { label: 'New game', cls: 'primary', onClick: () => backToLobby() },
        { label: 'Leave', onClick: () => leaveMultiplayer() },
        { label: 'Cancel', cls: 'link' },
      ]);
    } else {
      modal('Leave this game?', `<p>${esc(S.oppName)} will be told you left.</p>`, [
        { label: 'Leave', cls: 'primary', onClick: () => leaveMultiplayer() },
        { label: 'Cancel', cls: 'link' },
      ]);
    }
  });

  $('btn-reconnect').addEventListener('click', () => {
    if (!S.conn) return;
    S.reconnectTries = 0;
    toast('Reconnecting…');
    S.conn.reconnect();
  });

  // Tapping outside the board clears the selection.
  document.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'game' || !S.game) return;
    // Use the path captured when the tap started: re-rendering a cell can detach e.target.
    const inside = e.composedPath().some((el) => el instanceof Element && el.matches('.board, .numpad, .pad-label, .tools, .modal, .banner, .topbar'));
    if (inside) return;
    S.sel = -1; S.hlDigit = 0; S.pick = null;
    if (S.game.mode === 'shared') send({ t: 'cursor', i: -1 });
    render();
  });
}

buildBoard();
wire();
show('home');
