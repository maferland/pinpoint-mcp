import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FileReviewStore } from "./store.js";
import type { PinpointReview } from "./types.js";

function makeReview(id: string, overrides?: Partial<PinpointReview>): PinpointReview {
  return {
    version: "1.0",
    id,
    images: [{ path: "/tmp/test.png", width: 800, height: 600 }],
    createdAt: new Date().toISOString(),
    annotations: [],
    ...overrides,
  };
}

describe("FileReviewStore", () => {
  let dir: string;
  let store: FileReviewStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-test-"));
    store = new FileReviewStore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("saves and loads a review", async () => {
    const review = makeReview("abc123");
    await store.save(review);
    expect(await store.load("abc123")).toEqual(review);
  });

  it("returns null for missing review", async () => {
    expect(await store.load("nonexistent")).toBeNull();
  });

  it("lists reviews sorted by createdAt descending", async () => {
    await store.save(makeReview("old", { createdAt: "2026-01-01T00:00:00Z" }));
    await store.save(makeReview("new", { createdAt: "2026-04-01T00:00:00Z" }));
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("new");
    expect(list[1].id).toBe("old");
  });

  it("overwrites review on save", async () => {
    const review = makeReview("abc123");
    await store.save(review);
    review.annotations = [{
      id: "a1", number: 1, imageIndex: 0, pin: { x: 50, y: 50 },
      comment: "test",
    }];
    await store.save(review);
    expect((await store.load("abc123"))?.annotations).toHaveLength(1);
  });

  it("rejects invalid IDs", async () => {
    expect(store.save(makeReview("../escape"))).rejects.toThrow("Invalid review id");
    expect(store.save(makeReview("has spaces"))).rejects.toThrow("Invalid review id");
    expect(store.load("../escape")).rejects.toThrow("Invalid review id");
  });

  it("persists to filesystem", async () => {
    await store.save(makeReview("persisted"));
    expect(fs.readdirSync(dir)).toContain("persisted.json");
  });

  it("preserves context field", async () => {
    await store.save(makeReview("ctx", { context: "Login page" }));
    expect((await store.load("ctx"))?.context).toBe("Login page");
  });
});
