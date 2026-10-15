// Hot Fuse Arena — pure game simulation.
// Zero platform dependencies: no DOM, no Workers APIs. Imported by the
// Cloudflare Durable Object and unit-tested with `node --test`.
//
// Coordinates: x/z plane, arena spans [-ARENA_HALF, ARENA_HALF] on both axes.

export const ARENA_HALF = 20;
export const PLAYER_RADIUS = 0.6;
export const PLAYER_SPEED = 8; // units per second
export const TAG_RADIUS = 1.7;
export const PASS_COOLDOWN = 1.5; // seconds before the bomb can be passed again
export const FUSE_TIME = 20; // seconds
export const MAX_PLAYERS = 8;
export const BOT_AUTOFILL = 4; // rooms auto-fill with bots up to this many players

export const PLAYER_COLORS = [
  0xff5252, 0x40c4ff, 0x69f0ae, 0xffd740,
  0xe040fb, 0xff6e40, 0x18ffff, 0xb2ff59,
];

let nextBotNum = 1;

export function createMatch() {
  return {
    phase: 'LOBBY', // LOBBY | PLAYING | MATCH_END
    players: new Map(), // id -> player
    fuse: FUSE_TIME,
    time: 0,
    lastPassAt: -Infinity,
    winnerId: null,
    round: 0,
  };
}

export function playerList(match) {
  return [...match.players.values()];
}

export function alivePlayers(match) {
  return playerList(match).filter((p) => p.alive);
}

export function bombHolder(match) {
  return playerList(match).find((p) => p.alive && p.hasBomb) || null;
}

function spawnPosition(match) {
  // Random spot with a little breathing room from other players.
  for (let tries = 0; tries < 12; tries++) {
    const x = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
    const z = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
    const clear = playerList(match).every(
      (p) => Math.hypot(p.x - x, p.z - z) > 4
    );
    if (clear) return { x, z };
  }
  return {
    x: (Math.random() * 2 - 1) * (ARENA_HALF - 4),
    z: (Math.random() * 2 - 1) * (ARENA_HALF - 4),
  };
}

export function addPlayer(match, { id, name, isBot = false, color = null }) {
  if (match.players.size >= MAX_PLAYERS) return null;
  const used = new Set(playerList(match).map((p) => p.color));
  const picked =
    color !== null ? color : PLAYER_COLORS.find((c) => !used.has(c)) ?? 0xffffff;
  const { x, z } = spawnPosition(match);
  const player = {
    id,
    name: isBot && !name ? `FuseBot-${nextBotNum++}` : name || 'Player',
    x,
    z,
    dirX: 0,
    dirZ: 0,
    speed: PLAYER_SPEED,
    alive: true,
    hasBomb: false,
    isBot,
    color: picked,
    connected: true,
    noisePhase: Math.random() * Math.PI * 2,
  };
  match.players.set(id, player);
  return player;
}

export function removePlayer(match, id) {
  const p = match.players.get(id);
  if (!p) return;
  const wasHolder = p.hasBomb;
  match.players.delete(id);
  // If the bomb holder leaves mid-round, hand the bomb to a random survivor.
  if (wasHolder && match.phase === 'PLAYING') {
    const alive = alivePlayers(match);
    if (alive.length > 0) {
      const next = alive[Math.floor(Math.random() * alive.length)];
      next.hasBomb = true;
      match.lastPassAt = match.time;
    }
  }
}

export function setInput(match, id, dx, dz) {
  const p = match.players.get(id);
  if (!p || !p.alive) return;
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    p.dirX = dx / len;
    p.dirZ = dz / len;
  } else {
    p.dirX = 0;
    p.dirZ = 0;
  }
}

function integrate(match, dt) {
  for (const p of match.players.values()) {
    if (!p.alive) continue;
    p.x += p.dirX * p.speed * dt;
    p.z += p.dirZ * p.speed * dt;
    const lim = ARENA_HALF - PLAYER_RADIUS;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
  }
}

function checkTags(match, events) {
  const holder = bombHolder(match);
  if (!holder) return;
  if (match.time - match.lastPassAt < PASS_COOLDOWN) return;
  for (const p of match.players.values()) {
    if (p.id === holder.id || !p.alive) continue;
    if (Math.hypot(p.x - holder.x, p.z - holder.z) < TAG_RADIUS) {
      holder.hasBomb = false;
      p.hasBomb = true;
      match.lastPassAt = match.time;
      events.push({ kind: 'tag', from: holder.id, to: p.id });
      return;
    }
  }
}

export function startRound(match, holderId = null) {
  const alive = alivePlayers(match);
  for (const p of alive) p.hasBomb = false;
  let holder = holderId ? match.players.get(holderId) : null;
  if (!holder || !holder.alive) {
    holder = alive[Math.floor(Math.random() * alive.length)];
  }
  if (holder) holder.hasBomb = true;
  match.fuse = FUSE_TIME;
  match.lastPassAt = -Infinity;
  match.round += 1;
  return holder ? holder.id : null;
}

export function startMatch(match) {
  for (const p of match.players.values()) {
    p.alive = true;
    p.hasBomb = false;
    const { x, z } = spawnPosition(match);
    p.x = x;
    p.z = z;
  }
  match.phase = 'PLAYING';
  match.winnerId = null;
  match.round = 0;
  return startRound(match);
}

