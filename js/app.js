import { ROW, COL, BOX, PEERS, DIFFICULTIES } from './sudoku.js';
import { generateRated } from './generate.js';
import { Connection, randomCode, normalizeCode } from './net.js';
import { nextHint, cellName } from './solver.js';
import { CHAPTERS, technique } from './strategies.js';

// What each difficulty asks of you, shown on the setup screen.
const DIFFICULTY_HELP = {
  easy: 'Singles only: full houses, naked and hidden singles.',
  medium: 'Needs pointing/claiming or naked/hidden pairs and triples.',
  hard: 'Needs an X-Wing, Swordfish, XY-Wing, Unique Rectangle or similar.',
  expert: 'Needs wings, finned fish, chains or a forcing chain.',
};

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
  sheet: null,         // open bottom panel: 'hint' | 'check'
  marks: null,         // board highlights from a hint or check
  hint: null,          // { steps, headline, shown }
  guideReturn: 'home',
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
  $('sheet').classList.toggle('hidden', !(S.sheet && screen === 'game'));
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

function makeGame({ mode, difficulty, check, puzzle, solution, id, techs }) {
  return {
    id: id || Math.random().toString(36).slice(2, 10),
    mode, difficulty,
    check: mode === 'shared' ? true : !!check,
    puzzle, solution,
    techs: techs || [],
    values: puzzle.slice(),
    notes: new Array(81).fill(0),
    owner: new Array(81).fill(null),
    history: [],
    redo: [],
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
    id: g.id, mode: g.mode, difficulty: g.difficulty, check: g.check, techs: g.techs,
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
    const mk = S.marks;
    cl.toggle('hint-area', !!mk && mk.area.has(i));
    cl.toggle('hint-focus', !!mk && mk.focus.has(i));
    cl.toggle('hint-target', !!mk && mk.target.has(i));
    cl.toggle('chk-wrong', !!mk && mk.wrong.has(i));
    cl.toggle('chk-missing', !!mk && mk.missing.has(i));
    const xm = (mk && mk.x.get(i)) || 0;
    if (v) {
      if (c.dataset.v !== String(v)) { c.textContent = v; c.dataset.v = String(v); }
    } else {
      const n = g.notes[i];
      const key = 'n' + n + ':' + hd + ':' + xm;
      if (c.dataset.v !== key) {
        c.dataset.v = key;
        if (!n) c.textContent = '';
        else {
          let h = '<div class="notes">';
          for (let d = 1; d <= 9; d++) {
            const on = n & (1 << d);
            const cls = on && (xm & (1 << d)) ? 'x' : on && d === hd ? 'hl' : '';
            h += `<span class="${cls}">${on ? d : ''}</span>`;
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
  $('tool-verify').disabled = g.finished;
  $('tool-undo').disabled = !g.history.length || g.finished;
  $('tool-redo').disabled = !(g.redo && g.redo.length) || g.finished;
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
  pushHistory(g, { i, v: 0, n: g.notes[i] });
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
  pushHistory(g, entry);
  afterChange();
  checkSoloComplete();
}

// Entries pushed during one tap share a group, so undo/redo treat them as one step.
let historyGroup = 0, groupOpen = false;
function pushHistory(g, entry) {
  if (!groupOpen) {
    historyGroup++;
    groupOpen = true;
    queueMicrotask(() => { groupOpen = false; });
  }
  entry.grp = historyGroup;
  g.history.push(entry);
  g.redo = []; // a new move replaces anything you'd undone
}

function undo() {
  const g = S.game;
  if (!g || g.finished || !g.history.length) return;
  const grp = g.history[g.history.length - 1].grp;
  const step = { entries: [], after: [] };
  // Entries saved before grouping existed have no group: undo those one at a time.
  for (let first = true; g.history.length && (first || (grp !== undefined && g.history[g.history.length - 1].grp === grp)); first = false) {
    const h = g.history.pop();
    // In a shared game the other player may have filled this square since.
    if (g.mode === 'shared' && g.values[h.i]) continue;
    step.entries.unshift(h);
    step.after.unshift({ v: g.values[h.i], n: g.notes[h.i], peers: (h.peers || []).map((p) => [p, g.notes[p]]) });
    g.values[h.i] = h.v;
    g.notes[h.i] = h.n;
    // put back the pencil marks that placing the number cleared
    if (h.peers) for (const p of h.peers) g.notes[p] |= 1 << h.placed;
  }
  if (!step.entries.length) { render(); return; }
  (g.redo ||= []).push(step);
  focusAfterUndo(step.entries[step.entries.length - 1].i);
  render();
  save();
  if (g.mode === 'race') sendProgress();
}

function redo() {
  const g = S.game;
  if (!g || g.finished || !g.redo || !g.redo.length) return;
  const step = g.redo.pop();
  step.entries.forEach((h, k) => {
    if (g.mode === 'shared' && g.values[h.i]) return;
    const a = step.after[k];
    g.values[h.i] = a.v;
    g.notes[h.i] = a.n;
    for (const [p, n] of a.peers) g.notes[p] = n;
    g.history.push(h);
  });
  const last = step.entries[step.entries.length - 1];
  focusAfterUndo(last.i);
  render();
  save();
  if (g.mode === 'race') sendProgress();
  if (g.mode !== 'shared') checkSoloComplete();
}

function focusAfterUndo(i) {
  if (S.sheet) hideSheet();
  if (!S.pick) {
    S.sel = i;
    S.hlDigit = S.game.values[i] || 0;
  }
}

function erase() {
  const g = S.game;
  if (!g || g.finished) return;
  if (S.sel < 0) { toast('Select a square to erase'); return; }
  const i = S.sel;
  if (g.values[i] && !isLocked(i)) {
    pushHistory(g, { i, v: g.values[i], n: g.notes[i] });
    g.values[i] = 0;
    S.hlDigit = 0;
  } else if (!g.values[i] && g.notes[i]) {
    pushHistory(g, { i, v: 0, n: g.notes[i] });
    g.notes[i] = 0;
  } else return;
  afterChange();
}

// ---------------------------------------------------------------- hints & check

const bitOf = (d) => 1 << d;
function emptyMarks() {
  return { area: new Set(), focus: new Set(), target: new Set(), wrong: new Set(), missing: new Set(), x: new Map() };
}

function wrongCells(g) {
  const out = [];
  for (let i = 0; i < 81; i++) if (!g.puzzle[i] && g.values[i] && g.values[i] !== g.solution[i]) out.push(i);
  return out;
}

function openSheet(kind, kicker, bodyHtml, actions) {
  S.sheet = kind;
  $('sheet-kicker').textContent = kicker;
  $('sheet-body').innerHTML = bodyHtml;
  const box = $('sheet-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = a.onClick;
    box.appendChild(b);
  }
  $('sheet').classList.toggle('hidden', S.screen !== 'game');
  $('sheet').scrollTop = 0;
  document.body.classList.add('sheet-open');
}

function hideSheet() {
  S.sheet = null;
  S.marks = null;
  S.hint = null;
  $('sheet').classList.add('hidden');
  document.body.classList.remove('sheet-open');
}
function closeSheet() { hideSheet(); render(); }

function techTitle(id) {
  const t = technique(id);
  return t ? `${t.name} <span class="chip l-${t.level}">${t.level}</span>` : id;
}

function hint() {
  const g = S.game;
  if (!g || g.finished || g.mode !== 'solo') return;
  hideSheet();
  const wrong = wrongCells(g);
  if (wrong.length) {
    openSheet('hint', '💡 Hint', `<h3>Fix a mistake first</h3>
      <p>${wrong.length === 1 ? 'One of your numbers is' : `${wrong.length} of your numbers are`} wrong. Hints work out the next step from a correct board.</p>`,
      [{ label: 'Show me', cls: 'primary', onClick: runCheck }]);
    render();
    return;
  }
  const steps = nextHint(g.values);
  if (!steps || !steps.length) { toast('No hint available'); return; }
  // Skip elimination steps your notes already reflect.
  const done = (st) => st.elims.length && st.elims.every(([c, d]) => g.notes[c] && !(g.notes[c] & bitOf(d)));
  const pending = steps.filter((st) => st.place || !done(st));
  const headline = pending.reduce((a, b) => (b.rank > a.rank ? b : a));
  S.hint = { steps: pending, headline };
  g.hints++;
  save();
  const t = technique(headline.tech);
  openSheet('hint', '💡 Hint · strategy to look for', `<h3>${techTitle(headline.tech)}</h3>
    <p class="summary">${t ? t.summary : ''}</p>
    <p class="muted">See if you can find it, or tap <b>Show me</b>.</p>`,
    [{ label: 'Show me', cls: 'primary', onClick: showHintDetail },
      { label: 'Read about it', onClick: () => openGuide(headline.tech) }]);
  render();
}

function showHintDetail() {
  const h = S.hint;
  if (!h) return;
  const mk = emptyMarks();
  for (const st of h.steps) {
    for (const c of st.cells) mk.area.add(c);
    for (const c of st.focus || []) mk.focus.add(c);
    for (const [c, d] of st.elims) mk.x.set(c, (mk.x.get(c) || 0) | bitOf(d));
    if (st.place) mk.target.add(st.place.cell);
  }
  for (const c of mk.target) mk.focus.delete(c);
  S.marks = mk;
  const last = h.steps[h.steps.length - 1];
  const items = h.steps.map((st) => {
    const t = technique(st.tech);
    return `<li><b>${t ? t.name : st.tech}:</b> ${st.text}</li>`;
  }).join('');
  openSheet('hint', '💡 Hint · how it works', `<h3>${techTitle(h.headline.tech)}</h3><ol>${items}</ol>
    <p class="muted">${cellName(last.place.cell)} is outlined in green. Crossed-out notes are the ones these steps remove.</p>`,
    [{ label: `Fill in ${last.place.digit}`, cls: 'primary', onClick: fillHint },
      { label: 'Read about it', onClick: () => openGuide(h.headline.tech) }]);
  render();
}

function fillHint() {
  const g = S.game;
  const h = S.hint;
  if (!g || !h) return;
  // Remove the eliminated candidates from any notes you've written.
  for (const st of h.steps) {
    for (const [c, d] of st.elims) {
      if (g.notes[c] & bitOf(d)) { pushHistory(g, { i: c, v: 0, n: g.notes[c] }); g.notes[c] &= ~bitOf(d); }
    }
  }
  const { cell: i, digit: d } = h.steps[h.steps.length - 1].place;
  const entry = { i, v: g.values[i], n: g.notes[i], peers: [], placed: d };
  g.values[i] = d;
  g.notes[i] = 0;
  for (const p of PEERS[i]) if (g.notes[p] & bitOf(d)) { entry.peers.push(p); g.notes[p] &= ~bitOf(d); }
  pushHistory(g, entry);
  S.pick = null;
  S.sel = i;
  S.hlDigit = d;
  hideSheet();
  flash(i, 'good');
  afterChange();
  checkSoloComplete();
}

function runCheck() {
  const g = S.game;
  if (!g) return;
  hideSheet();
  const mk = emptyMarks();
  for (const c of wrongCells(g)) mk.wrong.add(c);
  let clashes = 0;
  for (let i = 0; i < 81; i++) {
    if (g.values[i] || !g.notes[i]) continue;
    if (!(g.notes[i] & bitOf(g.solution[i]))) mk.missing.add(i);
    let m = 0;
    for (const p of PEERS[i]) if (g.values[p] && (g.notes[i] & bitOf(g.values[p]))) m |= bitOf(g.values[p]);
    if (m) { mk.x.set(i, m); clashes += digitsCount(m); }
  }
  S.marks = mk;
  const lines = [];
  if (mk.wrong.size) lines.push(`<li><b>${mk.wrong.size}</b> wrong number${mk.wrong.size > 1 ? 's' : ''} (shaded red)</li>`);
  if (mk.missing.size) lines.push(`<li><b>${mk.missing.size}</b> square${mk.missing.size > 1 ? 's' : ''} whose notes don't include the right number (orange outline)</li>`);
  if (clashes) lines.push(`<li><b>${clashes}</b> note${clashes > 1 ? 's' : ''} that clash with a number in the same row, column or box (crossed out)</li>`);
  const actions = [];
  if (clashes) actions.push({ label: 'Remove clashing notes', cls: 'primary', onClick: removeClashes });
  actions.push({ label: 'Done', cls: clashes ? '' : 'primary', onClick: closeSheet });
  openSheet('check', '🔍 Check', lines.length
    ? `<h3>Found ${lines.length === 1 && !clashes && (mk.wrong.size + mk.missing.size) === 1 ? 'a problem' : 'some problems'}</h3><ul>${lines.join('')}</ul>`
    : `<h3>All good ✓</h3><p>Your numbers are all correct and none of your notes rule out the right answer.</p>`,
    actions);
  render();
}

function digitsCount(m) { let n = 0; for (let d = 1; d <= 9; d++) if (m & bitOf(d)) n++; return n; }

function removeClashes() {
  const g = S.game;
  const mk = S.marks;
  if (!g || !mk) return;
  for (const [c, m] of mk.x) { pushHistory(g, { i: c, v: 0, n: g.notes[c] }); g.notes[c] &= ~m; }
  hideSheet();
  afterChange();
  toast('Clashing notes removed');
}

// ---------------------------------------------------------------- strategy guide

function buildGuide() {
  const box = $('guide');
  let h = `<p>Techniques roughly in order of difficulty. When a hint names a strategy, "Read about it" jumps to it here.</p>`;
  for (const ch of CHAPTERS) {
    h += `<details id="ch-${ch.id}"><summary><span>${ch.title}${ch.intro ? `<small>${ch.intro}</small>` : ''}</span></summary>`;
    for (const t of ch.techniques) {
      h += `<div class="tech" id="tech-${t.id}"><h4>${t.name} <span class="chip l-${t.level}">${t.level}</span></h4>
        <p class="tsum">${t.summary}</p>${t.body.map((p) => `<p>${p}</p>`).join('')}</div>`;
    }
    h += '</details>';
  }
  box.innerHTML = h;
}

function openGuide(techId) {
  if (S.screen !== 'guide') S.guideReturn = S.screen;
  show('guide');
  const t = techId && technique(techId);
  if (!t) { window.scrollTo(0, 0); return; }
  const el = $('tech-' + (document.getElementById('tech-' + techId) ? techId : t.id));
  el.closest('details').open = true;
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  });
}

function afterChange() {
  if (S.sheet) hideSheet(); // the board changed, so any hint or check is stale
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
  else if (e.key === 'y' || e.key === 'Y' || e.key === 'Z') redo();
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
      <p>${g.mistakes} mistake${g.mistakes === 1 ? '' : 's'}${g.hints ? `, ${g.hints} hint${g.hints > 1 ? 's' : ''}` : ''}.</p>${techSummary(g)}`,
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
  body += techSummary(S.game);
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
  if (!g || g.finished) return;
  if (S.screen !== 'game' && !(S.screen === 'guide' && g.mode !== 'solo' && S.guideReturn === 'game')) return;
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
  hideSheet();
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
  $('difficulty-help').textContent = DIFFICULTY_HELP[st.difficulty];
  const btn = $('btn-start');
  if (generating) return;
  if (S.setupKind === 'host') {
    btn.disabled = !S.connected;
    btn.textContent = S.connected ? 'Start game' : 'Waiting for player…';
  } else {
    btn.disabled = false;
    btn.textContent = 'Start';
  }
  store.set('sudoku-setup', st);
}

let generating = false;
async function onStartPressed() {
  const st = S.setup;
  if (generating || (S.setupKind === 'host' && !S.connected)) return;
  const btn = $('btn-start');
  generating = true;
  btn.disabled = true;
  btn.textContent = 'Making a puzzle…';
  let p;
  try {
    p = await generateRated(st.difficulty);
  } finally {
    generating = false;
    syncSetupUI();
  }
  if (S.screen !== 'setup') return; // left the screen while generating
  if (p.difficulty !== st.difficulty) toast(`Couldn't find a ${DIFFICULTIES[st.difficulty].label} puzzle in time; this one is ${DIFFICULTIES[p.difficulty].label}.`, 3500);
  if (S.setupKind === 'solo') {
    disconnect();
    S.role = null;
    startGame(makeGame({ mode: 'solo', check: st.check, ...p }));
    return;
  }
  if (!S.connected) return;
  const game = makeGame({ mode: st.mode, check: st.check, ...p });
  startGame(game);
  send({ t: 'start', game: publicGame(game) });
}

// "Needed: Naked Pair, X-Wing" for the end-of-game summary.
function techSummary(g) {
  const names = (g.techs || []).filter((id) => !['full-house', 'naked-single', 'hidden-single'].includes(id))
    .map((id) => (technique(id) || { name: id }).name);
  if (!g.techs || !g.techs.length) return '';
  return `<p class="muted">Strategies this puzzle needed: ${names.length ? [...new Set(names)].join(', ') : 'singles only'}.</p>`;
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
    if (go === 'guide') openGuide();
    else if (go === 'solo') openSetup('solo');
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
  $('tool-redo').addEventListener('click', redo);
  $('tool-erase').addEventListener('click', erase);
  $('tool-hint').addEventListener('click', hint);
  $('tool-verify').addEventListener('click', runCheck);
  $('sheet-close').addEventListener('click', closeSheet);
  $('btn-guide').addEventListener('click', () => openGuide());
  $('btn-guide-back').addEventListener('click', () => {
    show(S.guideReturn === 'game' && S.game ? 'game' : S.guideReturn || 'home');
    if (S.screen === 'game') render();
  });
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
    const inside = e.composedPath().some((el) => el instanceof Element && el.matches('.board, .numpad, .pad-label, .tools, .modal, .banner, .topbar, .sheet'));
    if (inside) return;
    S.sel = -1; S.hlDigit = 0; S.pick = null;
    if (S.game.mode === 'shared') send({ t: 'cursor', i: -1 });
    render();
  });
}

buildBoard();
buildGuide();
wire();
show('home');
