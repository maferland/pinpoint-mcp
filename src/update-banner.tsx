import { useEffect, useState } from "react";
import { getPreferences, savePreferences } from "./api.ts";
import { useUpdateCheck } from "./use-update-check.ts";

const UPDATE_COMMAND = "pinpoint update";

export function UpdateBanner() {
  const info = useUpdateCheck();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPreferences()
      .then((p) => setDismissedVersion(p.dismissedUpdateVersion ?? null))
      .catch(() => {})
      .finally(() => setPrefsLoaded(true));
  }, []);

  if (!info?.updateAvailable || !prefsLoaded) return null;
  if (dismissedVersion === info.latestVersion) return null;

  const dismiss = () => {
    setDismissedVersion(info.latestVersion);
    savePreferences({ dismissedUpdateVersion: info.latestVersion }).catch((err) => {
      console.error("Failed to persist dismissal:", err);
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(UPDATE_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-card border border-border rounded-lg shadow-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-foreground">
              Pinpoint {info.latestVersion} is available
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              You're on {info.currentVersion}.{" "}
              <a
                href={info.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                See what's new
              </a>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -mr-1 -mt-1"
            title="Dismiss until next release"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <button
          onClick={copy}
          className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-[11px] font-mono rounded-md px-2.5 py-1.5 text-left transition-colors flex items-center justify-between gap-2 group"
          title="Copy update command"
        >
          <span className="truncate">{UPDATE_COMMAND}</span>
          <span className="text-muted-foreground text-[10px] shrink-0 group-hover:text-foreground transition-colors">
            {copied ? "copied" : "copy"}
          </span>
        </button>
      </div>
    </div>
  );
}
