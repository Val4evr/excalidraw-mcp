# excalidraw-mcp

Slim MCP server that drives a self-hosted [excalidraw-zephy](https://github.com/Val4evr/excalidraw-zephy) canvas. Tools accept per-call room overrides, so one shim can serve any number of rooms — point it at a default at install time, or set/switch rooms mid-session.

## Install (Claude Code)

The simplest form — paste any share link:

```bash
claude mcp add excalidraw -s user \
  --env ROOM_URL=https://draw.example.com/r/<room-id> \
  -- npx -y --package=github:Val4evr/excalidraw-mcp excalidraw-mcp
```

`ROOM_URL` is just the URL you'd open in the browser. The shim splits it into
the canvas server URL and the room id automatically.

You can also install with no env var at all and switch rooms at runtime:

```bash
claude mcp add excalidraw -s user \
  -- npx -y --package=github:Val4evr/excalidraw-mcp excalidraw-mcp
```

…then call the `set_room` tool with `{ "roomUrl": "https://..." }` to set the
active room, or pass `roomUrl` / `roomId` on any individual tool call to
override per-call.

The legacy split form is still accepted for backwards compatibility:

```bash
--env ROOM_ID=<your-room-id>
--env EXPRESS_SERVER_URL=https://draw.example.com
```

(The dashboard's **Copy MCP install command** button still emits this form.)

## Develop

```bash
npm install
npm run build
ROOM_URL=https://draw.example.com/r/test node dist/index.js
```

The shim speaks MCP over stdio; it makes HTTP calls to the canvas at
`${expressUrl}/api/r/${roomId}/...` where the two pieces come from `ROOM_URL`,
the legacy split env vars, or per-call overrides.

## Reading large boards

`describe_scene` is intentionally bounded by default. A large canvas returns a
summary, a spatial section index, and prominent text instead of dumping every
element into the model context.

Useful calls:

```json
{ "detail": "overview" }
{ "detail": "elements", "sectionIndex": 2, "limit": 60 }
{ "detail": "elements", "types": ["text"], "textIncludes": "SESSION" }
{ "detail": "connections", "sectionIndex": 4 }
{ "detail": "full" }
```

Use `detail: "full"` only when you truly need the legacy complete dump. For
most canvas-reading workflows, start with the overview and page into sections
with `sectionIndex`, `offset`, and `limit`.
