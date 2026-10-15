# Hot Fuse Arena — Game Design

## The fantasy
You're in a neon arena with a live bomb. It's strapped to *someone*. Don't let
that someone be you when the fuse burns out.

## Rules (plain English)
- **2–8 players** per room: any mix of humans and AI bots.
- At the start of each round, the bomb appears on a **random player** with a
  **20-second fuse**.
- **Touch another player to pass the bomb.** After a pass, there's a **1.5s
  cooldown** so two players can't just bounce it back and forth instantly.
- When the fuse hits zero, the holder **explodes** and becomes a spectator.
- A new round starts immediately with the survivors and a fresh fuse.
- **Last player standing wins** the match and gets a crown. Then: rematch.

## Controls
WASD or arrow keys to run. That's the whole game — positioning is everything.

## Bots (fair play)
- Rooms auto-fill with bots up to 4 players when the host starts short-handed.
- A bot **holding** the bomb chases the nearest living player.
- A bot **not holding** it flees from the holder, with a little wobble so
  humans can fake them out, and steering that avoids walls.
- Bots never see anything a human couldn't: same positions, same fuse, same
  20Hz snapshots. They don't predict the future and they don't cheat.

## Feel
The bomb glows brighter and beeps faster as the fuse burns down. Explosions
are a particle burst plus screen shake. These are all client-side juice — the
server only sends positions, fuse time, and events.

## What's deliberately *not* in the game
No powerups, no teams, no score persistence — the design goal is "explain it in
ten seconds, play it for an hour." Those ideas live in the issue tracker as
future work.
