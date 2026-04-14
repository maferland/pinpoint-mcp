import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { FileReviewStore } from "./store.js";
import type { PinpointAnnotation, PinpointReview } from "./types.js";

let dir: string;
let store: FileReviewStore;
let server: http.Server;
let baseUrl: string;

const TEST_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64,
  0x08, 0x02, 0x00, 0x00, 0x00,
]);

function makeReview(id: string): PinpointReview {
  return {
    version: "1.0",
    id,
    images: [{ path: path.join(dir, "test.png"), width: 100, height: 100 }],
    createdAt: new Date().toISOString(),
    annotations: [],
  };
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-http-test-"));
  store = new FileReviewStore(dir);
  fs.writeFileSync(path.join(dir, "test.png"), TEST_PNG);

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const idMatch = url.pathname.match(/^\/api\/review\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) { res.writeHead(404); res.end(); return; }

    const review = await store.load(idMatch[1]);

    if (url.pathname.endsWith("/image") && req.method === "GET") {
      if (!review) { res.writeHead(404); res.end(); return; }
      const index = parseInt(url.searchParams.get("index") ?? "0", 10);
      const img = review.images[index];
      if (!img) { res.writeHead(404); res.end(); return; }
      const stream = fs.createReadStream(img.path);
      stream.on("error", () => { res.writeHead(404); res.end(); });
      res.writeHead(200, { "Content-Type": "image/png" });
      stream.pipe(res);
      return;
    }

    if (url.pathname.endsWith("/annotations") && req.method === "PUT") {
      if (!review) { res.writeHead(404); res.end(JSON.stringify({ error: "Not found" })); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      review.annotations = JSON.parse(Buffer.concat(chunks).toString()) as PinpointAnnotation[];
      await store.save(review);
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET") {
      if (!review) { res.writeHead(404); res.end(JSON.stringify({ error: "Not found" })); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(review));
      return;
    }

    res.writeHead(404); res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("HTTP API", () => {
  beforeEach(async () => { await store.save(makeReview("test-review")); });
  afterEach(async () => {
    const r = await store.load("test-review");
    if (r) { r.annotations = []; await store.save(r); }
  });

  it("GET /api/review/:id returns review JSON", async () => {
    const res = await fetch(`${baseUrl}/api/review/test-review`);
    expect(res.status).toBe(200);
    const data = await res.json() as PinpointReview;
    expect(data.id).toBe("test-review");
    expect(data.annotations).toEqual([]);
  });

  it("GET /api/review/:id returns 404 for missing", async () => {
    expect((await fetch(`${baseUrl}/api/review/nope`)).status).toBe(404);
  });

  it("GET /api/review/:id/image serves PNG", async () => {
    const res = await fetch(`${baseUrl}/api/review/test-review/image`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0x89);
  });

  it("PUT /api/review/:id/annotations saves", async () => {
    const ann: PinpointAnnotation = {
      id: "a1", number: 1, imageIndex: 0, pin: { x: 25.5, y: 75.3 },
      comment: "Button misaligned", intent: "fix", severity: "important", status: "pending",
    };
    const res = await fetch(`${baseUrl}/api/review/test-review/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([ann]),
    });
    expect(res.status).toBe(200);
    const review = await store.load("test-review");
    expect(review?.annotations[0].comment).toBe("Button misaligned");
  });

  it("PUT annotations returns 404 for missing review", async () => {
    const res = await fetch(`${baseUrl}/api/review/nope/annotations`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: "[]",
    });
    expect(res.status).toBe(404);
  });

  it("handles box + pin annotations", async () => {
    const anns: PinpointAnnotation[] = [
      { id: "a1", number: 1, imageIndex: 0, pin: { x: 50, y: 50 }, box: { x: 40, y: 40, width: 20, height: 20 },
        comment: "Spacing", intent: "change", severity: "suggestion", status: "pending" },
      { id: "a2", number: 2, imageIndex: 0, pin: { x: 10, y: 10 },
        comment: "Color", intent: "fix", severity: "blocking", status: "pending" },
    ];
    await fetch(`${baseUrl}/api/review/test-review/annotations`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(anns),
    });
    const review = await store.load("test-review");
    expect(review?.annotations).toHaveLength(2);
    expect(review?.annotations[0].box).toBeDefined();
    expect(review?.annotations[1].box).toBeUndefined();
  });
});
