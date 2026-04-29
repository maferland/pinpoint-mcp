import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { FileReviewStore } from "./store.js";
import { createHttpServer, type PinpointHttpServer } from "./main.js";
import type { PinpointAnnotation, PinpointReview } from "./types.js";

let dir: string;
let store: FileReviewStore;
let pinpointServer: PinpointHttpServer;
let baseUrl: string;

const TEST_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64,
  0x08, 0x02, 0x00, 0x00, 0x00,
]);

function makeReview(id: string, overrides?: Partial<PinpointReview>): PinpointReview {
  return {
    version: "1.0",
    id,
    images: [{ path: path.join(dir, "test.png"), width: 100, height: 100 }],
    createdAt: new Date().toISOString(),
    annotations: [],
    ...overrides,
  };
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-http-test-"));
  store = new FileReviewStore(dir);
  fs.writeFileSync(path.join(dir, "test.png"), TEST_PNG);

  pinpointServer = createHttpServer(store, 0);
  await new Promise<void>((resolve) => pinpointServer.server.on("listening", resolve));
  const addr = pinpointServer.server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  pinpointServer.server.closeAllConnections?.();
  pinpointServer.server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("createHttpServer", () => {
  beforeEach(async () => { await store.save(makeReview("test-review")); });
  afterEach(async () => {
    const r = await store.load("test-review");
    if (r) { r.annotations = []; await store.save(r); }
  });

  describe("GET /api/review/:id", () => {
    it("returns review JSON", async () => {
      const res = await fetch(`${baseUrl}/api/review/test-review`);
      expect(res.status).toBe(200);
      const data = await res.json() as PinpointReview;
      expect(data.id).toBe("test-review");
      expect(data.annotations).toEqual([]);
    });

    it("returns 404 for missing review", async () => {
      expect((await fetch(`${baseUrl}/api/review/nope`)).status).toBe(404);
    });
  });

  describe("GET /api/review/:id/image", () => {
    it("serves PNG", async () => {
      const res = await fetch(`${baseUrl}/api/review/test-review/image`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf[0]).toBe(0x89);
    });

    it("returns 404 for index out of range", async () => {
      const res = await fetch(`${baseUrl}/api/review/test-review/image?index=99`);
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/review/:id/annotations", () => {
    it("saves annotations", async () => {
      const ann: PinpointAnnotation = {
        id: "a1", number: 1, imageIndex: 0, pin: { x: 25.5, y: 75.3 },
        comment: "Button misaligned",
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

    it("returns 404 for missing review", async () => {
      const res = await fetch(`${baseUrl}/api/review/nope/annotations`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: "[]",
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid JSON", async () => {
      const res = await fetch(`${baseUrl}/api/review/test-review/annotations`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: "not json",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/review/:id/finalize", () => {
    it("resolves waitForFinalize promise", async () => {
      await store.save(makeReview("finalize-1"));
      let resolved = false;
      const wait = pinpointServer.waitForFinalize("finalize-1").then(() => { resolved = true; });

      const res = await fetch(`${baseUrl}/api/review/finalize-1/finalize`, { method: "POST" });
      expect(res.status).toBe(200);
      await wait;
      expect(resolved).toBe(true);
    });

    it("returns 404 for missing review", async () => {
      const res = await fetch(`${baseUrl}/api/review/nope/finalize`, { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("is a no-op if no waiter is registered", async () => {
      await store.save(makeReview("finalize-noop"));
      const res = await fetch(`${baseUrl}/api/review/finalize-noop/finalize`, { method: "POST" });
      expect(res.status).toBe(200);
    });
  });

  describe("CORS + 404", () => {
    it("responds to OPTIONS with 204", async () => {
      const res = await fetch(`${baseUrl}/api/review/test-review`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
    });

    it("returns 404 for unknown paths", async () => {
      expect((await fetch(`${baseUrl}/foo/bar`)).status).toBe(404);
    });

    it("returns 404 for review with invalid id chars", async () => {
      const res = await fetch(`${baseUrl}/api/review/has%20space`);
      expect(res.status).toBe(404);
    });
  });
});
