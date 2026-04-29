<div align="center">

<img src="assets/icon.png" width="128" height="128" alt="Pinpoint">

<h1>Pinpoint</h1>

<p>Visual annotation for AI coding agents</p>
</div>

---

<p align="center">
  <img src="assets/screenshot-light.png" width="720" alt="Pinpoint annotation UI">
</p>

Point at what's wrong. Claude fixes it.

Pinpoint opens a browser UI where you click to pin and drag to box regions on any screenshot. Your annotations flow back to Claude as structured feedback — coordinates and comments — so it can fix exactly what you pointed at.

Works with any visual surface: web pages, iOS simulators, macOS apps, Storybook, design mockups. No target app modification needed.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/maferland/pinpoint-mcp/main/install.sh | bash
```

<details>
<summary>Manual install</summary>

```bash
git clone https://github.com/maferland/pinpoint-mcp.git ~/.pinpoint-mcp
cd ~/.pinpoint-mcp && bun install && bun run build
bun link                                                  # exposes `pinpoint` on PATH
claude plugin marketplace add ~/.pinpoint-mcp             # registers the slash command
claude plugin install pinpoint-mcp@pinpoint-marketplace
claude mcp add pinpoint -- bun ~/.pinpoint-mcp/src/main.ts --stdio   # optional, MCP back door
```
</details>

Restart Claude Code. Then run a slash command:

> `/pinpoint-review /tmp/screenshot.png`

The browser opens, you annotate, click **Done**, and the structured JSON lands directly in the conversation.

## How It Works

**You** annotate in the browser:
- **Click** anywhere → places a pin with a small highlight box
- **Drag** → draws a rectangular region
- Click a pin → popover with a textarea, type your note
- **⌘Enter** saves, **Esc** cancels
- Multiple screenshots → filmstrip with arrow keys to switch
- Click **Done** in the toolbar → sends annotations back and closes the loop

**Claude** reads structured feedback:
```json
{
  "annotations": [
    { "number": 1, "image": "/tmp/screenshot.png",
      "box": { "x": 10.2, "y": 5.3, "width": 35.0, "height": 12.5 },
      "comment": "Button text is truncated on mobile" }
  ]
}
```

## CLI

```
pinpoint review <image>... [--context "..."] [--port N]
```

Spawns the annotation server, opens the browser, blocks until you click **Done**, prints the structured JSON to stdout. The `/pinpoint-review` slash command wraps this.

## MCP Tools (alternative, non-interactive)

| Tool | Description |
|------|-------------|
| `create_review` | Create a review and open the browser. |
| `add_image` | Add another screenshot to an existing review. |
| `get_annotations` | Read structured feedback — coordinates and comments. |
| `list_reviews` | List all review sessions. |

## Requirements

- [Bun](https://bun.sh) 1.2+
- [Claude Code](https://claude.ai/code)

## Credits

Architecture inspired by [plannotator](https://github.com/backnotprop/plannotator) — slash command that shells out to a CLI binary, blocks until the user signals done, and pipes structured stdout back into the conversation. Pinpoint applies that pattern to image annotation.

## License

[MIT](LICENSE)
