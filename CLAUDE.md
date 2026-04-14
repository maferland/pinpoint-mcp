# Pinpoint MCP

MCP server + browser annotation UI for visual feedback.

## Commands

```bash
bun install          # install deps
bun test             # run tests (bun:test)
bun run build        # typecheck → vite singlefile → bun bundle
bun run dev          # watch mode
bun run typecheck    # tsc --noEmit
```

## Running

```bash
bun src/main.ts --stdio   # MCP stdio + HTTP server on :4747
bun src/main.ts           # HTTP-only mode
PINPOINT_PORT=8080 bun src/main.ts  # custom port
```

## Constraints

- HTTP server always runs on port 4747 (override with `PINPOINT_PORT`)
- Annotation coordinates are percentages (0-100), not pixels
- `images` array (not singular `image`) — supports multi-screenshot reviews
- Canvas uses `hsl(var(--canvas-letterbox))` from CSS for theme support
- Tailwind v4 — custom colors use `hsl(var(--variable))` pattern in global.css, NOT `@theme`
