import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { CLI_PATH, ensureCliBuilt, spawnCli, TEST_PNG, waitForReady } from "./cli-test-harness.js";

beforeAll(ensureCliBuilt);

describe("pinpoint export/open cli", () => {
  let imagePath: string;
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-cli-export-test-"));
    imagePath = path.join(dir, "test.png");
    fs.writeFileSync(imagePath, TEST_PNG);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a review through export then open", async () => {
    // 1. Create a review via `review`, attach annotations, finalize.
    const reviewCli = spawnCli(["review", imagePath, "--context", "roundtrip"]);
    const { port, reviewId } = await waitForReady(() => reviewCli.stderr);

    const annPut = await fetch(`http://localhost:${port}/api/review/${reviewId}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        id: "a1", number: 1, imageIndex: 0, pin: { x: 30, y: 30 },
        comment: "original comment",
      }]),
    });
    expect(annPut.status).toBe(200);
    await fetch(`http://localhost:${port}/api/review/${reviewId}/finalize`, { method: "POST" });
    expect(await reviewCli.exited).toBe(0);

    // 2. Export the review to a zip file.
    const { parseBundle } = await import("./export.js");
    const bundlePath = path.join(dir, "out.pinpoint.zip");
    const exportCli = spawnCli(["export", reviewId, "--output", bundlePath]);
    expect(await exportCli.exited).toBe(0);
    expect(fs.existsSync(bundlePath)).toBe(true);
    const zipBytes = fs.readFileSync(bundlePath);
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);
    const { manifest, imageBytes } = parseBundle(zipBytes);
    expect(manifest.kind).toBe("pinpoint-export");
    expect(manifest.annotations[0].comment).toBe("original comment");
    expect(imageBytes.size).toBe(1);

    // 3. Re-open the bundle (reviewer perspective, fresh review), add a new
    //    comment, finalize. Verify both annotations come through.
    const openCli = spawnCli(["open", bundlePath, "--mode", "new"]);
    const { port: openPort, reviewId: openedId } = await waitForReady(() => openCli.stderr);
    expect(openedId).not.toBe(reviewId);

    const review = await (await fetch(`http://localhost:${openPort}/api/review/${openedId}`)).json() as {
      annotations: Array<{ id: string; number: number; imageIndex: number; pin: { x: number; y: number }; comment: string }>;
    };
    expect(review.annotations).toHaveLength(1);
    expect(review.annotations[0].comment).toBe("original comment");

    await fetch(`http://localhost:${openPort}/api/review/${openedId}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        ...review.annotations,
        { id: "a2", number: 2, imageIndex: 0, pin: { x: 70, y: 70 }, comment: "reviewer comment" },
      ]),
    });
    await fetch(`http://localhost:${openPort}/api/review/${openedId}/finalize`, { method: "POST" });
    expect(await openCli.exited).toBe(0);

    const out = JSON.parse(openCli.stdout) as { annotations: Array<{ comment: string }> };
    expect(out.annotations.map((a) => a.comment)).toEqual(["original comment", "reviewer comment"]);
  }, 20000);

  it("--mode append merges bundle annotations into an existing local review", async () => {
    // Seed a local review with one annotation.
    const seedCli = spawnCli(["review", imagePath]);
    const { port, reviewId } = await waitForReady(() => seedCli.stderr);
    await fetch(`http://localhost:${port}/api/review/${reviewId}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        id: "local-1", number: 1, imageIndex: 0, pin: { x: 10, y: 10 },
        comment: "local annotation",
      }]),
    });
    await fetch(`http://localhost:${port}/api/review/${reviewId}/finalize`, { method: "POST" });
    await seedCli.exited;

    // Export the seeded review, then mutate the bundle to add a second
    // annotation as if a reviewer had added one on their side.
    const bundlePath = path.join(dir, "merge.pinpoint.zip");
    expect((await spawnCli(["export", reviewId, "--output", bundlePath]).exited)).toBe(0);

    const { parseBundle } = await import("./export.js");
    const { writeZip } = await import("./zip.js");
    const parsed = parseBundle(fs.readFileSync(bundlePath));
    parsed.manifest.annotations.push({
      id: "incoming-1", number: 1, imageIndex: 0, pin: { x: 80, y: 80 },
      comment: "reviewer annotation",
    });
    // Rewrite the zip with the mutated manifest so the bundle has 2 annotations.
    const mutated = writeZip([
      { name: "review.json", data: Buffer.from(JSON.stringify(parsed.manifest)) },
      ...[...parsed.imageBytes].map(([name, data]) => ({ name, data })),
    ]);
    fs.writeFileSync(bundlePath, mutated);

    // Open with --mode append. Existing local review has 1 annotation;
    // bundle now has 2. After append we expect 3 (1 local + 2 incoming).
    const openCli = spawnCli(["open", bundlePath, "--mode", "append"]);
    const { port: openPort, reviewId: openedId } = await waitForReady(() => openCli.stderr);
    expect(openedId).toBe(reviewId);

    const got = await (await fetch(`http://localhost:${openPort}/api/review/${openedId}`)).json() as {
      annotations: Array<{ number: number; comment: string }>;
    };
    expect(got.annotations.map((a) => a.comment)).toEqual([
      "local annotation",
      "local annotation",
      "reviewer annotation",
    ]);
    // Renumbered: 1 (existing), then 2 and 3 from the bundle.
    expect(got.annotations.map((a) => a.number)).toEqual([1, 2, 3]);

    await fetch(`http://localhost:${openPort}/api/review/${openedId}/finalize`, { method: "POST" });
    expect(await openCli.exited).toBe(0);
  }, 20000);

  it("--mode replace overwrites a colliding local review", async () => {
    const seedCli = spawnCli(["review", imagePath]);
    const { port, reviewId } = await waitForReady(() => seedCli.stderr);
    await fetch(`http://localhost:${port}/api/review/${reviewId}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        id: "local-1", number: 1, imageIndex: 0, pin: { x: 10, y: 10 },
        comment: "to be replaced",
      }]),
    });
    await fetch(`http://localhost:${port}/api/review/${reviewId}/finalize`, { method: "POST" });
    await seedCli.exited;

    const bundlePath = path.join(dir, "replace.pinpoint.zip");
    expect((await spawnCli(["export", reviewId, "--output", bundlePath]).exited)).toBe(0);

    // The bundle (exported just now) carries the "to be replaced" annotation.
    // Replace mode should leave the review with exactly the bundle's annotations.
    const openCli = spawnCli(["open", bundlePath, "--mode", "replace"]);
    const { port: openPort, reviewId: openedId } = await waitForReady(() => openCli.stderr);
    expect(openedId).toBe(reviewId);

    const got = await (await fetch(`http://localhost:${openPort}/api/review/${openedId}`)).json() as {
      annotations: Array<{ comment: string }>;
    };
    expect(got.annotations).toHaveLength(1);
    expect(got.annotations[0].comment).toBe("to be replaced");

    await fetch(`http://localhost:${openPort}/api/review/${openedId}/finalize`, { method: "POST" });
    expect(await openCli.exited).toBe(0);
  }, 20000);

  it("open exits with a clear error when the file is not a zip", async () => {
    const badPath = path.join(dir, "bad.pinpoint.zip");
    fs.writeFileSync(badPath, "not a zip");
    const cli = spawnCli(["open", badPath]);
    const code = await cli.exited;
    expect(code).toBe(1);
    expect(cli.stderr).toMatch(/not a valid zip/i);
  });

  it("`pinpoint demo` opens the bundled demo from any cwd", async () => {
    const cli = spawnCli(["demo"]);
    const { port, reviewId } = await waitForReady(() => cli.stderr);

    const review = await (await fetch(`http://localhost:${port}/api/review/${reviewId}`)).json() as {
      annotations: Array<{ comment: string }>;
      images: Array<{ width: number }>;
    };
    expect(review.annotations).toHaveLength(3);
    expect(review.images[0].width).toBe(1440);

    await fetch(`http://localhost:${port}/api/review/${reviewId}/finalize`, { method: "POST" });
    expect(await cli.exited).toBe(0);
  }, 10000);
});

describe("pinpoint review cli", () => {
  let imagePath: string;
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-cli-test-"));
    imagePath = path.join(dir, "test.png");
    fs.writeFileSync(imagePath, TEST_PNG);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("starts a server, accepts annotations, finalizes, prints JSON, exits fast", async () => {
    const cli = spawnCli(["review", imagePath, "--context", "smoke"]);
    const { port, reviewId } = await waitForReady(() => cli.stderr);

    const uploadRes = await fetch(`http://localhost:${port}/api/review/${reviewId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: TEST_PNG,
    });
    expect(uploadRes.status).toBe(200);
    const attachment = await uploadRes.json() as { id: string; width: number; height: number };

    const annRes = await fetch(`http://localhost:${port}/api/review/${reviewId}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        id: "a1", number: 1, imageIndex: 0, pin: { x: 50, y: 50 },
        box: { x: 40, y: 40, width: 20, height: 20 },
        comment: "smoke",
        attachments: [attachment],
      }]),
    });
    expect(annRes.status).toBe(200);

    const tFinalize = Date.now();
    await fetch(`http://localhost:${port}/api/review/${reviewId}/finalize`, { method: "POST" });
    const exitCode = await cli.exited;
    const exitTime = Date.now() - tFinalize;

    expect(exitCode).toBe(0);
    // Proves the keep-alive fix — without closeAllConnections + grace timer
    // this would take ~5s (Node default keepAliveTimeout).
    expect(exitTime).toBeLessThan(2000);

    const json = JSON.parse(cli.stdout);
    expect(json.context).toBe("smoke");
    expect(json.images).toHaveLength(1);
    expect(json.annotations).toHaveLength(1);
    expect(json.annotations[0].comment).toBe("smoke");
    expect(json.annotations[0].pin).toEqual({ x: 50, y: 50 });

    // The pasted attachment reaches the agent as a real, readable file path —
    // that's the actual point of the feature.
    const attachmentOut = json.annotations[0].attachments[0];
    expect(attachmentOut.width).toBe(100);
    expect(attachmentOut.height).toBe(100);
    expect(fs.existsSync(attachmentOut.path)).toBe(true);
    expect(fs.readFileSync(attachmentOut.path)[0]).toBe(0x89);
  }, 10000);

  it("exits with usage when no images given", async () => {
    const cli = spawnCli(["review"]);
    const code = await cli.exited;
    expect(code).toBe(2);
    expect(cli.stderr).toContain("usage:");
  });

  it("exits with error when image is missing", async () => {
    const cli = spawnCli(["review", "/tmp/does-not-exist-pinpoint.png"]);
    const code = await cli.exited;
    expect(code).toBe(1);
    expect(cli.stderr).toMatch(/not found|unreadable/i);
  });
});

describe("pinpoint update cli", () => {
  // Run the built binary from a copy that has no .git/install.sh so the guard
  // fires and the real installer never runs against the user's ~/.pinpoint.
  it("refuses to update outside the install checkout", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-update-test-"));
    try {
      fs.mkdirSync(path.join(tmp, "dist"));
      fs.copyFileSync(CLI_PATH, path.join(tmp, "dist", "cli.js"));
      const res = spawnSync("node", [path.join(tmp, "dist", "cli.js"), "update"], { encoding: "utf8" });
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/needs the git checkout/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
