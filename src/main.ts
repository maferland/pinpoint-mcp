/**
 * Pinpoint MCP server entry point.
 * Always starts an HTTP server for the annotation UI.
 * Usage: bun src/main.ts [--stdio]
 */

import fs from "fs";
import http from "http";
import path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileReviewStore } from "./store.js";
import { createServer } from "./server.js";
import { REVIEW_ID_RE } from "./util.js";
import type { PinpointAnnotation } from "./types.js";

const DIST_DIR = import.meta.filename?.endsWith(".ts")
  ? path.join(import.meta.dirname!, "..", "dist")
  : import.meta.dirname!;

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const MAX_BODY = 1024 * 1024;

type RouteHandler = (
  reviewId: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
) => Promise<void>;

export interface PinpointHttpServer {
  server: http.Server;
  waitForFinalize(reviewId: string): Promise<void>;
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function createHttpServer(store: FileReviewStore, port: number): PinpointHttpServer {
  const finalizeResolvers = new Map<string, () => void>();
  const routes: Record<string, RouteHandler> = {
    "GET /review": async (_id, _req, res) => {
      const html = await fs.promises.readFile(path.join(DIST_DIR, "annotator.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    },

    "GET /api/review": async (id, _req, res) => {
      const review = await store.load(id);
      if (!review) return json(res, 404, { error: "Review not found" });
      json(res, 200, review);
    },

    "GET /api/review/image": async (id, req, res) => {
      const review = await store.load(id);
      if (!review) { res.writeHead(404); res.end("Not found"); return; }

      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const index = parseInt(url.searchParams.get("index") ?? "0", 10);
      const img = review.images[index];
      if (!img) { res.writeHead(404); res.end("Image index out of range"); return; }

      const ext = path.extname(img.path).toLowerCase();
      const stream = fs.createReadStream(img.path);
      stream.on("error", () => {
        if (!res.headersSent) res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Image not found");
      });
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      stream.pipe(res);
    },

    "PUT /api/review/annotations": async (id, req, res) => {
      const review = await store.load(id);
      if (!review) return json(res, 404, { error: "Review not found" });

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY) return json(res, 413, { error: "Payload too large" });
        chunks.push(chunk as Buffer);
      }

      try {
        review.annotations = JSON.parse(Buffer.concat(chunks).toString()) as PinpointAnnotation[];
        await store.save(review);
        json(res, 200, { ok: true });
      } catch {
        json(res, 400, { error: "Invalid JSON" });
      }
    },

    "POST /api/review/finalize": async (id, _req, res) => {
      const review = await store.load(id);
      if (!review) return json(res, 404, { error: "Review not found" });
      const resolver = finalizeResolvers.get(id);
      if (resolver) {
        finalizeResolvers.delete(id);
        resolver();
      }
      json(res, 200, { ok: true });
    },
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const idMatch = url.pathname.match(REVIEW_ID_RE);
    if (!idMatch) { res.writeHead(404); res.end("Not found"); return; }

    const reviewId = idMatch[1];
    const suffix = url.pathname.endsWith("/image") ? "/image"
      : url.pathname.endsWith("/annotations") ? "/annotations"
      : url.pathname.endsWith("/finalize") ? "/finalize"
      : "";
    const routeKey = url.pathname.startsWith("/api/")
      ? `${req.method} /api/review${suffix}`
      : `${req.method} /review`;

    const handler = routes[routeKey];
    if (!handler) { res.writeHead(404); res.end("Not found"); return; }
    await handler(reviewId, req, res);
  });

  server.listen(port, () => {
    const addr = server.address();
    const boundPort = typeof addr === "object" && addr ? addr.port : port;
    process.stderr.write(`Pinpoint annotation UI: http://localhost:${boundPort}\n`);
  });

  return {
    server,
    waitForFinalize(reviewId) {
      return new Promise<void>((resolve) => {
        finalizeResolvers.set(reviewId, resolve);
      });
    },
  };
}

async function main() {
  const store = new FileReviewStore();
  const httpPort = parseInt(process.env.PINPOINT_PORT ?? "4747", 10);
  const { server: httpServer } = createHttpServer(store, httpPort);

  if (process.argv.includes("--stdio")) {
    await createServer(store, httpPort).connect(new StdioServerTransport());
  } else {
    process.stderr.write("Running in HTTP-only mode (no MCP stdio)\n");
  }

  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
