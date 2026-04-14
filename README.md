<div align="center">
<h1>📌 Pinpoint</h1>

<p>Universal visual annotation for AI coding agents</p>
</div>

---

Screenshot anything — web pages, iOS simulators, macOS apps, design mockups — annotate specific regions with pins and comments, and get structured feedback that Claude can act on. No modification to the target app required.

## Install

```bash
bun install pinpoint-mcp
```

## Usage

### Claude Code (stdio)

Add to `~/.claude/mcp.json`:

```json
{
  "pinpoint": {
    "command": "bun",
    "args": ["/path/to/pinpoint-mcp/src/main.ts", "--stdio"]
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `create_review` | Open screenshots for annotation. Auto-opens browser. |
| `add_image` | Add another screenshot to an existing review. |
| `get_annotations` | Get structured feedback (coordinates, comments, severity). |
| `list_reviews` | List all review sessions. |
| `resolve_annotation` | Mark an annotation as resolved. |

### Workflow

1. Capture a screenshot (via Playwright, Chrome DevTools MCP, `screencapture`, etc.)
2. Claude calls `create_review` — browser opens with the annotation UI
3. Click to pin, drag to box, type your feedback
4. Claude calls `get_annotations` to read structured feedback
5. Claude fixes the issues → repeat

### Multi-image

Pass multiple paths to `create_review` or use `add_image` to add screenshots incrementally. The UI shows a filmstrip for switching between images. Annotations are per-image.

## Requirements

- [Bun](https://bun.sh) 1.2+

## License

[MIT](LICENSE)
