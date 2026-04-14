import { useCallback, useEffect, useRef, useState } from "react";
import type { PinpointAnnotation } from "./types.ts";
import { Popover } from "./popover.tsx";

interface CanvasLayerProps {
  imageDataUrl: string;
  annotations: PinpointAnnotation[];
  selectedId: string | null;
  onBoxPlace: (x: number, y: number, width: number, height: number) => void;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<PinpointAnnotation>) => void;
  onDelete: (id: string) => void;
}

const PIN_RADIUS = 14;
const HIT_RADIUS = 22;
const CLICK_BOX_SIZE = 6;

interface ImageLayout {
  drawW: number;
  drawH: number;
  offsetX: number;
  offsetY: number;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function getImageLayout(container: DOMRect, img: HTMLImageElement): ImageLayout {
  const scale = Math.min(container.width / img.width, container.height / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  return { drawW, drawH, offsetX: (container.width - drawW) / 2, offsetY: (container.height - drawH) / 2 };
}

function pctToCanvas(pct: number, offset: number, size: number): number {
  return offset + (pct / 100) * size;
}

function canvasToPct(pos: number, offset: number, size: number): number {
  return ((pos - offset) / size) * 100;
}

export function CanvasLayer({
  imageDataUrl,
  annotations,
  selectedId,
  onBoxPlace,
  onSelect,
  onUpdate,
  onDelete,
}: CanvasLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const [, setDragVersion] = useState(0);
  const bumpDrag = () => setDragVersion((v) => v + 1);

  useEffect(() => {
    if (!imageDataUrl) return;
    setImgLoaded(false);
    setImgError(false);
    imgRef.current = null;
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.onerror = () => setImgError(true);
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const getLayout = useCallback((): ImageLayout | null => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img) return null;
    return getImageLayout(c.getBoundingClientRect(), img);
  }, []);

  // Pin position in screen pixels (for popover positioning)
  const getPinScreenPos = useCallback((ann: PinpointAnnotation): { x: number; y: number } | null => {
    const layout = getLayout();
    if (!layout) return null;
    return {
      x: pctToCanvas(ann.pin.x, layout.offsetX, layout.drawW),
      y: pctToCanvas(ann.pin.y, layout.offsetY, layout.drawH),
    };
  }, [getLayout]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imgRef.current;
    if (!canvas || !container || !img) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const layout = getImageLayout(rect, img);

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    // Read canvas-letterbox from CSS variable for theme support
    const rootStyles = getComputedStyle(document.documentElement);
    const letterbox = rootStyles.getPropertyValue('--canvas-letterbox').trim();
    ctx.fillStyle = letterbox ? `hsl(${letterbox})` : "#0d0f14";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, layout.offsetX, layout.offsetY, layout.drawW, layout.drawH);

    for (const ann of annotations) {
      const isSelected = ann.id === selectedId;

      if (ann.box) {
        const bx = pctToCanvas(ann.box.x, layout.offsetX, layout.drawW);
        const by = pctToCanvas(ann.box.y, layout.offsetY, layout.drawH);
        const bw = (ann.box.width / 100) * layout.drawW;
        const bh = (ann.box.height / 100) * layout.drawH;
        ctx.strokeStyle = isSelected ? "#2563eb" : "#3b82f6";
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
        ctx.fillStyle = isSelected ? "rgba(37,99,235,0.12)" : "rgba(59,130,246,0.06)";
        ctx.fillRect(bx, by, bw, bh);
      }

      const px = pctToCanvas(ann.pin.x, layout.offsetX, layout.drawW);
      const py = pctToCanvas(ann.pin.y, layout.offsetY, layout.drawH);

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(px, py, PIN_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#c73a30" : "#ea4a3e";
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(px, py, PIN_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ann.number), px, py);
    }

    const drag = dragRef.current;
    if (drag) {
      const dx = Math.min(drag.startX, drag.currentX);
      const dy = Math.min(drag.startY, drag.currentY);
      const dw = Math.abs(drag.currentX - drag.startX);
      const dh = Math.abs(drag.currentY - drag.startY);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(dx, dy, dw, dh);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(59,130,246,0.08)";
      ctx.fillRect(dx, dy, dw, dh);
    }
  }, [annotations, selectedId, getLayout]);

