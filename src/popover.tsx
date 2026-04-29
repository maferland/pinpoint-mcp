import { useCallback, useEffect, useRef, useState } from "react";
import type { PinpointAnnotation } from "./types.ts";

interface PopoverProps {
  annotation: PinpointAnnotation;
  x: number;
  y: number;
  onUpdate: (updates: Partial<PinpointAnnotation>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function Popover({ annotation, x, y, onUpdate, onDelete, onClose }: PopoverProps) {
  const [comment, setComment] = useState(annotation.comment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNew = !annotation.comment;

  useEffect(() => { setComment(annotation.comment); }, [annotation.comment]);
  useEffect(() => { if (isNew) textareaRef.current?.focus(); }, [isNew]);

  const save = useCallback(() => {
    if (comment !== annotation.comment) onUpdate({ comment });
  }, [comment, annotation.comment, onUpdate]);

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const container = e.currentTarget.closest("[data-popover]");
      if (container?.contains(e.relatedTarget as Node)) return;
      save();
    },
    [save]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); onClose(); }
      if (e.key === "Escape") { e.preventDefault(); setComment(annotation.comment); onClose(); }
    },
    [save, annotation.comment, onClose]
  );

  return (
    <div
      className="absolute z-50 animate-fade-in"
      style={{ left: x, top: y, width: 280 }}
      data-popover
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="bg-popover border border-border rounded-lg shadow-xl backdrop-blur-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="text-[11px] font-bold text-primary tabular-nums">#{annotation.number}</span>
          <div className="flex-1" />
          <button
            className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
        <div className="px-3 py-2">
          <textarea
            ref={textareaRef}
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[48px] leading-relaxed"
            rows={2}
            placeholder="Type a note..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          <p className="text-[9px] text-muted-foreground text-right mt-1 opacity-40">⌘Enter to save · Esc to cancel</p>
        </div>
      </div>
    </div>
  );
}

interface CollapsedPopoverProps {
  annotation: PinpointAnnotation;
  x: number;
  y: number;
  onClick: () => void;
}

export function CollapsedPopover({ annotation, x, y, onClick }: CollapsedPopoverProps) {
  return (
    <div
      className="absolute z-40 animate-fade-in cursor-pointer"
      style={{ left: x, top: y, width: 240 }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="bg-popover border border-border rounded-lg shadow-lg backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-bold text-primary tabular-nums">#{annotation.number}</span>
          </div>
          <p className="text-[12px] text-muted-foreground truncate">
            {annotation.comment || "Click to add a note..."}
          </p>
        </div>
      </div>
    </div>
  );
}
