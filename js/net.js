// Two-player connection. Uses PeerJS (WebRTC) so phones talk to each other
// directly; PeerJS's free public server is only used to find each other.
// Add ?local to the URL to use BroadcastChannel instead (two tabs, same browser)
// which is handy for testing without a network.

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

// Events: onMessage(msg), onStatus(status, detail)
// status: 'waiting' (host registered), 'connected', 'disconnected', 'error'
export class Connection {
  constructor(role, { onMessage, onStatus }) {
    this.role = role; // 'host' | 'guest'
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.connected = false;
    this.code = null;
    this.closed = false;
  }

  start(code) {
    this.code = code;
    if (useLocal) this._startLocal();
    else this._startPeer();
  }

  send(msg) {
    if (!this.connected) return false;
    try {
      if (useLocal) this.bc.postMessage({ from: this.role, msg });
      else this.conn.send(msg);
      return true;
    } catch (e) {
      console.warn('send failed', e);
      return false;
    }
  }

  close() {
    this.closed = true;
    this.connected = false;
    clearInterval(this.pingTimer);
    try { this.bc && this.bc.close(); } catch {}
    try { this.conn && this.conn.close(); } catch {}
    try { this.peer && this.peer.destroy(); } catch {}
  }

  // Guest: try to re-establish a dropped connection.
  reconnect() {
    if (this.closed) return;
    if (useLocal) { this.bc.postMessage({ from: this.role, hello: true }); return; }
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

  // ---- BroadcastChannel transport ----
  _startLocal() {
    this.bc = new BroadcastChannel(PREFIX + this.code);
    this.bc.onmessage = (e) => {
      const d = e.data;
      if (d.from === this.role) return;
      if (d.hello) {
        if (this.role === 'host') this.bc.postMessage({ from: this.role, helloAck: true });
        this._setConnected(true);
        return;
      }
      if (d.helloAck) { this._setConnected(true); return; }
      if (d.bye) { this._setConnected(false); return; }
      if (d.msg) this.onMessage(d.msg);
    };
    window.addEventListener('beforeunload', () => {
      try { this.bc.postMessage({ from: this.role, bye: true }); } catch {}
    });
    if (this.role === 'host') this.onStatus('waiting');
    else this.bc.postMessage({ from: this.role, hello: true });
  }

  // ---- PeerJS transport ----
  _startPeer() {
    const Peer = window.peerjs && window.peerjs.Peer;
    if (!Peer) { this.onStatus('error', 'Networking library failed to load.'); return; }
    const id = this.role === 'host' ? PREFIX + this.code : undefined;
    const peer = new Peer(id, { debug: 1 });
    this.peer = peer;

    peer.on('open', () => {
      if (this.role === 'host') this.onStatus('waiting');
      else this._connectToHost();
    });
    peer.on('connection', (conn) => {
      if (this.role !== 'host') return;
      // A new connection replaces the old one (e.g. the guest refreshed).
      if (this.conn && this.conn !== conn) { try { this.conn.close(); } catch {} }
      this._wire(conn);
    });
    peer.on('disconnected', () => {
      // Lost the signalling server; existing data connection may still work.
      if (!this.closed && !peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1000);
    });
    peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'unavailable-id') this.onStatus('error', 'code-taken');
      else if (type === 'peer-unavailable') this.onStatus('error', 'No game found with that code. Check the code and that the host is still on the game screen.');
      else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        if (!this.connected) this.onStatus('error', 'Could not reach the matchmaking server. Check your internet connection.');
      } else if (type === 'browser-incompatible') this.onStatus('error', 'This browser does not support WebRTC.');
      else console.warn('peer error', err);
    });
  }

  _connectToHost() {
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this._wire(conn);
    // If the connection never opens, report it.
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      if (!conn.open && this.conn === conn && !this.closed) {
        this.onStatus('error', 'Could not connect to the host. Make sure you are both online and try again.');
      }
    }, 15000);
  }

  _wire(conn) {
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
  }

  // Phones can silently drop WebRTC (screen lock); ping so we notice.
  _startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.connected) return;
      try { this.conn.send({ t: 'ping' }); } catch {}
      if (Date.now() - this.lastSeen > 12000) this._setConnected(false);
    }, 3000);
  }
}
