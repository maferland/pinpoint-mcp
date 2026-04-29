import { useCallback, useEffect, useRef, useState } from "react";
import type { PinpointAnnotation, PinpointReview } from "./types.ts";
import { Toolbar } from "./toolbar.tsx";
import { CanvasLayer } from "./canvas-layer.tsx";

const REVIEW_ID_RE = /\/review\/([a-zA-Z0-9_-]+)/;

function apiUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

export function AnnotatorApp() {
  const reviewId = window.location.pathname.match(REVIEW_ID_RE)?.[1] ?? null;
  const [review, setReview] = useState<PinpointReview | null>(null);
  const [annotations, setAnnotations] = useState<PinpointAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    if (!reviewId) return;
    fetch(apiUrl(`/api/review/${reviewId}`))
      .then((r) => r.json())
      .then((data: PinpointReview) => {
        setReview(data);
        setAnnotations(data.annotations);
      })
      .catch((err) => console.error("Failed to load review:", err));
  }, [reviewId]);

  const imageUrl = review && review.images.length > 0
    ? apiUrl(`/api/review/${reviewId}/image?index=${activeImageIndex}`)
    : "";

  const activeAnnotations = annotations.filter((a) => a.imageIndex === activeImageIndex);

  const persistAnnotations = useCallback(
    (anns: PinpointAnnotation[]) => {
      if (!reviewId) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(apiUrl(`/api/review/${reviewId}/annotations`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(anns),
        }).catch(() => {});
      }, 300);
    },
    [reviewId]
  );

  const addAnnotation = useCallback(
    (box: { x: number; y: number; width: number; height: number }) => {
      const ann: PinpointAnnotation = {
        id: crypto.randomUUID().slice(0, 12),
        number: annotations.length + 1,
        imageIndex: activeImageIndex,
        pin: { x: box.x, y: box.y },
        box,
        comment: "",
      };
      const updated = [...annotations, ann];
      setAnnotations(updated);
      setSelectedId(ann.id);
      persistAnnotations(updated);
    },
    [annotations, activeImageIndex, persistAnnotations]
  );

  const updateAnnotation = useCallback(
    (id: string, updates: Partial<PinpointAnnotation>) => {
      setAnnotations((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, ...updates } : a));
        persistAnnotations(next);
        return next;
      });
    },
    [persistAnnotations]
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        const next = prev
          .filter((a) => a.id !== id)
          .map((a, i) => ({ ...a, number: i + 1 }));
        persistAnnotations(next);
        return next;
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId, persistAnnotations]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !document.querySelector("textarea:focus")) {
        removeAnnotation(selectedId);
      }
      if (e.key === "ArrowLeft" && review && activeImageIndex > 0) {
        setActiveImageIndex((i) => i - 1);
        setSelectedId(null);
      }
      if (e.key === "ArrowRight" && review && activeImageIndex < review.images.length - 1) {
        setActiveImageIndex((i) => i + 1);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, activeImageIndex, review, removeAnnotation]);

  if (!reviewId) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-muted-foreground text-[13px]">
        No review ID in URL. Use create_review in Claude to start.
      </div>
    );
  }

  const imageCount = review?.images.length ?? 0;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Toolbar
        reviewId={reviewId}
        annotationCount={activeAnnotations.length}
        context={review?.context}
        theme={theme}
        onThemeToggle={() => setTheme((t) => t === "dark" ? "light" : "dark")}
      />

      {/* Filmstrip — exact Lovable classes */}
      {imageCount > 1 && (
        <div className="h-16 flex items-center gap-2 px-4 bg-card border-b border-border shrink-0 overflow-x-auto">
          {review!.images.map((_, i) => {
            const count = annotations.filter((a) => a.imageIndex === i).length;
            const isActive = i === activeImageIndex;
            return (
              <button
                key={i}
                className={`relative h-11 w-20 rounded-md overflow-hidden border-2 transition-all shrink-0 group ${
                  isActive
                    ? "border-primary shadow-md shadow-primary/20"
                    : "border-border hover:border-muted-foreground/30"
                }`}
                onClick={() => { setActiveImageIndex(i); setSelectedId(null); }}
              >
                <img
                  src={apiUrl(`/api/review/${reviewId}/image?index=${i}`)}
                  alt={`Image ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <span className={`absolute top-0.5 left-0.5 text-[9px] font-bold rounded px-1 leading-4 ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-black/60 text-white"
                }`}>
                  {i + 1}
                </span>
                {count > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 text-[8px] font-medium bg-black/60 text-white rounded px-1 leading-3">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <CanvasLayer
        imageDataUrl={imageUrl}
        annotations={activeAnnotations}
        selectedId={selectedId}
        onBoxPlace={(x, y, w, h) => addAnnotation({ x, y, width: w, height: h })}
        onSelect={setSelectedId}
        onUpdate={updateAnnotation}
        onDelete={removeAnnotation}
      />
    </div>
  );
}
