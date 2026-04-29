import type { PinpointAnnotation, PinpointReview } from "./types.ts";

const REVIEW_PATH_RE = /\/review\/([a-zA-Z0-9_-]+)/;

export function reviewIdFromPath(pathname: string): string | null {
  return pathname.match(REVIEW_PATH_RE)?.[1] ?? null;
}

function url(path: string): string {
  return `${window.location.origin}${path}`;
}

export async function getReview(reviewId: string): Promise<PinpointReview> {
  const res = await fetch(url(`/api/review/${reviewId}`));
  if (!res.ok) throw new Error(`getReview failed: ${res.status}`);
  return res.json() as Promise<PinpointReview>;
}

export function imageUrl(reviewId: string, index: number): string {
  return url(`/api/review/${reviewId}/image?index=${index}`);
}

export async function saveAnnotations(
  reviewId: string,
  annotations: PinpointAnnotation[]
): Promise<void> {
  const res = await fetch(url(`/api/review/${reviewId}/annotations`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotations),
  });
  if (!res.ok) throw new Error(`saveAnnotations failed: ${res.status}`);
}

export async function finalizeReview(reviewId: string): Promise<void> {
  const res = await fetch(url(`/api/review/${reviewId}/finalize`), { method: "POST" });
  if (!res.ok) throw new Error(`finalizeReview failed: ${res.status}`);
}
