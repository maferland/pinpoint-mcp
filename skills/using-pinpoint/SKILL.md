---
name: using-pinpoint
description: Use when reviewing UI visually, getting design feedback, or when the user wants to annotate screenshots. Triggers on "review this page", "what's wrong with this UI", "annotate", "visual feedback", screenshot review workflows, or after making UI changes that need verification.
---

# Pinpoint — Visual Annotation MCP

Pinpoint lets the user annotate screenshots in their browser and sends structured feedback back to you.

## When to Use

- After making UI/CSS/layout changes — let the user verify visually
- When the user says "review this", "check this page", "what do you think of the UI"
- When you need precise visual feedback (not just "the button looks off")
- For design review workflows — compare before/after screenshots
- When debugging visual bugs — user points at exactly what's wrong

## Workflow

### 1. Capture a screenshot

Use whatever screenshot tool is available:

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

### 2. Open for annotation

```
create_review({ images: "/tmp/screenshot.png", context: "Login page after auth changes" })
```

This auto-opens the browser. Tell the user:
> "I've opened the annotation UI in your browser. Click to pin areas, drag to highlight regions, and type your feedback. Come back when you're done."

For multiple screenshots:
```
create_review({ images: ["/tmp/before.png", "/tmp/after.png"], context: "Header redesign — before and after" })
```

### 3. Wait for the user

The user annotates in the browser. **Do not call `get_annotations` until the user says they're done** (e.g., "done", "finished", "go", "check it").

### 4. Read annotations

```
get_annotations({ reviewId: "abc123" })
```

Returns structured feedback:
```
#1 [fix/blocking] box(10.2%, 5.3%, 35.0%x12.5%): Button text is truncated on mobile
#2 [change/suggestion] pin(60.0%, 80.1%): Footer spacing too tight
```

Each annotation has:
- **Number** — order placed
- **Intent** — fix (bug), change (enhancement), question (unclear), approve (looks good)
- **Severity** — blocking, important, suggestion
- **Location** — pin(x%, y%) or box(x%, y%, w%xh%) as percentages of image
- **Comment** — the user's feedback

### 5. Fix and iterate

Fix the issues, take a new screenshot, open another review:

```
add_image({ reviewId: "abc123", image: "/tmp/after-fix.png" })
```

Or create a fresh review for a new round.

## Tips

- Always provide `context` — it shows in the toolbar and helps the user orient
- Use `add_image` to build up multi-screenshot reviews incrementally
- Annotations are per-image — switching images shows only that image's pins
- The user can toggle dark/light theme in the toolbar
- Coordinates are percentages (0-100), not pixels — resolution independent
- `resolve_annotation` marks issues as fixed — useful for tracking progress across rounds

## Do NOT

- Don't call `get_annotations` before the user says they're done
- Don't guess what the user sees — let them annotate and tell you
- Don't create reviews without screenshots — always capture first
- Don't open multiple reviews simultaneously — one at a time
