// Unit tests for shared/sim.js — run with `node --test shared/`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_HALF,
  PLAYER_SPEED,
  TAG_RADIUS,
  PASS_COOLDOWN,
  FUSE_TIME,
  createMatch,
  addPlayer,
  setInput,
  startMatch,
  startRound,
  update,
  botSteer,
  stepBot,
  bombHolder,
  alivePlayers,
  snapshot,
} from './sim.js';

function twoPlayerMatch() {
  const m = createMatch();
  addPlayer(m, { id: 'a', name: 'A' });
  addPlayer(m, { id: 'b', name: 'B' });
  m.players.get('a').x = 0; m.players.get('a').z = 0;
  m.players.get('b').x = 5; m.players.get('b').z = 0;
  startMatch(m);
  return m;
}

describe('movement', () => {
  it('moves a player in the input direction', () => {
    const m = twoPlayerMatch();
    const p = m.players.get('a');
    p.x = 0; p.z = 0;
    setInput(m, 'a', 1, 0);
    update(m, 1.0);
    assert.ok(Math.abs(p.x - PLAYER_SPEED) < 0.01, `x=${p.x}`);
    assert.ok(Math.abs(p.z) < 0.01);
  });

  it('clamps players inside the arena', () => {
    const m = twoPlayerMatch();
    const p = m.players.get('a');
    p.x = ARENA_HALF - 0.5; p.z = 0;
    setInput(m, 'a', 1, 0);
    update(m, 5.0);
    assert.ok(p.x <= ARENA_HALF, `x=${p.x}`);
  });

  it('dead players do not move', () => {
    const m = twoPlayerMatch();
    const p = m.players.get('a');
    p.alive = false;
    p.x = 3; p.z = 3;
    setInput(m, 'a', 1, 0);
    update(m, 1.0);
    assert.equal(p.x, 3);
    assert.equal(p.z, 3);
  });
});

describe('tags', () => {
  it('passes the bomb on touch', () => {
    const m = twoPlayerMatch();
    startRound(m, 'a');
    const a = m.players.get('a');
    const b = m.players.get('b');
    a.x = 0; a.z = 0; b.x = TAG_RADIUS / 2; b.z = 0;
    const events = update(m, 1 / 20);
    assert.equal(b.hasBomb, true);
    assert.equal(a.hasBomb, false);
    assert.ok(events.some((e) => e.kind === 'tag' && e.from === 'a' && e.to === 'b'));
  });

  it('blocks instant bounce-backs during the pass cooldown', () => {
    const m = twoPlayerMatch();
    startRound(m, 'a');
    const a = m.players.get('a');
    const b = m.players.get('b');
    a.x = 0; a.z = 0; b.x = TAG_RADIUS / 2; b.z = 0;
    update(m, 1 / 20); // a -> b
    assert.equal(b.hasBomb, true);
    const events = update(m, 1 / 20); // b -> a attempt, still in cooldown
    assert.equal(b.hasBomb, true, 'bomb should stay with b during cooldown');
    assert.ok(!events.some((e) => e.kind === 'tag'));
    update(m, PASS_COOLDOWN + 0.1); // cooldown expired
    assert.equal(a.hasBomb, true, 'bomb passes back after cooldown');
  });

  it('does not tag dead players', () => {
    const m = twoPlayerMatch();
    startRound(m, 'a');
    const b = m.players.get('b');
    b.alive = false;
    b.x = 0.1; b.z = 0;
    m.players.get('a').x = 0; m.players.get('a').z = 0;
    const events = update(m, 1 / 20);
    assert.equal(m.players.get('a').hasBomb, true);
    assert.ok(!events.some((e) => e.kind === 'tag'));
  });
});

