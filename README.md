# 🔥 Hot Fuse Arena

A real-time **3D multiplayer hot-potato bomb game** in the browser. One bomb,
one 20-second fuse, up to 8 players in a neon arena. Holding it when the fuse
hits zero? Boom. Tag someone to pass it on. Last player standing wins.

No installs, no accounts — open the link, pick a name, play.

## How to play
1. **Create a room** and share the 4-letter code (or the invite link) with friends.
2. **Run** with WASD / arrow keys. Touch another player to pass the bomb.
3. **Survive.** Each explosion eliminates the holder; rounds restart instantly
   until one player remains.
4. Playing solo? The room **auto-fills with AI bots** — they chase, flee, and
   pass just like humans.

## How it works
- **Client:** Three.js (CDN, no build step) — procedural low-poly arena, capsule
  players, glowing bomb, particle explosions, screen shake, WebAudio fuse beeps.
- **Server:** Cloudflare Workers + Durable Objects. One Durable Object per room
  owns the authoritative match: a 20Hz game loop integrates movement, runs bot
  steering, checks tags, ticks the fuse, and broadcasts snapshots.
- **Shared simulation** (`shared/`) is pure JS with zero platform dependencies,
  unit-tested with `node --test`.

See [docs/game-design.md](docs/game-design.md) for rules and
[docs/protocol.md](docs/protocol.md) for the WebSocket protocol.

## Developing locally
```bash
npm test              # run the simulation unit tests
npx wrangler dev      # serve client + worker locally with live reload
```

## Deploying (GitHub → Cloudflare)
Pushes to `main` deploy automatically via `.github/workflows/deploy.yml`.
First, add two secrets under repo **Settings → Secrets and variables → Actions**:

| Secret | Where to find it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → create one with Workers + Durable Objects access |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Overview (right sidebar) |

That's it — push to `main` and the workflow tests, then deploys.

## Contributing
Ideas welcome! Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the
[`good first issue`](https://github.com/saiannotations/hot-fuse-arena/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
label. All art and code here is original, MIT licensed.