  useEffect(() => { if (imgLoaded) render(); }, [imgLoaded, render]);
  useEffect(() => {
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [render]);
  useEffect(() => { render(); });

  const hitTestPin = useCallback(
    (clientX: number, clientY: number): string | null => {
      const layout = getLayout();
      if (!layout) return null;
      const rect = containerRef.current!.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        const px = pctToCanvas(ann.pin.x, layout.offsetX, layout.drawW);
        const py = pctToCanvas(ann.pin.y, layout.offsetY, layout.drawH);
        if (Math.hypot(localX - px, localY - py) <= HIT_RADIUS) return ann.id;
      }
      return null;
    },
    [annotations, getLayout]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const hitId = hitTestPin(e.clientX, e.clientY);
      if (hitId) { onSelect(hitId); return; }
      // Always start drag for new annotation (deselects old one implicitly)
      const rect = containerRef.current!.getBoundingClientRect();
      dragRef.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top };
      bumpDrag();
    },
    [hitTestPin, onSelect]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const rect = containerRef.current!.getBoundingClientRect();
    dragRef.current.currentX = e.clientX - rect.left;
    dragRef.current.currentY = e.clientY - rect.top;
    bumpDrag();
  }, []);

  const finalizeDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    bumpDrag();
    const layout = getLayout();
    if (!layout) return;

    const x1 = canvasToPct(Math.min(drag.startX, drag.currentX), layout.offsetX, layout.drawW);
    const y1 = canvasToPct(Math.min(drag.startY, drag.currentY), layout.offsetY, layout.drawH);
    const x2 = canvasToPct(Math.max(drag.startX, drag.currentX), layout.offsetX, layout.drawW);
    const y2 = canvasToPct(Math.max(drag.startY, drag.currentY), layout.offsetY, layout.drawH);
    const w = x2 - x1;
    const h = y2 - y1;

    if (w < 2 && h < 2) {
      const midX = canvasToPct((drag.startX + drag.currentX) / 2, layout.offsetX, layout.drawW);
      const midY = canvasToPct((drag.startY + drag.currentY) / 2, layout.offsetY, layout.drawH);
      const bx = Math.max(0, midX - CLICK_BOX_SIZE / 2);
      const by = Math.max(0, midY - CLICK_BOX_SIZE / 2);
      onBoxPlace(bx, by, Math.min(CLICK_BOX_SIZE, 100 - bx), Math.min(CLICK_BOX_SIZE, 100 - by));
      return;
    }
    const cx = Math.max(0, x1);
    const cy = Math.max(0, y1);
    onBoxPlace(cx, cy, Math.min(100 - cx, w), Math.min(100 - cy, h));
  }, [getLayout, onBoxPlace]);

  if (!imageDataUrl || imgError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-[13px]">
        {imgError ? "Failed to load image" : "Waiting for screenshot..."}
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finalizeDrag}
        onMouseLeave={finalizeDrag}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {/* Popover — only for the selected annotation */}
      {imgLoaded && selectedId && (() => {
        const ann = annotations.find((a) => a.id === selectedId);
        if (!ann) return null;
        const pos = getPinScreenPos(ann);
        if (!pos) return null;
        return (
          <Popover
            key={ann.id}
            annotation={ann}
            x={pos.x + PIN_RADIUS + 8}
            y={pos.y - 10}
            onUpdate={(updates) => onUpdate(ann.id, updates)}
            onDelete={() => onDelete(ann.id)}
            onClose={() => onSelect(null)}
          />
        );
      })()}
    </div>
  );
}
