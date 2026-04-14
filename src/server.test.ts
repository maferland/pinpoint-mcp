import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readImageDimensions } from "./server.js";

describe("readImageDimensions", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-img-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeAndRead(name: string, bytes: number[]) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, Buffer.from(bytes));
    return readImageDimensions(p);
  }

  it("reads PNG dimensions", async () => {
    const dims = await writeAndRead("test.png", [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03,
      0x08, 0x02, 0x00, 0x00, 0x00,
    ]);
    expect(dims).toEqual({ width: 2, height: 3 });
  });

  it("reads JPEG dimensions from SOF0", async () => {
    const dims = await writeAndRead("test.jpg", [
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0),
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xf4, 0x02, 0x80,
      0x03, ...Array(9).fill(0),
    ]);
    expect(dims).toEqual({ width: 640, height: 500 });
  });

  it("returns 0x0 for unknown format", async () => {
    expect(await writeAndRead("test.bmp", [0x42, 0x4d, 0x00, 0x00])).toEqual({ width: 0, height: 0 });
  });

  it("handles truncated PNG", async () => {
    expect(await writeAndRead("t.png", [0x89, 0x50, 0x4e, 0x47])).toEqual({ width: 0, height: 0 });
  });

  it("handles truncated JPEG", async () => {
    expect(await writeAndRead("t.jpg", [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11])).toEqual({ width: 0, height: 0 });
  });
});
