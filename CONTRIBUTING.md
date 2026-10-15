# Contributing to Hot Fuse Arena

Thanks for stopping by! This is a small, friendly open-source game. Here's how
to help.

## Quick start
1. Fork the repo and clone your fork.
2. No build step for the client — just open the pieces you need:
   - Game logic: `shared/` (pure JS, tested with `node --test shared/`)
   - Server: `worker/` (Cloudflare Workers + Durable Objects)
   - Client: `client/` (Three.js via CDN import map)
3. Run the tests: `npm test`
4. Local server: `npx wrangler dev` (needs wrangler; see README "Developing").

## Ground rules
- **Game logic lives in `shared/sim.js`** and must stay platform-free (no DOM,
  no Workers APIs) so it stays unit-testable. The worker imports it; the client
  never does.
- **The server is authoritative.** Never trust the client for positions, tags,
  or the fuse. Client-side changes should be presentation only.
- **Add a test** for any change to `shared/sim.js` (`node --test shared/`).
- Keep the art procedural and original — no copied assets, ever.
- Write commit messages in conventional style: `feat:`, `fix:`, `docs:`,
  `test:`, `chore:`, optionally scoped (`feat(client): …`).

## Good first issues
Look for the `good first issue` label: mobile touch controls, a second arena
map, sound effect packs. They're scoped to be finishable in an evening.

## Pull requests
- One focused change per PR, with a clear description and a screenshot/GIF for
  visual changes.
- CI runs the test suite; make sure it's green before requesting review.
- Be kind in review — we're all here because exploding blocky robots are funny.
