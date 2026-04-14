import fs from "fs";
import os from "os";
import path from "path";
import type { PinpointReview } from "./types.js";

const MAX_REVIEWS = 50;

function validateId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid review id: must be alphanumeric, hyphens, or underscores");
  }
  if (id.length > 64) {
    throw new Error("Invalid review id: exceeds 64 character limit");
  }
}

export interface ReviewStore {
  save(review: PinpointReview): Promise<void>;
  load(id: string): Promise<PinpointReview | null>;
  list(): Promise<PinpointReview[]>;
}

export class FileReviewStore implements ReviewStore {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? path.join(os.tmpdir(), "pinpoint-reviews");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async save(review: PinpointReview): Promise<void> {
    validateId(review.id);
    const filePath = path.join(this.dir, `${review.id}.json`);
    if (!path.resolve(filePath).startsWith(path.resolve(this.dir) + path.sep)) {
      throw new Error("Invalid review path");
    }
    await fs.promises.writeFile(filePath, JSON.stringify(review, null, 2));
    await this.pruneOld();
  }

  async load(id: string): Promise<PinpointReview | null> {
    validateId(id);
    const filePath = path.join(this.dir, `${id}.json`);
    if (!path.resolve(filePath).startsWith(path.resolve(this.dir) + path.sep)) {
      throw new Error("Invalid review path");
    }
    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      return JSON.parse(raw) as PinpointReview;
    } catch {
      return null;
    }
  }

  async list(): Promise<PinpointReview[]> {
    try {
      const entries = await fs.promises.readdir(this.dir);
      const jsonFiles = entries.filter((f) => f.endsWith(".json"));
      const reviews: PinpointReview[] = [];
      for (const f of jsonFiles) {
        try {
          const raw = await fs.promises.readFile(path.join(this.dir, f), "utf-8");
          reviews.push(JSON.parse(raw) as PinpointReview);
        } catch {
          // skip corrupt files
        }
      }
      return reviews.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }

  private async pruneOld(): Promise<void> {
    try {
      const entries = await fs.promises.readdir(this.dir);
      const jsonFiles = entries.filter((f) => f.endsWith(".json"));
      if (jsonFiles.length <= MAX_REVIEWS) return;

      const stats = await Promise.all(
        jsonFiles.map(async (f) => ({
          name: f,
          mtime: (await fs.promises.stat(path.join(this.dir, f))).mtimeMs,
        }))
      );
      stats.sort((a, b) => a.mtime - b.mtime);
      const toRemove = stats.slice(0, stats.length - MAX_REVIEWS);
      await Promise.all(
        toRemove.map((f) =>
          fs.promises.unlink(path.join(this.dir, f.name)).catch(() => {})
        )
      );
    } catch {
      // best-effort cleanup
    }
  }
}