describe('fuse and rounds', () => {
  it('exploding holder is eliminated and a new round starts', () => {
    const m = createMatch();
    addPlayer(m, { id: 'a', name: 'A' });
    addPlayer(m, { id: 'b', name: 'B' });
    addPlayer(m, { id: 'c', name: 'C' });
    startMatch(m);
    startRound(m, 'a');
    m.fuse = 0.01;
    const events = update(m, 0.05);
    assert.equal(m.players.get('a').alive, false);
    assert.ok(events.some((e) => e.kind === 'explode' && e.playerId === 'a'));
    assert.equal(m.phase, 'PLAYING', 'match continues with 2 survivors');
    assert.equal(m.fuse, FUSE_TIME, 'fresh fuse for the new round');
    assert.ok(bombHolder(m), 'bomb re-dealt to a survivor');
    assert.equal(bombHolder(m).id === 'a', false);
  });

  it('last player standing wins the match', () => {
    const m = twoPlayerMatch();
    startRound(m, 'a');
    m.fuse = 0.01;
    const events = update(m, 0.05);
    assert.equal(m.phase, 'MATCH_END');
    assert.equal(m.winnerId, 'b');
    assert.ok(events.some((e) => e.kind === 'win' && e.playerId === 'b'));
  });
});

describe('bots', () => {
  function arena() {
    const m = createMatch();
    addPlayer(m, { id: 'bot', name: 'Bot', isBot: true });
    addPlayer(m, { id: 'h', name: 'Human' });
    startMatch(m);
    return m;
  }
  function dealBomb(m, id) {
    for (const p of m.players.values()) p.hasBomb = false;
    m.players.get(id).hasBomb = true;
  }

  it('a bomb-holding bot chases the nearest player', () => {
    const m = arena();
    const bot = m.players.get('bot');
    const h = m.players.get('h');
    bot.x = 0; bot.z = 0; h.x = 10; h.z = 0;
    dealBomb(m, 'bot');
    const before = Math.hypot(h.x - bot.x, h.z - bot.z);
    stepBot(m, 'bot');
    update(m, 0.5);
    const after = Math.hypot(h.x - bot.x, h.z - bot.z);
    assert.ok(after < before, `bot should close distance (${before} -> ${after})`);
  });

  it('a bot without the bomb flees the holder', () => {
    const m = arena();
    const bot = m.players.get('bot');
    const h = m.players.get('h');
    bot.x = 0; bot.z = 0; h.x = 3; h.z = 0;
    dealBomb(m, 'h');
    const before = Math.hypot(h.x - bot.x, h.z - bot.z);
    stepBot(m, 'bot');
    update(m, 0.5);
    const after = Math.hypot(h.x - bot.x, h.z - bot.z);
    assert.ok(after > before, `bot should flee (${before} -> ${after})`);
  });

  it('wall avoidance steers bots away from edges', () => {
    const m = arena();
    const bot = m.players.get('bot');
    const h = m.players.get('h');
    bot.x = ARENA_HALF - 1; bot.z = 5; // hugging the right wall
    h.x = ARENA_HALF - 1; h.z = -10; // holder far below: flee pulls in +z only
    dealBomb(m, 'h');
    const { dx } = botSteer(m, bot);
    assert.ok(dx < 0, `bot near right wall should steer left, dx=${dx}`);
  });

  it('cornered bots slide along walls instead of into them', () => {
    const m = arena();
    const bot = m.players.get('bot');
    const h = m.players.get('h');
    bot.x = ARENA_HALF - 1; bot.z = 0; // against the right wall
    h.x = 9; h.z = 0; // holder to the left: flee drives straight into the wall
    dealBomb(m, 'h');
    const { dx, dz } = botSteer(m, bot);
    assert.ok(
      Math.abs(dz) > Math.abs(dx),
      `bot should turn along the wall, dx=${dx}, dz=${dz}`
    );
  });
});

describe('snapshot', () => {
  it('serializes to plain JSON with no Maps', () => {
    const m = twoPlayerMatch();
    const s = snapshot(m);
    assert.equal(s.phase, 'PLAYING');
    assert.equal(s.players.length, 2);
    JSON.stringify(s); // must not throw
    assert.ok(s.players.every((p) => typeof p.x === 'number'));
  });
});
