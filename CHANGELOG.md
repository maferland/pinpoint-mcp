## [v0.14.0]

- **Upgrade in one command: `pinpoint update`.** No more re-running the install script by hand to get the latest — it pulls, rebuilds, and relinks in place.

## [v0.13.0]

- **Pinpoint now plugs in through the CLI and the `/pinpoint:review` slash command; the MCP server is gone.** If you had it wired in as an MCP server, point your setup at the `pinpoint` binary or the slash command instead.

## [v0.12.0]

- **Paste a screenshot straight into a comment.** Clipboard images show up as a removable thumbnail beneath the text, with a click-to-zoom preview.
- **Pasted images reach your agent as real files.** The finalized JSON includes a file path for each attachment, so the agent can read it directly instead of just seeing a description.
- **Attachments survive export and reopen.** `pinpoint export`/`open` bundle pasted images into the `.pinpoint.zip`, so nothing gets lost in a handoff.

## [v0.11.0]

- **Escape no longer deletes your pin.** Cancelling out of a fresh annotation could wipe it entirely instead of just closing the popover.
- **Comments rail updates as you type.** A pin's comment used to only show up in the rail after you saved or closed it; now it's live.
- **Comments rail no longer goes blank in compare mode.** Pins on a before/after pair weren't showing up in the rail at all.
- **Keyboard shortcuts, not a demo pitch.** The `?` help panel is now a straight shortcuts reference, including the previously-undocumented `Tab` to flip Before/After.
- **Settings button toggles correctly.** A second click now closes the panel instead of silently reopening it.
- **Fit / Full size hides itself when there's nothing to toggle.** Previously you could click between the two with no visible difference.
- **Richer agent context.** `--context` now accepts JSON (`message`/`url`/`path`/`branch`), so the "From your agent" card shows a clickable URL and file path instead of just a sentence.

## [v0.10.0]

- **Single-image compare mode.** Comparison slots now have a floating menu button (top-right) to toggle between split and single view. Single mode shows one full-width image at a time — click Before/After in the menu or press Tab to flip. Press S to toggle the mode without touching the mouse. Preference is saved across sessions.
- **Dot grid on the canvas background.** The letterbox area now has a subtle dot pattern so floating UI reads as app chrome rather than blending into the screenshot.

## [v0.9.0]

- **Mix comparisons and standalone images in one session.** `--pair before after` (repeatable) creates side-by-side Before/After slots; positional args stay as normal single-image slots. One thumbnail strip, arrow key navigation across everything. `--compare` still works as an alias for a single pair.
- **Comment box grows as you type.** No more fixed two-line textarea that clips long feedback.
- **Annotations no longer lost when hitting Send without blurring first.** Two bugs fixed: the Save button now flushes pending changes before finalizing, and `persistAnnotations` was being called inside a React setState updater (deferred), meaning the flush could read a stale snapshot.

## [v0.8.4]

- **Side-by-side comparison mode.** Pass `--compare` with two screenshots and the annotator opens them in Before/After panes — each independently annotatable. The returned JSON gains a `side: "before" | "after"` field on every annotation so the agent knows which image was targeted without decoding `imageIndex`.

## Unreleased

- **Breaking: slash command rename.** `/pinpoint-review` is now `/pinpoint:review`. Claude Code auto-namespaces plugin commands via the plugin's `name` field, so the longstanding outlier moves under the same prefix as the new commands.
- **New: `/pinpoint:install` and `/pinpoint:demo`.** Install path: `/plugin marketplace add maferland/pinpoint` → `/plugin install pinpoint@pinpoint-marketplace` → `/pinpoint:install`. The demo command opens a bundled sample session so first-run no longer needs your own screenshot.
- **Landing site at pinpoint.maferland.com.** Single static page hosting `install.sh`, hero, the loop walkthrough, sharing flow, and an in-Claude install snippet. Dark mode toggle in nav; image swaps with the theme.

## [v0.8.3]

- **Fit mode shows the whole phone screenshot again.** On a wide window, tall portrait captures stopped fitting and got cut off at the bottom with a scrollbar; now they scale to your window height, fully visible.

## [v0.8.2]

- **Empty pins clean up after themselves.** Closing a popover with no comment now removes the pin instead of leaving a numbered marker.

## [v0.8.1]

- **Commit messages can mention `pinpoint review &` again.** v0.8.0's matcher tripped on the pattern inside quoted strings like `--notes` flags.

## [v0.8.0]

- **Your pins don't vanish when an agent backgrounds the review.** Detached invocations (`&`, `nohup`, `disown`) used to drop the annotation JSON; Pinpoint blocks them upfront now.

## [v0.7.0]

- **Massive screenshots now render correctly.** Stitched-scroll captures and ultra-wide panoramas no longer go blank past the browser's canvas limit (~16k px). The image downsamples gracefully on the long axis and scrolls.
- **Sharper pins on huge images.** Pin numbers and box borders moved to a DOM overlay so they stay crisp at native DPR even when the image canvas downsamples.
- **Scroll hints with clickable arrows.** When the image extends past the viewport, a subtle fade and a chevron button appear on that edge — click to page through 80% at a time.
- **Smarter fit mode.** Extreme aspect ratios route through single-axis fit instead of collapsing to an unreadable sliver (an 85k-px-tall capture used to render as 4 pixels wide).

## [v0.6.0]

- **Export and import review sessions.** Run `pinpoint export <reviewId>` to bundle pins and raw image bytes into a `.pinpoint.zip`, and `pinpoint open <file.pinpoint.zip>` to load someone else's review into your local store. Use `--mode replace|append|new` to control how an existing review with the same id gets merged.

## [v0.5.0]

- **Fit / Actual view modes.** Toggle between fitting the image into the viewport and seeing it at native resolution.
- **Draggable details panel.** Reposition the pin list anywhere on screen.
- **Hotkeys overlay.** Press `?` to see all keyboard shortcuts.
- **Settings popover.** Preferences moved into an in-canvas popover instead of the menu bar.

## [v0.4.2]

- **Drag-to-box no longer cancels at the image edge.** The box clamps to the boundary, and drags are tracked at the window level so releases outside the canvas don't abandon the in-progress box.

## [v0.4.1]

- **Tall and wide images stop getting squashed.** Single-axis fit kicks in for extreme aspects so content stays legible.
- **Done button shows the total comment count across all images** instead of just the active one.

## [v0.4.0]

- **In-app update banner.** Pinpoint now polls GitHub Releases and prompts you to upgrade when a new version is available, with the install command one click away.

## [v0.3.1]

- **Preferences moved to `~/.config/pinpoint`.** Settings persist in a stable location instead of a temp directory.
- **`install.sh` hardened.** Safer fetch + apply against partial downloads and missing dependencies.

## [v0.3.0]

- **Self-describing Done button.** Reads "Looks good" when there are no pins, "Send N comments" otherwise.
- **New toolbar and README icon** — pin + crosshair design.
- **Server-side auto-close preference** so the setting persists across sessions.
- **Test pyramid filled out** — unit, integration, e2e — and fast-exit / click-outside-to-save behavior.
