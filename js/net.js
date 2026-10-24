// Multiplayer connection. The host's phone is the hub: every guest connects to
// it, and the app on the host relays what others need to see. Uses PeerJS
// (WebRTC) so phones talk directly; PeerJS's free public server is only used
// to find each other. Add ?local to the URL to use BroadcastChannel instead
// (several tabs in one browser), which is handy for testing without a network.

const PREFIX = 'kintsugi-sudoku-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function normalizeCode(code) {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

const useLocal = new URLSearchParams(location.search).has('local');

// onMessage(msg, key): key identifies the sending connection (host side only).
// onStatus(status, detail, key):
//   host:  'waiting' (registered), 'peer-open' / 'peer-close' (key), 'error'
//   guest: 'connected', 'disconnected', 'error'
export class Connection {
  constructor(role, { onMessage, onStatus }) {
    this.role = role; // 'host' | 'guest'
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.connected = false; // guest: linked to the host
    this.code = null;
    this.closed = false;
    this.conns = new Map(); // host: key -> { conn, lastSeen }
  }

  start(code) {
    this.code = code;
    if (useLocal) this._startLocal();
    else this._startPeer();
  }

  // Guest: send to the host. Host: send to one connection (key) or everyone.
  send(msg, key) {
    try {
      if (this.role === 'guest') {
        if (!this.connected) return false;
        if (useLocal) this.bc.postMessage({ from: this.key, to: 'host', kind: 'msg', msg });
        else this.conn.send(msg);
        return true;
      }
      if (useLocal) {
        if (key && !this.conns.has(key)) return false;
        this.bc.postMessage({ from: 'host', to: key || '*', kind: 'msg', msg });
        return true;
      }
      const targets = key ? [this.conns.get(key)].filter(Boolean) : [...this.conns.values()];
      for (const t of targets) { try { t.conn.send(msg); } catch {} }
      return targets.length > 0;
    } catch (e) {
      console.warn('send failed', e);
      return false;
    }
  }

  close() {
    this.closed = true;
    this.connected = false;
    clearInterval(this.pingTimer);
    clearTimeout(this.openTimer);
    try { this.bc && this.bc.postMessage({ from: this.key, to: this.role === 'host' ? '*' : 'host', kind: 'bye' }); } catch {}
    try { this.bc && this.bc.close(); } catch {}
    for (const { conn } of this.conns.values()) { try { conn.close(); } catch {} }
    this.conns.clear();
    try { this.conn && this.conn.close(); } catch {}
    try { this.peer && this.peer.destroy(); } catch {}
  }

