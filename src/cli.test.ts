import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

const CLI_PATH = path.join(import.meta.dirname!, "..", "dist", "cli.js");

beforeAll(() => {
  if (fs.existsSync(CLI_PATH)) return;
  // Self-build if dist is missing — keeps `bun test` working without a
  // separate `bun run build` step (and avoids a CI ordering footgun).
  const result = spawnSync("bun", ["run", "build"], {
    cwd: path.join(import.meta.dirname!, ".."),
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("build failed");
});

const TEST_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64,
  0x08, 0x02, 0x00, 0x00, 0x00,
]);

function pickPort(): number {
  return 50000 + Math.floor(Math.random() * 10000);
}

function spawnCli(args: string[]) {
  const proc = spawn("node", [CLI_PATH, ...args], {
    env: { ...process.env, PINPOINT_TEST_NO_OPEN: "1" },
  });
  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (c) => { stdout += c.toString(); });
  proc.stderr?.on("data", (c) => { stderr += c.toString(); });
  const exited = new Promise<number>((resolve) => {
    proc.on("exit", (code) => resolve(code ?? -1));
  });
  return {
    proc,
    exited,
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

async function waitForReviewId(getStderr: () => string, timeoutMs = 5000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = getStderr().match(/\/review\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`cli not ready in ${timeoutMs}ms: ${getStderr()}`);
}

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
    const port = pickPort();
    const cli = spawnCli(["review", imagePath, "--context", "smoke", "--port", String(port)]);
    const reviewId = await waitForReviewId(() => cli.stderr);

    const annRes = await fetch(`http://localhost:${port}/api/review/${reviewId}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        id: "a1", number: 1, imageIndex: 0, pin: { x: 50, y: 50 },
        box: { x: 40, y: 40, width: 20, height: 20 },
        comment: "smoke",
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