export function resetToLobby(match) {
  match.phase = 'LOBBY';
  match.winnerId = null;
  match.fuse = FUSE_TIME;
  for (const p of match.players.values()) {
    p.alive = true;
    p.hasBomb = false;
  }
}

function tickFuse(match, events) {
  // Note: match.fuse is decremented by update() before this runs.
  const holder = bombHolder(match);
  if (!holder) return;
  if (match.fuse <= 0) {
    holder.alive = false;
    holder.hasBomb = false;
    events.push({ kind: 'explode', playerId: holder.id, x: holder.x, z: holder.z });
    const alive = alivePlayers(match);
    if (alive.length === 1) {
      match.phase = 'MATCH_END';
      match.winnerId = alive[0].id;
      events.push({ kind: 'win', playerId: alive[0].id });
    } else if (alive.length > 1) {
      const newHolder = startRound(match);
      events.push({ kind: 'round', round: match.round, holderId: newHolder });
    } else {
      match.phase = 'MATCH_END';
      match.winnerId = null;
    }
  }
}

// --- Bot steering -----------------------------------------------------------

function nearestOpponent(match, me) {
  let best = null;
  let bestD = Infinity;
  for (const p of match.players.values()) {
    if (p.id === me.id || !p.alive) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Compute a bot's desired movement direction for this tick.
 * - Holding the bomb: chase the nearest living player.
 * - Not holding: flee from the bomb holder, with noise so humans can outplay them.
 * - Near walls: steer back toward the middle so bots don't corner-camp.
 */
export function botSteer(match, bot) {
  let tx;
  let tz;
  if (bot.hasBomb) {
    const target = nearestOpponent(match, bot);
    if (!target) return { dx: 0, dz: 0 };
    tx = target.x;
    tz = target.z;
  } else {
    const holder = bombHolder(match);
    if (!holder) {
      // No bomb in play: drift toward the middle.
      tx = 0;
      tz = 0;
    } else {
      const dx = bot.x - holder.x;
      const dz = bot.z - holder.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = bot.x + (dx / d) * 10;
      tz = bot.z + (dz / d) * 10;
    }
  }

  let dx = tx - bot.x;
  let dz = tz - bot.z;

  // Wall handling: a gentle push back toward the middle, plus "sliding" —
  // when close to a wall and moving into it, redirect along the wall so
  // fleeing bots escape *along* walls instead of pinning themselves to them.
  const H = ARENA_HALF;
  const pushZone = 5;
  const slideZone = 4;
  const edge = H - pushZone;
  if (bot.x > edge) dx -= (bot.x - edge) * 0.9;
  if (bot.x < -edge) dx += (-edge - bot.x) * 0.9;
  if (bot.z > edge) dz -= (bot.z - edge) * 0.9;
  if (bot.z < -edge) dz += (-edge - bot.z) * 0.9;
  const slide = (pos, dir, sign) => {
    // pos: distance coordinate, dir: velocity component into the wall.
    // Returns [keptIntoWall, addedAlongWall].
    const w = Math.min(1, (Math.abs(pos) - (H - slideZone)) / slideZone);
    if (w <= 0) return [dir, 0];
    return [dir * (1 - 0.85 * w), Math.abs(dir) * 1.0 * w * sign];
  };
  let s;
  if (bot.x > H - slideZone && dx > 0) {
    s = slide(bot.x, dx, dz >= 0 ? 1 : -1);
    dz += s[1]; dx = s[0];
  }
  if (bot.x < -(H - slideZone) && dx < 0) {
    s = slide(bot.x, dx, dz >= 0 ? 1 : -1);
    dz += s[1]; dx = s[0];
  }
  if (bot.z > H - slideZone && dz > 0) {
    s = slide(bot.z, dz, dx >= 0 ? 1 : -1);
    dx += s[1]; dz = s[0];
  }
  if (bot.z < -(H - slideZone) && dz < 0) {
    s = slide(bot.z, dz, dx >= 0 ? 1 : -1);
    dx += s[1]; dz = s[0];
  }

  // A little wobble so bots feel alive and humans can juke them.
  const wobble = Math.sin(match.time * 2.3 + bot.noisePhase);
  const px = -dz;
  const pz = dx;
  dx += px * 0.22 * wobble;
  dz += pz * 0.22 * wobble;

  const len = Math.hypot(dx, dz);
  if (len === 0) return { dx: 0, dz: 0 };
  return { dx: dx / len, dz: dz / len };
}

export function stepBot(match, id) {
  const bot = match.players.get(id);
  if (!bot || !bot.isBot || !bot.alive) return;
  const { dx, dz } = botSteer(match, bot);
  setInput(match, id, dx, dz);
}

// --- Main update ------------------------------------------------------------

export function update(match, dt) {
  const events = [];
  if (match.phase !== 'PLAYING') return events;
  match.time += dt;
  integrate(match, dt);
  checkTags(match, events);
  match.fuse -= dt;
  tickFuse(match, events);
  return events;
}

// Serialize a snapshot for the wire (plain JSON, no Maps).
export function snapshot(match) {
  return {
    phase: match.phase,
    fuse: Math.max(0, match.fuse),
    round: match.round,
    time: match.time,
    winnerId: match.winnerId,
    players: playerList(match).map((p) => ({
      id: p.id,
      name: p.name,
      x: +p.x.toFixed(2),
      z: +p.z.toFixed(2),
      color: p.color,
      alive: p.alive,
      hasBomb: p.hasBomb,
      isBot: p.isBot,
    })),
  };
}
