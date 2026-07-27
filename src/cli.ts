/**
 * Pinpoint CLI — opens images for annotation, blocks until the user clicks Done,
 * then prints the structured feedback as JSON on stdout.
 *
 * Usage:
 *   pinpoint review <image>... [--context "..."] [--port N]
 *   pinpoint export <reviewId> [--output FILE]
 *   pinpoint share <reviewId> [--ttl DAYS] [--server URL]
 *   pinpoint open <bundle.pinpoint.zip|share-link> [--mode replace|append|new] [--port N]
 *   pinpoint demo [--port N]
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { spawnSync } from "child_process";
import { FileReviewStore, type ReviewStore } from "./store.js";
import { createHttpServer } from "./main.js";
import { readImageDimensions } from "./image-sniff.js";
import { importBundleIntoStore, parseBundle, serialize, type MergeMode } from "./export.js";
import { decryptBundle, encryptBundle } from "./share-crypto.js";
import {
  buildInlineLink,
  buildSupabaseLink,
  createShare,
  DEFAULT_SHARE_BASE_URL,
  fetchBundle,
  generateResponseChannel,
  parseShareLink,
  type ResponseChannel,
  shouldInline,
} from "./share-transport.js";
import { generateId, openBrowser } from "./util.js";
import type { ImageInfo, PinpointReview, ReviewSlot } from "./types.js";
import { resolveSlots } from "./types.js";

const FINALIZE_TIMEOUT_MS = 96 * 60 * 60 * 1000;

// Cross-network share is shipped dark: the subcommand and --share flag stay inert
// unless PINPOINT_SHARE=1, so install.sh builds carry the code without exposing it.
const SHARE_ENABLED = process.env.PINPOINT_SHARE === "1";

interface ParsedArgs {
  command: string;
  positional: string[];
  pairs: [string, string][];
  context?: string;
  output?: string;
  mode?: MergeMode;
  port: number;
  ttlDays?: number;
  server?: string;
  share: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const pairs: [string, string][] = [];
  let context: string | undefined;
  let output: string | undefined;
  let mode: MergeMode | undefined;
  let port = parseInt(process.env.PINPOINT_PORT ?? "0", 10);
  let ttlDays: number | undefined;
  let server: string | undefined = process.env.PINPOINT_SHARE_URL;
  let share = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--context") { context = rest[++i]; continue; }
    if (arg === "--port") { port = parseInt(rest[++i], 10); continue; }
    if (arg === "--output" || arg === "-o") { output = rest[++i]; continue; }
    if (arg === "--ttl") { ttlDays = parseInt(rest[++i], 10); continue; }
    if (arg === "--server") { server = rest[++i]; continue; }
    if (arg === "--share") { share = true; continue; }
    if (arg === "--pair" || arg === "--compare") {
      const a = rest[++i];
      const b = rest[++i];
      if (!a || !b) {
        process.stderr.write(`${arg} requires two image paths\n`);
        process.exit(2);
      }
      pairs.push([a, b]);
      continue;
    }
    if (arg === "--mode") {
      const m = rest[++i];
      if (m !== "replace" && m !== "append" && m !== "new") {
        process.stderr.write(`Invalid --mode: ${m} (expected replace|append|new)\n`);
        process.exit(2);
      }
      mode = m;
      continue;
    }
    if (arg.startsWith("--")) {
      process.stderr.write(`Unknown flag: ${arg}\n`);
      process.exit(2);
    }
    positional.push(arg);
  }

  return { command, positional, pairs, context, output, mode, port, ttlDays, server, share };
}

function reviewToOutput(final: PinpointReview, store: ReviewStore): object {
  const images = final.images.map((img) => ({ path: img.path, width: img.width, height: img.height }));
  const slots = resolveSlots(final);

  // Build a lookup: imageIndex → {slotIndex, side?}
  const imageToSlot = new Map<number, { slotIndex: number; side?: "before" | "after" }>();
  slots.forEach((slot, si) => {
    if (slot.type === "single") {
      imageToSlot.set(slot.imageIndex, { slotIndex: si });
    } else {
      imageToSlot.set(slot.beforeIndex, { slotIndex: si, side: "before" });
      imageToSlot.set(slot.afterIndex, { slotIndex: si, side: "after" });
    }
  });

  const annotations = final.annotations.map((a) => {
    const slotInfo = imageToSlot.get(a.imageIndex);
    return {
      number: a.number,
      image: final.images[a.imageIndex]?.path,
      imageIndex: a.imageIndex,
      ...(slotInfo?.slotIndex !== undefined ? { slotIndex: slotInfo.slotIndex } : {}),
      ...(slotInfo?.side ? { side: slotInfo.side } : {}),
      pin: a.pin,
      box: a.box,
      comment: a.comment,
      ...(a.attachments && a.attachments.length > 0
        ? {
            attachments: a.attachments.map((attachment) => ({
              path: store.attachmentPath(final.id, attachment.id),
              width: attachment.width,
              height: attachment.height,
            })),
          }
        : {}),
    };
  });

  const hasCompare = slots.some((s) => s.type === "compare");
  const mode = hasCompare ? (slots.every((s) => s.type === "compare") ? "compare" : "mixed") : "review";

  const outputSlots = slots.map((slot) =>
    slot.type === "compare"
      ? { type: "compare", before: images[slot.beforeIndex], after: images[slot.afterIndex] }
      : { type: "single", image: images[slot.imageIndex] }
  );

  return { mode, context: final.context, slots: outputSlots, images, annotations };
}

async function runAnnotationSession(
  store: FileReviewStore,
  reviewId: string,
  port: number,
  shareBaseUrl: string,
  autoShare?: { ttlDays?: number }
): Promise<void> {
  const { server, waitForFinalize } = createHttpServer(store, port, undefined, shareBaseUrl);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  const url = `http://localhost:${actualPort}/review/${reviewId}`;

  // Registered before the /share call below so the server's response-mailbox poller (armed by that
  // same call — see main.ts) sees this review as awaiting finalize from the moment it starts polling.
  const finalized = waitForFinalize(reviewId);

  if (autoShare) {
    const res = await fetch(`http://localhost:${actualPort}/api/review/${reviewId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlDays: autoShare.ttlDays }),
    });
    const { link } = (await res.json()) as { link: string };
    process.stderr.write(`Share link (anyone with it can annotate this review): ${link}\n`);
  }

  process.stderr.write(`Opening ${url}\n`);
  openBrowser(url);

  const timeout = setTimeout(() => {
    process.stderr.write("Timed out waiting for annotations.\n");
    process.exit(1);
  }, FINALIZE_TIMEOUT_MS);

  await finalized;
  clearTimeout(timeout);

  const final = await store.load(reviewId);
  if (!final) {
    process.stderr.write("Review disappeared before finalize.\n");
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(reviewToOutput(final, store), null, 2) + "\n");
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 250).unref();
}

async function reviewCommand(args: ParsedArgs): Promise<void> {
  if (args.positional.length === 0 && args.pairs.length === 0) {
    process.stderr.write(
      "usage: pinpoint review [--pair before after]... [image...] [--context \"...\"]\n"
    );
    process.exit(2);
  }

  const allPaths: string[] = [
    ...args.pairs.flat(),
    ...args.positional,
  ];

  const resolvedMap = new Map<string, ImageInfo>();
  for (const p of allPaths) {
    if (resolvedMap.has(p)) continue;
    const abs = path.resolve(p);
    try {
      const dims = await readImageDimensions(abs);
      resolvedMap.set(p, { path: abs, ...dims });
    } catch {
      process.stderr.write(`Image not found or unreadable: ${path.resolve(p)}\n`);
      process.exit(1);
    }
  }

  // Build flat images array and slots in declaration order: pairs first, then standalones.
  const images: ImageInfo[] = [];
  const slots: ReviewSlot[] = [];
  const pathToIndex = new Map<string, number>();

  const getIndex = (p: string): number => {
    if (!pathToIndex.has(p)) {
      pathToIndex.set(p, images.length);
      images.push(resolvedMap.get(p)!);
    }
    return pathToIndex.get(p)!;
  };

  for (const [before, after] of args.pairs) {
    slots.push({ type: "compare", beforeIndex: getIndex(before), afterIndex: getIndex(after) });
  }
  for (const p of args.positional) {
    slots.push({ type: "single", imageIndex: getIndex(p) });
  }

  const store = new FileReviewStore();
  const reviewId = generateId();
  const review: PinpointReview = {
    version: "1.0",
    id: reviewId,
    images,
    slots,
    context: args.context,
    createdAt: new Date().toISOString(),
    annotations: [],
  };
  await store.save(review);

  const shareBaseUrl = args.server ?? DEFAULT_SHARE_BASE_URL;
  const autoShare = args.share && SHARE_ENABLED ? { ttlDays: args.ttlDays } : undefined;
  await runAnnotationSession(store, reviewId, args.port || 0, shareBaseUrl, autoShare);
}

async function exportCommand(args: ParsedArgs): Promise<void> {
  if (args.positional.length !== 1) {
    process.stderr.write("usage: pinpoint export <reviewId> [--output FILE|-]\n");
    process.exit(2);
  }
  const [reviewId] = args.positional;
  const store = new FileReviewStore();
  const review = await store.load(reviewId);
  if (!review) {
    process.stderr.write(`Review "${reviewId}" not found.\n`);
    process.exit(1);
  }

  const zip = await serialize(review, store);

  if (args.output === "-") {
    process.stdout.write(zip);
    process.exit(0);
  }
  const outPath = path.resolve(args.output ?? `${reviewId}.pinpoint.zip`);
  await fs.promises.writeFile(outPath, zip);
  process.stderr.write(`Wrote ${outPath} (${zip.length} bytes)\n`);
  process.exit(0);
}

interface ShareResult {
  link: string;
  channel: ResponseChannel;
}

async function createShareLink(
  review: PinpointReview,
  store: ReviewStore,
  baseUrl: string,
  ttlDays: number | undefined
): Promise<ShareResult> {
  const zip = await serialize(review, store);
  const { payload, key } = await encryptBundle(zip);
  const channel = generateResponseChannel();

  let link: string;
  if (shouldInline(payload)) {
    link = buildInlineLink(payload, key, channel, baseUrl);
  } else {
    await createShare(channel.shareId, payload, { ttlDays });
    link = buildSupabaseLink(key, channel, baseUrl);
  }

  return { link, channel };
}

async function shareCommand(args: ParsedArgs): Promise<void> {
  if (args.positional.length !== 1) {
    process.stderr.write("usage: pinpoint share <reviewId> [--ttl DAYS] [--server URL]\n");
    process.exit(2);
  }
  const [reviewId] = args.positional;
  const store = new FileReviewStore();
  const review = await store.load(reviewId);
  if (!review) {
    process.stderr.write(`Review "${reviewId}" not found.\n`);
    process.exit(1);
  }

  const baseUrl = args.server ?? DEFAULT_SHARE_BASE_URL;
  const { link } = await createShareLink(review, store, baseUrl, args.ttlDays);

  process.stderr.write("Anyone with this link can decrypt the review. Send it over a trusted channel.\n");
  process.stdout.write(link + "\n");
  process.exit(0);
}

async function promptMode(): Promise<MergeMode> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    while (true) {
      const answer = await new Promise<string>((resolve) => {
        rl.question(
          "A review with this id already exists. [r]eplace, [a]ppend, [n]ew? ",
          resolve
        );
      });
      const c = answer.trim().toLowerCase();
      if (c === "r" || c === "replace") return "replace";
      if (c === "a" || c === "append") return "append";
      if (c === "n" || c === "new") return "new";
      process.stderr.write("Please answer r, a, or n.\n");
    }
  } finally {
    rl.close();
  }
}

async function resolveOpenTarget(target: string): Promise<Buffer> {
  if (!/^https?:\/\//.test(target)) {
    try {
      return await fs.promises.readFile(path.resolve(target));
    } catch {
      process.stderr.write(`Cannot read bundle: ${path.resolve(target)}\n`);
      process.exit(1);
    }
  }

  const link = parseShareLink(target);
  const payload = link.tier === "inline" ? link.payload : await fetchBundle(link.shareId);
  return Buffer.from(await decryptBundle(payload, link.key));
}

async function openCommand(args: ParsedArgs): Promise<void> {
  if (args.positional.length !== 1) {
    process.stderr.write("usage: pinpoint open <bundle.pinpoint.zip|share-link> [--mode replace|append|new]\n");
    process.exit(2);
  }
  const target = args.positional[0];
  const raw = await resolveOpenTarget(target);

  let bundle;
  try {
    bundle = parseBundle(raw);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : err}: ${target}\n`);
    process.exit(1);
  }

  const store = new FileReviewStore();
  const existing = await store.load(bundle.manifest.id);

  let mode = args.mode;
  if (!mode) {
    if (existing) {
      if (process.stdin.isTTY) {
        mode = await promptMode();
      } else {
        process.stderr.write(
          `Review "${bundle.manifest.id}" already exists locally. Pass --mode replace|append|new (non-interactive).\n`
        );
        process.exit(2);
      }
    } else {
      mode = "replace";
    }
  }

  const restored = await importBundleIntoStore(bundle, mode, existing, store);

  process.stderr.write(`Imported review "${restored.id}" (mode: ${mode})\n`);
  await runAnnotationSession(store, restored.id, args.port || 0, args.server ?? DEFAULT_SHARE_BASE_URL);
}

function resolveDemoBundle(): string {
  // The CLI binary lives at <repo>/dist/cli.js after build, or <repo>/src/cli.ts
  // in dev. Either way the bundle is one level up at <repo>/assets/demo.pinpoint.zip.
  return path.resolve(import.meta.dirname!, "..", "assets", "demo.pinpoint.zip");
}

async function demoCommand(args: ParsedArgs): Promise<void> {
  const bundlePath = resolveDemoBundle();
  if (!fs.existsSync(bundlePath)) {
    process.stderr.write(
      `Demo bundle not found at ${bundlePath}.\n` +
      `Reinstall pinpoint or run from a working checkout of the repo.\n`
    );
    process.exit(1);
  }
  await openCommand({ ...args, positional: [bundlePath], mode: "new" });
}

async function updateCommand(): Promise<void> {
  // The binary lives at <root>/dist/cli.js; the repo's install.sh is the proven
  // pull → build → link → plugin updater, so reuse it rather than reimplement.
  const root = path.resolve(import.meta.dirname!, "..");
  const installScript = path.join(root, "install.sh");
  if (!fs.existsSync(path.join(root, ".git")) || !fs.existsSync(installScript)) {
    process.stderr.write(
      "pinpoint update needs the git checkout that install.sh creates.\n" +
      "Reinstall: curl -fsSL https://raw.githubusercontent.com/maferland/pinpoint/main/install.sh | bash\n"
    );
    process.exit(1);
  }
  const res = spawnSync("bash", [installScript], { stdio: "inherit" });
  process.exit(res.status ?? 1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "review") return reviewCommand(args);
  if (args.command === "export") return exportCommand(args);
  if (args.command === "share" && SHARE_ENABLED) return shareCommand(args);
  if (args.command === "open") return openCommand(args);
  if (args.command === "demo") return demoCommand(args);
  if (args.command === "update") return updateCommand();

  process.stderr.write(
    "pinpoint — visual annotation CLI\n\n" +
    "Commands:\n" +
    "  pinpoint review [--pair before after]... [image...] [--context \"...\"] [--port N]\n" +
    "  pinpoint export <reviewId> [--output FILE|-]\n" +
    (SHARE_ENABLED ? "  pinpoint share <reviewId> [--ttl DAYS] [--server URL]\n" : "") +
    `  pinpoint open <bundle.pinpoint.zip${SHARE_ENABLED ? "|share-link" : ""}> [--mode replace|append|new] [--port N]\n` +
    "  pinpoint demo [--port N]\n" +
    "  pinpoint update\n"
  );
  process.exit(args.command ? 2 : 0);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
