/**
 * Pinpoint CLI — opens images for annotation, blocks until the user clicks Done,
 * then prints the structured feedback as JSON on stdout.
 *
 * Usage: pinpoint review <image>... [--context "..."] [--port N]
 */

import path from "path";
import { FileReviewStore } from "./store.js";
import { createHttpServer } from "./main.js";
import { readImageDimensions } from "./server.js";
import { generateId, openBrowser } from "./util.js";
import type { ImageInfo, PinpointReview } from "./types.js";

const FINALIZE_TIMEOUT_MS = 96 * 60 * 60 * 1000;

interface ParsedArgs {
  command: string;
  images: string[];
  context?: string;
  port: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const images: string[] = [];
  let context: string | undefined;
  let port = parseInt(process.env.PINPOINT_PORT ?? "0", 10);

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--context") { context = rest[++i]; continue; }
    if (arg === "--port") { port = parseInt(rest[++i], 10); continue; }
    if (arg.startsWith("--")) {
      process.stderr.write(`Unknown flag: ${arg}\n`);
      process.exit(2);
    }
    images.push(arg);
  }

  return { command, images, context, port };
}

async function reviewCommand(args: ParsedArgs): Promise<void> {
  if (args.images.length === 0) {
    process.stderr.write("usage: pinpoint review <image>... [--context \"...\"]\n");
    process.exit(2);
  }

  const resolved: ImageInfo[] = [];
  for (const p of args.images) {
    const abs = path.resolve(p);
    try {
      const dims = await readImageDimensions(abs);
      resolved.push({ path: abs, ...dims });
    } catch {
      process.stderr.write(`Image not found or unreadable: ${abs}\n`);
      process.exit(1);
    }
  }

  const store = new FileReviewStore();
  const reviewId = generateId();
  const port = args.port || 0;

  const review: PinpointReview = {
    version: "1.0",
    id: reviewId,
    images: resolved,
    context: args.context,
    createdAt: new Date().toISOString(),
    annotations: [],
  };
  await store.save(review);

  const { server, waitForFinalize } = createHttpServer(store, port);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  const url = `http://localhost:${actualPort}/review/${reviewId}`;

  process.stderr.write(`Opening ${url}\n`);
  openBrowser(url);

  const timeout = setTimeout(() => {
    process.stderr.write("Timed out waiting for annotations.\n");
    process.exit(1);
  }, FINALIZE_TIMEOUT_MS);

  await waitForFinalize(reviewId);
  clearTimeout(timeout);

  const final = await store.load(reviewId);
  if (!final) {
    process.stderr.write("Review disappeared before finalize.\n");
    process.exit(1);
  }

  const output = {
    context: final.context,
    images: final.images.map((img) => ({ path: img.path, width: img.width, height: img.height })),
    annotations: final.annotations.map((a) => ({
      number: a.number,
      image: final.images[a.imageIndex]?.path,
      imageIndex: a.imageIndex,
      pin: a.pin,
      box: a.box,
      comment: a.comment,
    })),
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  // Force-close keep-alive connections from the browser so server.close fires
  // immediately. Without this, exit waits up to ~5s (default keepAliveTimeout).
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  // Belt and suspenders: hard exit after a short grace period.
  setTimeout(() => process.exit(0), 250).unref();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "review") return reviewCommand(args);

  process.stderr.write(
    "pinpoint — visual annotation CLI\n\n" +
    "Commands:\n" +
    "  pinpoint review <image>... [--context \"...\"] [--port N]\n"
  );
  process.exit(args.command ? 2 : 0);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
