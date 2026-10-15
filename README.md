# Hot Fuse Arena

A real-time 3D multiplayer hot-potato bomb game that runs entirely in the browser.

One bomb, one 20-second fuse, up to 8 players in a 3D arena. If you're holding the bomb when the fuse hits zero, you explode. Tag someone else to pass it on. Last player standing wins.

- **Play:** open the game URL, create a room, share the code with friends.
- **Controls:** WASD or arrow keys to run. That's it.
- **Solo?** AI bots auto-fill empty slots — they chase, flee, and pass just like humans.

Built with Three.js on the client and Cloudflare Workers + Durable Objects (WebSockets) on the server. Deploys straight from GitHub.

> **Status:** early but playable. See [docs/game-design.md](docs/game-design.md) for rules and [CONTRIBUTING.md](CONTRIBUTING.md) if you want to help.