  // Guest: try to re-establish a dropped connection. Host: re-register with
  // the matchmaking server if that link dropped.
  reconnect() {
    if (this.closed) return;
    if (useLocal) {
      if (this.role === 'guest') this.bc.postMessage({ from: this.key, to: 'host', kind: 'hello' });
      return;
    }
    if (this.role === 'guest') {
      if (this.peer && !this.peer.destroyed && !this.peer.disconnected) this._connectToHost();
      else { try { this.peer && this.peer.destroy(); } catch {} this._startPeer(); }
    } else if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
      this.peer.reconnect();
    }
  }

  _setConnected(v) {
    if (this.connected === v) return;
    this.connected = v;
    this.onStatus(v ? 'connected' : 'disconnected');
  }

  _peerOpen(key, conn) {
    const had = this.conns.has(key);
    this.conns.set(key, { conn, lastSeen: Date.now() });
    if (!had) this.onStatus('peer-open', null, key);
  }

  _peerClose(key) {
    const c = this.conns.get(key);
    if (!c) return;
    this.conns.delete(key);
    try { c.conn && c.conn.close(); } catch {}
    this.onStatus('peer-close', null, key);
  }

  // ---- BroadcastChannel transport (testing: one tab per player) ----
  _startLocal() {
    this.key = this.role === 'host' ? 'host' : 'tab-' + Math.random().toString(36).slice(2, 8);
    this.bc = new BroadcastChannel(PREFIX + this.code);
    this.bc.onmessage = (e) => {
      const d = e.data;
      if (d.from === this.key) return;
      if (this.role === 'host') {
        if (d.to !== 'host') return;
        if (d.kind === 'hello') {
          this.bc.postMessage({ from: 'host', to: d.from, kind: 'ack' });
          this._peerOpen(d.from, null);
        } else if (d.kind === 'bye') this._peerClose(d.from);
        else if (d.kind === 'msg' && this.conns.has(d.from)) this.onMessage(d.msg, d.from);
      } else {
        if (d.from !== 'host' || (d.to !== this.key && d.to !== '*')) return;
        if (d.kind === 'ack') this._setConnected(true);
        else if (d.kind === 'bye') this._setConnected(false);
        else if (d.kind === 'msg' && this.connected) this.onMessage(d.msg);
      }
    };
    window.addEventListener('beforeunload', () => {
      try { this.bc.postMessage({ from: this.key, to: this.role === 'host' ? '*' : 'host', kind: 'bye' }); } catch {}
    });
    if (this.role === 'host') this.onStatus('waiting');
    else this.bc.postMessage({ from: this.key, to: 'host', kind: 'hello' });
  }

  // ---- PeerJS transport ----
  _startPeer() {
    const Peer = window.peerjs && window.peerjs.Peer;
    if (!Peer) { this.onStatus('error', 'Networking library failed to load.'); return; }
    const id = this.role === 'host' ? PREFIX + this.code : undefined;
    const peer = new Peer(id, { debug: 1 });
    this.peer = peer;

    peer.on('open', () => {
      if (this.role === 'host') { this.onStatus('waiting'); this._startPing(); }
      else this._connectToHost();
    });
    peer.on('connection', (conn) => {
      if (this.role !== 'host') return;
      const key = conn.peer + ':' + conn.connectionId;
      conn.on('open', () => this._peerOpen(key, conn));
      conn.on('data', (msg) => {
        const c = this.conns.get(key);
        if (c) c.lastSeen = Date.now();
        if (msg && msg.t === 'ping') return;
        if (c) this.onMessage(msg, key);
      });
      conn.on('close', () => this._peerClose(key));
      conn.on('error', () => this._peerClose(key));
    });
    peer.on('disconnected', () => {
      // Lost the signalling server; existing data connections may still work.
      if (!this.closed && !peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1000);
    });
    peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'unavailable-id') this.onStatus('error', 'code-taken');
      else if (type === 'peer-unavailable') this.onStatus('error', 'No game found with that code. Check the code and that the host is still on the game screen.');
      else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        if (!this.connected && !this.conns.size) this.onStatus('error', 'Could not reach the matchmaking server. Check your internet connection.');
      } else if (type === 'browser-incompatible') this.onStatus('error', 'This browser does not support WebRTC.');
      else console.warn('peer error', err);
    });
  }

  _connectToHost() {
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      this.lastSeen = Date.now();
      this._setConnected(true);
      this._startPing();
    });
    conn.on('data', (msg) => {
      if (this.conn !== conn) return;
      this.lastSeen = Date.now();
      if (msg && msg.t === 'ping') return;
      this.onMessage(msg);
    });
    conn.on('close', () => { if (this.conn === conn) this._setConnected(false); });
    conn.on('error', () => { if (this.conn === conn) this._setConnected(false); });
    // If the connection never opens, report it.
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      if (!conn.open && this.conn === conn && !this.closed) {
        this.onStatus('error', 'Could not connect to the host. Make sure you are both online and try again.');
      }
    }, 15000);
  }

  // Phones can silently drop WebRTC (screen lock); ping so we notice.
  _startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const now = Date.now();
      if (this.role === 'guest') {
        if (!this.connected) return;
        try { this.conn.send({ t: 'ping' }); } catch {}
        if (now - this.lastSeen > 12000) this._setConnected(false);
        return;
      }
      for (const [key, c] of this.conns) {
        try { c.conn.send({ t: 'ping' }); } catch {}
        if (now - c.lastSeen > 12000) this._peerClose(key);
      }
    }, 3000);
  }
}
