# Pinpoint

Browser annotation UI for visual feedback. Primary surface: `/pinpoint:review` slash command via the `pinpoint` CLI binary. Direct CLI invocation works from any shell for non-interactive scripting.

## Commands

```bash
bun install          # install deps
bun test             # run unit/integration tests (bun:test)
bun run build        # typecheck → vite singlefile → bun bundle (CLI + UI)
bun run dev          # watch mode
bun run typecheck    # tsc --noEmit
verdict run          # LLM behavior tests for the using-pinpoint skill
```

## Running

```bash
# CLI (the primary entry point — slash command wraps this)
pinpoint review <image>... [--context "..."] [--port N]

# Export a review session as a .pinpoint.zip (review.json manifest + raw image bytes)
pinpoint export <reviewId> [--output FILE|-]

# Open a .pinpoint.zip from someone else — prompts for merge mode if id collides
pinpoint open <bundle.pinpoint.zip> [--mode replace|append|new] [--port N]

# Share a review across networks — encrypts locally, prints a link, relay only ever sees ciphertext
pinpoint share <reviewId> [--ttl DAYS] [--server URL]

# Open a share link the same way you'd open a bundle file
pinpoint open <share-link> [--mode replace|append|new] [--port N]

# Update in place — runs the installed checkout's install.sh (pull + rebuild + relink)
pinpoint update

# HTTP-only mode (legacy / dev)
bun src/main.ts                     # starts on :4747
PINPOINT_PORT=8080 bun src/main.ts  # custom port
```

## Architecture

- `src/cli.ts` — `pinpoint review` CLI; spawns HTTP server, opens browser, blocks on `waitForFinalize`, prints JSON to stdout
- `src/main.ts` — HTTP server (UI + REST API: GET review, GET image, PUT annotations, POST finalize)
- `src/store.ts` — file-based review persistence under `os.tmpdir()/pinpoint:reviews/`
- `src/share-crypto.ts` — AES-256-GCM encrypt/decrypt for `pinpoint share`/`open <url>`; key never leaves the client
- `src/share-transport.ts` — inline-vs-Supabase tier selection, share link build/parse, RPC calls
- `src/share-config.ts` — Supabase URL + publishable key baked into the CLI and `/s` bundle (public by design)
- `commands/pinpoint:review.md` — slash command (`disable-model-invocation: true`) that shells out to `pinpoint review`
- `skills/using-pinpoint/SKILL.md` — guidance for Claude on when/how to use the slash command
- `supabase/migrations/` — the `shares` mailbox table + security-definer RPCs (`create_share`/`get_bundle`/`put_response`/`get_response`) + `pg_cron` daily purge that back the larger-than-inline tier

## Constraints

- HTTP server defaults to port 4747 (override with `PINPOINT_PORT`); CLI uses port 0 (random) by default
- Annotation coordinates are percentages (0-100), not pixels
- `images` array (not singular `image`) — supports multi-screenshot reviews
- Annotations are `{ id, number, imageIndex, pin, box?, comment, attachments? }` — no intent/severity/status fields. Claude classifies from the comment text.
- Pasted-image attachments are stored raw (no file extension) under the review's own storage dir and served with a sniffed mime type — see `src/image-sniff.ts`
- Canvas uses `hsl(var(--canvas-letterbox))` from CSS for theme support
- Tailwind v4 — custom colors use `hsl(var(--variable))` pattern in global.css, NOT `@theme`
- Share links are the credential — whoever has the full link (including the `#` fragment) can decrypt. The relay (inline URL or Supabase) only ever sees ciphertext; the AES key lives in the fragment and is never sent over HTTP
- Bundles whose encoded ciphertext exceeds ~6000 chars go through the Supabase relay instead of inlining in the URL; the RPCs reject payloads over ~8 MB of base64
- Supabase access is RPC-only: RLS denies direct table reads/writes, and the security-definer functions take a client-generated share id, so rows can't be enumerated with the public key

## Releasing

Two delivery paths:
- `install.sh` does `git pull` + rebuild from `main` — fresh installs and manual re-runs get latest immediately, no tag required. Existing installs run it via `pinpoint update`, and the in-app banner copies that command.
- In-app update banner (`src/use-update-check.ts`) polls the GitHub Releases API and only fires on a new `vX.Y.Z` tag. Without a tag, existing users on the prior version won't be prompted.

### Writing CHANGELOG entries

The `## [vX.Y.Z]` section is what the reader sees in the release body and the upgrade banner. Five seconds to scan.

- **Lead with the outcome, not the mechanism.** ❌ "A hook blocks detached invocations." ✅ "Your pins don't vanish when an agent backgrounds the review."
- **One bullet, one sentence after the headline.** Need more? Split into two bullets.
- **Concrete > generic.** "85k-pixel-tall scroll", not "very large images".
- **No implementation detail unless it is the outcome.**
- **Run `/humanizer` before committing.** If it rewrites a line, that line was slop.

### Cutting a release

Cut a release when you want the banner to surface a change. Steps (run from `main` after the fix is merged):

```bash
# 1. Bump version in package.json (patch for bug fixes, minor for features)
# 2. Add a `## [vX.Y.Z]` section at the top of CHANGELOG.md — user-facing bullets,
#    not implementation detail. release.yml fails the build if this section is missing.
# 3. Commit both
git add package.json CHANGELOG.md && git commit -m "vX.Y.Z"
# 4. Tag and push — release.yml extracts the CHANGELOG section as the release body
git tag vX.Y.Z && git push origin main vX.Y.Z
```

The `__APP_VERSION__` constant baked into the bundle comes from `package.json`'s `version` field (see `vite.config.ts`), so keep them in lockstep with the tag.
