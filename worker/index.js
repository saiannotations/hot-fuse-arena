// Hot Fuse Arena — Cloudflare Worker entry point.
// Routes: /api/create (new room code), /room/<CODE>/ws (Durable Object),
// everything else -> static client assets.
import { GameRoom } from './room.js';

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no lookalikes
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/create') {
      const code = genCode();
      return Response.json({ code });
    }

    if (url.pathname.startsWith('/room/')) {
      const code = (url.pathname.split('/')[2] || '').toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) {
        return new Response('Invalid room code', { status: 400 });
      }
      const id = env.GAME_ROOMS.idFromName(code);
      const stub = env.GAME_ROOMS.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export { GameRoom };
