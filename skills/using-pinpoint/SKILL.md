---
name: using-pinpoint
description: Use when reviewing UI visually, getting design feedback, or when the user wants to annotate screenshots. Triggers on "review this page", "what's wrong with this UI", "annotate", "visual feedback", screenshot review workflows, or after making UI changes that need verification.
---

# Pinpoint — Visual Annotation CLI

Pinpoint lets the user annotate screenshots in their browser and returns structured feedback for you to act on.

## When to Use

- After making UI/CSS/layout changes — let the user verify visually
- When the user says "review this", "check this page", "what do you think of the UI"
- When you need precise visual feedback (not just "the button looks off")
- For design review workflows — compare before/after screenshots
- When debugging visual bugs — user points at exactly what's wrong

## Workflow

### 1. Capture a screenshot

Use whatever screenshot tool fits the platform:

```bash
# Chrome DevTools MCP
mcp__chrome-devtools__take_screenshot --filePath /tmp/screenshot.png

# Playwright MCP
mcp__playwright__browser_take_screenshot --path /tmp/screenshot.png

# macOS native
screencapture -x /tmp/screenshot.png

# iOS Simulator
xcrun simctl io booted screenshot /tmp/screenshot.png
```

### 2. Tell the user to run the slash command

```
/pinpoint-review /tmp/screenshot.png
```

Multiple images:

```
/pinpoint-review /tmp/before.png /tmp/after.png
```

With context:

```
/pinpoint-review /tmp/screenshot.png --context "Login page after auth changes"
```

The slash command opens the browser, blocks until the user clicks **Done**, and returns the annotations directly into the conversation. You don't poll, wait, or call any tool — the output appears as part of the slash command's body.

### 3. Read the returned JSON and act

Output looks like:

```json
{
  "context": "Login page after auth changes",
  "images": [{ "path": "/tmp/screenshot.png", "width": 1440, "height": 900 }],
  "annotations": [
    {
      "number": 1,
      "image": "/tmp/screenshot.png",
      "imageIndex": 0,
      "pin": { "x": 60.0, "y": 80.1 },
      "box": { "x": 60.0, "y": 80.1, "width": 12.0, "height": 5.0 },
      "comment": "Footer spacing too tight"
    }
  ]
}
```

Each annotation has:
- **number** — order placed
- **image** — absolute path to the image
- **pin** + optional **box** — position as percentages (0–100) of image dimensions
- **comment** — the user's feedback

Classify intent (bug, change request, question, approval) yourself from the comment text. There's no severity field — judge urgency from wording.

### 4. Fix and iterate

After making fixes, ask the user to re-run `/pinpoint-review` with a fresh screenshot.

## MCP fallback

There's also an MCP server (`pinpoint-mcp`) exposing `create_review`, `add_image`, `get_annotations`, `list_reviews` — useful for non-interactive scripting. The CLI is the recommended path; only reach for MCP if you need to programmatically build a review without user interaction.

## Tips

- Always provide `--context` — it shows in the toolbar and helps the user orient
- Coordinates are percentages — resolution-independent
- The user can switch dark/light theme in the toolbar
- Box-drag covers a region; click drops a pin at one point

## Do NOT

- Don't tell the user to type "done" — clicking Done in the UI handles the handoff
- Don't try to call MCP tools mid-review — the CLI blocks the conversation until Done
- Don't guess what the user sees — let them annotate
