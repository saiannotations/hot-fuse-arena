# Hot Fuse Arena — WebSocket Protocol

All messages are JSON. The server is authoritative: clients send intents,
the server sends the truth.

## Client → Server

| Message | Fields | Meaning |
|---|---|---|
| `join` | `name`, `playerId?` | Join the room. Pass `playerId` to reconnect to an existing seat. |
| `input` | `keys: {up,down,left,right}` | Current movement keys. Send on change (plus a 250ms heartbeat). |
| `chat` | `text` | Chat message (max 200 chars). |
| `start` | — | Start the match (lobby only). Bots auto-fill to 4 players. |
| `add_bot` | — | Add an AI bot (lobby only). |
| `rematch` | — | Back to lobby after a match ends. |

## Server → Client

| Message | Fields | Meaning |
|---|---|---|
| `welcome` | `playerId`, `rejoin?` | Your player id. Save it for reconnects. |
| `snapshot` | `phase`, `fuse`, `round`, `time`, `winnerId`, `players[]` | Full authoritative state, ~20Hz while playing. |
| `event` | `kind`, … | One-shot events: `tag {from,to}`, `explode {playerId,x,z}`, `win {playerId}`, `round {round,holderId}`. |
| `chat` | `from`, `text` | Chat line (`from: "system"` for announcements). |
| `error` | `message` | e.g. room full. |

`players[]` entries: `{id, name, x, z, color, alive, hasBomb, isBot}`.
`phase` is one of `LOBBY`, `PLAYING`, `MATCH_END`.

## Connection flow

1. `GET /api/create` → `{code}` (or open `#CODE` link directly).
2. Open WebSocket to `/room/<CODE>/ws`.
3. Send `{t:"join", name}` → receive `{t:"welcome", playerId}`.
4. Lobby snapshots arrive; host sends `{t:"start"}`.
5. During play: stream `input`, render `snapshot`s, react to `event`s.
6. On `MATCH_END`, send `{t:"rematch"}` to return to the lobby.
