import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import type { ReviewStore } from "./store.js";
import type { ImageInfo } from "./types.js";

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 18);
}

export async function readImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number }> {
  const buf = await fs.promises.readFile(imagePath);
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  let offset = 2;
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    if ((marker === 0xc0 || marker === 0xc2) && offset + 9 <= buf.length) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return { width: 0, height: 0 };
}

async function resolveImage(imagePath: string): Promise<ImageInfo | null> {
  const absPath = path.resolve(imagePath);
  try {
    await fs.promises.access(absPath, fs.constants.R_OK);
  } catch {
    return null;
  }
  const dims = await readImageDimensions(absPath);
  return { path: absPath, ...dims };
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  exec(`${cmd} "${url}"`);
}

export function registerTools(
  server: McpServer,
  store: ReviewStore,
  httpPort: number
): void {
  // ── create_review ──────────────────────────────────────────────────
  server.registerTool(
    "create_review",
    {
      title: "Annotate Screenshot",
      description:
        "Open one or more screenshots for visual annotation. Returns a URL the user opens in their browser. Call get_annotations after the user finishes.",
      inputSchema: z.object({
        images: z.union([
          z.string().describe("Single image file path"),
          z.array(z.string()).describe("Array of image file paths"),
        ]),
        context: z.string().optional().describe("What these screenshots show"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ images: input, context }): Promise<CallToolResult> => {
      const paths = Array.isArray(input) ? input : [input];
      const resolved: ImageInfo[] = [];
      for (const p of paths) {
        const img = await resolveImage(p);
        if (!img) {
          return {
            content: [{ type: "text", text: `Image not found: ${path.resolve(p)}` }],
            isError: true,
          };
        }
        resolved.push(img);
      }

      const reviewId = generateId();
      const url = `http://localhost:${httpPort}/review/${reviewId}`;

      await store.save({
        version: "1.0",
        id: reviewId,
        images: resolved,
        context,
        createdAt: new Date().toISOString(),
        annotations: [],
      });

      openBrowser(url);

      return {
        content: [{
          type: "text",
          text: `Review created (${resolved.length} image${resolved.length > 1 ? "s" : ""}) and opened in browser:\n\n${url}\n\nWhen the user is done annotating, call get_annotations("${reviewId}").${context ? ` Context: ${context}` : ""}`,
        }],
      };
    }
  );

  // ── add_image ──────────────────────────────────────────────────────
  server.registerTool(
    "add_image",
    {
      title: "Add Image to Review",
      description: "Add another screenshot to an existing review.",
      inputSchema: z.object({
        reviewId: z.string(),
        image: z.string().describe("Absolute file path to the screenshot"),
      }),
    },
    async ({ reviewId, image }): Promise<CallToolResult> => {
      const review = await store.load(reviewId);
      if (!review) {
        return { content: [{ type: "text", text: `Review "${reviewId}" not found.` }], isError: true };
      }
      const img = await resolveImage(image);
      if (!img) {
        return { content: [{ type: "text", text: `Image not found: ${path.resolve(image)}` }], isError: true };
      }
      review.images.push(img);
      await store.save(review);
      return {
        content: [{ type: "text", text: `Image added. Review now has ${review.images.length} images.` }],
      };
    }
  );

  // ── get_annotations ────────────────────────────────────────────────
  server.registerTool(
    "get_annotations",
    {
      description:
        "Get all annotations from a review session. Returns structured JSON with coordinates (as percentages), comments, intent, and severity.",
      inputSchema: z.object({
        reviewId: z.string().describe("The review session ID returned by create_review"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ reviewId }): Promise<CallToolResult> => {
      const review = await store.load(reviewId);
      if (!review) {
        return { content: [{ type: "text", text: `Review "${reviewId}" not found.` }], isError: true };
      }

      if (review.annotations.length === 0) {
        return {
          content: [{ type: "text", text: `Review "${reviewId}" has no annotations yet.` }],
        };
      }

      const pending = review.annotations.filter((a) => a.status === "pending");
      const summary = review.annotations
        .map((a) => {
          const imgLabel = review.images.length > 1 ? `[img${a.imageIndex + 1}] ` : "";
          const loc = a.box
            ? `box(${a.box.x.toFixed(1)}%, ${a.box.y.toFixed(1)}%, ${a.box.width.toFixed(1)}%x${a.box.height.toFixed(1)}%)`
            : `pin(${a.pin.x.toFixed(1)}%, ${a.pin.y.toFixed(1)}%)`;
          return `#${a.number} ${imgLabel}[${a.intent}/${a.severity}] ${loc}: ${a.comment}`;
        })
        .join("\n");

      const imageList = review.images.map((img, i) =>
        `  [${i + 1}] ${img.path} (${img.width}x${img.height})`
      ).join("\n");

      return {
        content: [{
          type: "text",
          text: `Review "${reviewId}"${review.context ? ` — ${review.context}` : ""}\n${review.images.length} image(s):\n${imageList}\n${review.annotations.length} annotations (${pending.length} pending)\n\n${summary}\n\n--- Raw JSON ---\n${JSON.stringify(review.annotations, null, 2)}`,
        }],
      };
    }
  );

  // ── list_reviews ───────────────────────────────────────────────────
  server.registerTool(
    "list_reviews",
    {
      description: "List all annotation review sessions.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => {
      const reviews = await store.list();
      if (reviews.length === 0) {
        return { content: [{ type: "text", text: "No reviews found." }] };
      }
      const lines = reviews.map((r) => {
        const pending = r.annotations.filter((a) => a.status === "pending").length;
        return `${r.id} — ${r.context ?? r.images[0]?.path ?? "no images"} (${r.images.length} img, ${r.annotations.length} annotations, ${pending} pending) ${r.createdAt}`;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── resolve_annotation ─────────────────────────────────────────────
  server.registerTool(
    "resolve_annotation",
    {
      description: "Mark an annotation as resolved or dismissed.",
      inputSchema: z.object({
        reviewId: z.string(),
        annotationId: z.string(),
        status: z.enum(["resolved", "dismissed"]).default("resolved"),
      }),
    },
    async ({ reviewId, annotationId, status }): Promise<CallToolResult> => {
      const review = await store.load(reviewId);
      if (!review) {
        return { content: [{ type: "text", text: `Review "${reviewId}" not found.` }], isError: true };
      }
      const annotation = review.annotations.find((a) => a.id === annotationId);
      if (!annotation) {
        return { content: [{ type: "text", text: `Annotation "${annotationId}" not found.` }], isError: true };
      }
      annotation.status = status;
      await store.save(review);
      return { content: [{ type: "text", text: `Annotation #${annotation.number} marked as ${status}.` }] };
    }
  );
}

export function createServer(store: ReviewStore, httpPort: number): McpServer {
  const server = new McpServer({ name: "Pinpoint", version: "0.1.0" });
  registerTools(server, store, httpPort);
  return server;
}
