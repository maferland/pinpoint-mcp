import { useCallback, useEffect, useRef, useState } from "react";
import type { PinpointAnnotation, AnnotationIntent, AnnotationSeverity } from "./types.ts";

const INTENTS: AnnotationIntent[] = ["fix", "change", "question", "approve"];
const SEVERITIES: AnnotationSeverity[] = ["blocking", "important", "suggestion"];

const SEVERITY_STYLE: Record<AnnotationSeverity, string> = {
  blocking: "bg-red-500/15 text-red-400",
  important: "bg-amber-500/15 text-amber-400",
  suggestion: "bg-sky-500/15 text-sky-400",
};

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
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${SEVERITY_STYLE[annotation.severity]}`}>
            {annotation.severity}
          </span>
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
            placeholder="Describe the issue..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          <div className="border-t border-border pt-2 mt-1 flex items-center gap-1 flex-wrap">
            <div className="flex items-center gap-px rounded-md bg-secondary p-0.5">
              {INTENTS.map((intent) => (
                <button
                  key={intent}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-all capitalize ${
                    annotation.intent === intent
                      ? "bg-surface-active text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onUpdate({ intent })}
                >
                  {intent}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-px rounded-md bg-secondary p-0.5">
              {SEVERITIES.map((sev) => (
                <button
                  key={sev}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-all capitalize ${
                    annotation.severity === sev
                      ? SEVERITY_STYLE[sev]
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onUpdate({ severity: sev })}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
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
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${SEVERITY_STYLE[annotation.severity]}`}>
              {annotation.severity}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground truncate">
            {annotation.comment || "Click to add comment..."}
          </p>
        </div>
      </div>
    </div>
  );
}
