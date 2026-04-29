import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register a DOM globally before any test module imports run. Cheap enough to
// always do — backend tests simply ignore the globals.
if (typeof window === "undefined") {
  GlobalRegistrator.register();
}
