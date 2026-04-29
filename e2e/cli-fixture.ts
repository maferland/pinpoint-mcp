/**
 * Playwright fixture: spawns `pinpoint review` on a random port, parses the
 * review URL from stderr, and exposes a `finalized()` helper that resolves
 * with the cli's stdout JSON after the user (or the test) clicks Done.
 *
 * Browser-opening is suppressed via PINPOINT_TEST_NO_OPEN=1 — Playwright
 * navigates to the URL itself.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { test as base } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, "..", "dist", "cli.js");

// Minimal but VALID 1x1 transparent PNG. Browsers refuse to decode the
// IHDR-only stub used in unit tests, so we need IDAT + IEND too.
const TEST_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000005000176da7c000000000049454e44ae426082",
  "hex"
);

interface CliFixture {
  url: string;
  reviewId: string;
  port: number;
  stdoutSoFar(): string;
  stderrSoFar(): string;
  /** Wait for the cli to exit and return its parsed JSON output. */
  finalized(): Promise<{ context?: string; images: { path: string; width: number; height: number }[]; annotations: { number: number; comment: string; pin: { x: number; y: number }; box?: unknown }[] }>;
}

interface PinpointFixtures {
  pinpointCli: CliFixture;
  /** Override default test image. */
  pinpointContext: string | undefined;
}

function pickPort(): number {
  return 50000 + Math.floor(Math.random() * 10000);
}

async function waitForReady(getStderr: () => string, timeoutMs = 10000): Promise<{ port: number; reviewId: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = getStderr().match(/http:\/\/localhost:(\d+)\/review\/([a-zA-Z0-9_-]+)/);
    if (m) return { port: Number(m[1]), reviewId: m[2] };
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`cli not ready in ${timeoutMs}ms\nstderr: ${getStderr()}`);
}

export const test = base.extend<PinpointFixtures>({
  pinpointContext: [undefined, { option: true }],

  pinpointCli: async ({ pinpointContext }, use, testInfo) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinpoint-pw-"));
    const imagePath = path.join(dir, "test.png");
    fs.writeFileSync(imagePath, TEST_PNG);

    const port = pickPort();
    const args = ["review", imagePath, "--port", String(port)];
    if (pinpointContext) args.push("--context", pinpointContext);

    const proc: ChildProcessWithoutNullStreams = spawn("node", [CLI_PATH, ...args], {
      env: { ...process.env, PINPOINT_TEST_NO_OPEN: "1" },
    }) as ChildProcessWithoutNullStreams;

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

    const exited = new Promise<number>((resolve) => {
      proc.on("exit", (code) => resolve(code ?? -1));
    });

    const { reviewId } = await waitForReady(() => stderr);

    const fixture: CliFixture = {
      url: `http://localhost:${port}/review/${reviewId}`,
      reviewId,
      port,
      stdoutSoFar: () => stdout,
      stderrSoFar: () => stderr,
      async finalized() {
        const code = await exited;
        if (code !== 0) {
          throw new Error(`cli exited with ${code}\nstderr: ${stderr}\nstdout: ${stdout}`);
        }
        return JSON.parse(stdout);
      },
    };

    await use(fixture);

    // If the test didn't finalize, kill the cli so we don't leak processes.
    if (proc.exitCode === null) {
      proc.kill("SIGKILL");
      await exited.catch(() => {});
    }

    if (testInfo.status !== "passed") {
      console.log(`[pinpointCli] stderr: ${stderr}`);
      console.log(`[pinpointCli] stdout: ${stdout}`);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  },
});

export { expect } from "@playwright/test";
