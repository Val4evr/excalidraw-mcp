# excalidraw-mcp

Slim MCP server that drives a self-hosted [excalidraw-zephy](https://github.com/Val4evr/excalidraw-zephy) canvas — one room per shim, configured via env vars.

## Install (Claude Code)

```bash
claude mcp add excalidraw -s user \
  --env ROOM_ID=<your-room-id> \
  --env EXPRESS_SERVER_URL=https://draw.example.com \
  -- npx -y --package=github:Val4evr/excalidraw-mcp excalidraw-mcp
```

`ROOM_ID` is the id from your dashboard. `EXPRESS_SERVER_URL` is the canvas
server's URL (the dashboard will give you the right install command with both
substituted).

The dashboard's **Copy MCP install command** button emits the exact line above.

## Develop

```bash
npm install
npm run build
ROOM_ID=test EXPRESS_SERVER_URL=http://localhost:3000 node dist/index.js
```

The shim speaks MCP over stdio; it makes HTTP calls to the canvas at
`${EXPRESS_SERVER_URL}/api/r/${ROOM_ID}/...`.

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
