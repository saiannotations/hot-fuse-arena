// Hot Fuse Arena — GameRoom Durable Object.
// One DO instance per room code. Owns the authoritative match state,
// runs the 20Hz game loop while playing, and relays WebSocket messages.
//
// Hibernatable WebSockets: player session info lives in the socket
// attachment, so the DO can nap between messages without losing state.
import {
  BOT_AUTOFILL,
  MAX_PLAYERS,
  createMatch,
  addPlayer,
  removePlayer,
  setInput,
  stepBot,
  startMatch,
  resetToLobby,
  update,
  snapshot,
} from '../shared/sim.js';

const TICK_MS = 50; // 20Hz server loop
const BOT_NAMES = ['FuseBot', 'Blaze', 'Sparky', 'Tinder', 'Wick', 'Ember'];

function keysToDir(keys = {}) {
  let dx = 0;
  let dz = 0;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up) dz -= 1;
  if (keys.down) dz += 1;
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }
  return { dx, dz };
}

let botSeq = 1;

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.match = createMatch();
    this.inputs = new Map(); // playerId -> last keys object
    this.loop = null;
    this.hostId = null;
  }

  // --- HTTP entry: only used for the WebSocket upgrade ----------------------

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/ws')) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Expected a WebSocket upgrade at /ws', { status: 400 });
  }

  // --- WebSocket handlers ---------------------------------------------------

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() || {};
    switch (msg.t) {
      case 'join':
        this.handleJoin(ws, msg, att);
        break;
      case 'input':
        if (att.playerId) this.inputs.set(att.playerId, msg.keys || {});
        break;
      case 'chat':
        this.broadcast({
          t: 'chat',
          from: att.name || '???',
          text: String(msg.text || '').slice(0, 200),
        });
        break;
      case 'start':
        this.handleStart(att);
        break;
      case 'add_bot':
        this.handleAddBot(att);
        break;
      case 'rematch':
        this.handleRematch(att);
        break;
      default:
        break;
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment() || {};
    if (!att.playerId) return;
    const p = this.match.players.get(att.playerId);
    if (p) {
      p.connected = false; // keep the seat warm for reconnects
      this.broadcast({ t: 'chat', from: 'system', text: `${p.name} disconnected` });
      this.broadcastState();
    }
    if (!this.anyConnected()) this.stopLoop();
  }

  // --- Room logic -----------------------------------------------------------

  handleJoin(ws, msg, att) {
    // Reconnect: same playerId comes back on a fresh socket.
    if (msg.playerId && this.match.players.has(msg.playerId)) {
      const p = this.match.players.get(msg.playerId);
      p.connected = true;
      ws.serializeAttachment({ playerId: p.id, name: p.name });
      ws.send(JSON.stringify({ t: 'welcome', playerId: p.id, rejoin: true }));
      this.broadcastState();
      return;
    }
    if (this.match.players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: 'error', message: 'Room is full (8 players max).' }));
      ws.close(1013, 'room full');
      return;
    }
    const name = String(msg.name || 'Player').slice(0, 16) || 'Player';
    const id = `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    const player = addPlayer(this.match, { id, name, isBot: false });
    if (!player) {
      ws.send(JSON.stringify({ t: 'error', message: 'Room is full (8 players max).' }));
      ws.close(1013, 'room full');
      return;
    }
    if (!this.hostId) this.hostId = id;
    ws.serializeAttachment({ playerId: id, name: player.name });
    ws.send(JSON.stringify({ t: 'welcome', playerId: id }));
    this.broadcast({ t: 'chat', from: 'system', text: `${player.name} joined the arena` });
    this.broadcastState();
  }

  handleStart(att) {
    if (this.match.phase !== 'LOBBY') return;
    const humans = [...this.match.players.values()].filter((p) => !p.isBot && p.connected);
    if (humans.length === 0) return;
    // Auto-fill with bots so even a solo player gets a real game.
    while (this.match.players.size < Math.min(BOT_AUTOFILL, MAX_PLAYERS)) {
      this.spawnBot();
    }
    startMatch(this.match);
    this.broadcast({ t: 'chat', from: 'system', text: 'Match started! Run!' });
    this.broadcastState();
    this.startLoop();
  }

  handleAddBot(att) {
    if (this.match.phase !== 'LOBBY') return;
    if (this.spawnBot()) {
      this.broadcastState();
    }
  }

  spawnBot() {
    const name = `${BOT_NAMES[(botSeq - 1) % BOT_NAMES.length]}-${botSeq++}`;
    const id = `bot-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    const player = addPlayer(this.match, { id, name, isBot: true });
    if (player) {
      this.broadcast({ t: 'chat', from: 'system', text: `${name} joined the arena` });
      return true;
    }
    return false;
  }

  handleRematch(att) {
    if (this.match.phase !== 'MATCH_END') return;
    resetToLobby(this.match);
    // Drop disconnected humans; bots stay for the next game.
    for (const [id, p] of this.match.players) {
      if (!p.isBot && !p.connected) {
        this.match.players.delete(id);
        this.inputs.delete(id);
      }
    }
    this.broadcastState();
  }

  anyConnected() {
    return [...this.match.players.values()].some((p) => p.connected);
  }

  // --- Game loop ------------------------------------------------------------

  startLoop() {
    if (this.loop) return;
    this.loop = setInterval(() => {
      if (this.match.phase !== 'PLAYING') {
        this.stopLoop();
        return;
      }
      // Human inputs.
      for (const [id, keys] of this.inputs) {
        const { dx, dz } = keysToDir(keys);
        setInput(this.match, id, dx, dz);
      }
      // Bot steering.
      for (const p of this.match.players.values()) {
        if (p.isBot && p.alive) stepBot(this.match, p.id);
      }
      const events = update(this.match, TICK_MS / 1000);
      for (const e of events) {
        this.broadcast({ t: 'event', ...e });
        if (e.kind === 'explode') {
          const victim = e.playerId;
          const name = this.match.players.get(victim)?.name ?? 'Someone';
          this.broadcast({ t: 'chat', from: 'system', text: `💥 ${name} exploded!` });
        }
        if (e.kind === 'win') {
          const name = this.match.players.get(e.playerId)?.name ?? 'Someone';
          this.broadcast({ t: 'chat', from: 'system', text: `👑 ${name} wins the match!` });
          this.stopLoop();
        }
      }
      this.broadcastState();
      if (!this.anyConnected()) this.stopLoop();
    }, TICK_MS);
  }

  stopLoop() {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }

  broadcast(obj) {
    const text = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // Closed socket; webSocketClose will clean it up.
      }
    }
  }

  broadcastState() {
    this.broadcast({ t: 'snapshot', ...snapshot(this.match) });
  }
}
