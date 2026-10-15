// Hot Fuse Arena — client entry: networking, input, render loop.
import * as THREE from 'three';
import { createArena } from './arena.js';
import { createPlayerManager } from './players.js';
import { createExplosionPool, createBeeper } from './fx.js';
import { createUI, saveSession, loadSession } from './ui.js';

const TICK_SNAPSHOT_HZ = 20;

const arena = createArena(document.getElementById('scene'));
const playerMgr = createPlayerManager(arena.scene);
const explosions = createExplosionPool(arena.scene);
const beeper = createBeeper();

let ws = null;
let roomCode = null;
let playerId = null;
let playerName = 'Player';
let latestSnap = null;
let keys = { up: false, down: false, left: false, right: false };
let keysDirty = false;
let lastHeartbeat = 0;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (!keys[k]) {
    keys[k] = true;
    keysDirty = true;
  }
  // First keypress counts as the gesture that unlocks audio.
  beeper.unlock();
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  keys[k] = false;
  keysDirty = true;
});
// If the window loses focus mid-keypress, the keyup never fires —
// clear everything so the player doesn't run into a wall forever.
addEventListener('blur', () => {
  keys = { up: false, down: false, left: false, right: false };
  keysDirty = true;
});

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function sendInput(force = false) {
  const now = performance.now();
  if ((keysDirty || force || now - lastHeartbeat > 250) && latestSnap?.phase === 'PLAYING') {
    send({ t: 'input', keys: { ...keys } });
    keysDirty = false;
    lastHeartbeat = now;
  }
}

function connect(code, name, rejoinId = null) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/room/${code}/ws`);
  roomCode = code;

  ws.onopen = () => {
    send({ t: 'join', name, playerId: rejoinId });
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleMessage(msg);
  };
  ws.onclose = () => {
    ui.setError('Connection lost. Refresh to rejoin the room.');
  };
  ws.onerror = () => {
    ui.setError('Could not reach the game server.');
  };
}

function handleMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      playerId = msg.playerId;
      saveSession(roomCode, playerId, playerName);
      break;
    case 'snapshot':
      latestSnap = msg;
      onSnapshot(msg);
      break;
    case 'event':
      onEvent(msg);
      break;
    case 'chat':
      ui.addChat(msg.from, msg.text);
      break;
    case 'error':
      ui.setError(msg.message);
      break;
    default:
      break;
  }
}

function onSnapshot(snap) {
  if (snap.phase === 'LOBBY') {
    ui.renderLobby(roomCode, snap.players, playerId);
  } else if (snap.phase === 'PLAYING') {
    // A new match started: drop any crown left over from the previous winner.
    playerMgr.clearWinner();
    ui.enterGame();
    ui.renderHUD(snap, playerId);
  } else if (snap.phase === 'MATCH_END') {
    ui.renderHUD(snap, playerId);
    const winner = snap.players.find((p) => p.id === snap.winnerId);
    playerMgr.setWinner(snap.winnerId);
    ui.showResult(winner ? winner.name : 'Nobody', snap.winnerId === playerId);
  }
}

function onEvent(ev) {
  if (ev.kind === 'explode') {
    explosions.spawn(ev.x, ev.z);
    arena.addShake(0.9);
    ui.flash();
  } else if (ev.kind === 'tag') {
    arena.addShake(0.18);
  } else if (ev.kind === 'round') {
    playerMgr.clearWinner();
  }
}

const ui = createUI({
  onCreate: async (name) => {
    playerName = name;
    try {
      const res = await fetch('/api/create');
      const { code } = await res.json();
      connect(code, name);
    } catch {
      ui.setError('Could not create a room. Is the server running?');
    }
  },
  onJoin: (code, name) => {
    playerName = name;
    connect(code, name);
  },
  onRejoin: (saved) => {
    playerName = saved.name;
    connect(saved.room, saved.name, saved.playerId);
  },
  onStart: () => send({ t: 'start' }),
  onAddBot: () => send({ t: 'add_bot' }),
  onChat: (text) => send({ t: 'chat', text }),
  onRematch: () => {
    send({ t: 'rematch' });
    ui.hideResult();
  },
  onBackToLobby: () => send({ t: 'rematch' }),
});

// Deep-link: #ABCD joins that room directly.
if (location.hash.length === 5) {
  const code = location.hash.slice(1).toUpperCase();
  document.getElementById('codeInput').value = code;
}

// --- Render loop ------------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;

  sendInput();
  if (latestSnap) {
    playerMgr.update(latestSnap.players, dt, t);
    const me = latestSnap.players.find((p) => p.id === playerId);
    const overview = latestSnap.phase !== 'PLAYING' || !me || !me.alive;
    arena.follow(dt, me ? me.x : 0, me ? me.z : 0, overview);
    beeper.update(now, latestSnap.fuse, latestSnap.phase === 'PLAYING');
  } else {
    arena.follow(dt, 0, 0, true);
  }
  explosions.update(dt);
  arena.render();
}
requestAnimationFrame(frame);

// Keep three.js referenced (avoids unused-import lint noise in some setups).
void THREE;
