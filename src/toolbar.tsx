import { useState } from "react";

interface ToolbarProps {
  reviewId: string;
  annotationCount: number;
  context?: string;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export function Toolbar({ reviewId, annotationCount, context, theme, onThemeToggle }: ToolbarProps) {
  const [doneState, setDoneState] = useState<"idle" | "sending" | "sent">("idle");

  const sendDone = async () => {
    setDoneState("sending");
    try {
      await fetch(`${window.location.origin}/api/review/${reviewId}/finalize`, { method: "POST" });
      setDoneState("sent");
    } catch {
      setDoneState("idle");
    }
  };

  return (
    <div className="h-11 flex items-center px-4 gap-3 bg-card border-b border-border shrink-0 select-none">
      <div className="flex items-center gap-2 mr-2">
        <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="5.5" cy="5.5" r="2" fill="white" />
            <circle cx="5.5" cy="5.5" r="4.5" stroke="white" strokeWidth="1" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-foreground">Pinpoint</span>
      </div>
      <div className="w-px h-5 bg-border" />
      <span className="text-[12px] text-muted-foreground truncate flex-1 min-w-0">{context ?? ""}</span>
      <span className="text-[11px] text-muted-foreground/50 hidden sm:inline">Click to pin · Drag to select region</span>
      <div className="w-px h-5 bg-border" />
      <span className="text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
        {annotationCount} pin{annotationCount !== 1 ? "s" : ""}
      </span>
      <div className="w-px h-5 bg-border" />
      <button
        className={`text-[12px] px-2.5 h-7 rounded-md font-medium transition-colors whitespace-nowrap ${
          doneState === "sent"
            ? "bg-emerald-500/15 text-emerald-400 cursor-default"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
        onClick={doneState === "idle" ? sendDone : undefined}
        disabled={doneState !== "idle"}
        title="Send annotations back to Claude"
      >
        {doneState === "idle" && "Done"}
        {doneState === "sending" && "Sending…"}
        {doneState === "sent" && "Sent — you can close this tab"}
      </button>
      <button
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={onThemeToggle}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}
