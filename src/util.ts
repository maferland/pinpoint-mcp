import { exec } from "child_process";

export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 18);
}

export function openBrowser(url: string): void {
  if (process.env.PINPOINT_TEST_NO_OPEN === "1") return;
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  exec(`${cmd} "${url}"`);
}

export const REVIEW_ID_RE = /^\/(?:api\/)?review\/([a-zA-Z0-9_-]+)/;
