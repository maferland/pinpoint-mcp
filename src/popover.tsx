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

/**
 * Single source of truth for save: a ref-based flush that compares latest
 * draft against latest committed comment and calls onUpdate if they differ.
 * Used by ⌘Enter, blur-outside-popover, and unmount cleanup.
 */
function useFlushSave(
  draft: string,
  committed: string,
  onUpdate: (updates: Partial<PinpointAnnotation>) => void
) {
  const draftRef = useRef(draft);
  const committedRef = useRef(committed);
  const onUpdateRef = useRef(onUpdate);
  const cancelRef = useRef(false);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { committedRef.current = committed; }, [committed]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  const flush = useCallback(() => {
    if (cancelRef.current) return;
    if (draftRef.current !== committedRef.current) {
      onUpdateRef.current({ comment: draftRef.current });
      committedRef.current = draftRef.current;
    }
  }, []);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  // Save on unmount — covers click-outside, pin switch, image switch.
  useEffect(() => () => flush(), [flush]);

  return { flush, cancel };
}

export function Popover({ annotation, x, y, onUpdate, onDelete, onClose }: PopoverProps) {
  const [comment, setComment] = useState(annotation.comment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNew = !annotation.comment;
  const { flush, cancel } = useFlushSave(comment, annotation.comment, onUpdate);

  useEffect(() => { setComment(annotation.comment); }, [annotation.comment]);
  useEffect(() => { if (isNew) textareaRef.current?.focus(); }, [isNew]);

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const container = e.currentTarget.closest("[data-popover]");
      if (container?.contains(e.relatedTarget as Node)) return;
      flush();
    },
    [flush]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        flush();
        onClose();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        setComment(annotation.comment);
        onClose();
      }
    },
    [flush, cancel, annotation.comment, onClose]
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
            data-testid="popover-textarea"
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
