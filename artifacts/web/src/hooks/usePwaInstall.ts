import { useSyncExternalStore } from "react";
import {
  subscribe,
  canInstall,
  isAppInstalled,
  isStandalone,
  isIOS,
  promptInstall,
} from "@/lib/pwa";

/**
 * React hook exposing the PWA install state.
 *  - `canInstall`: the native prompt is available (Chrome/Edge/Android).
 *  - `isInstalled` / `isStandalone`: the app is already installed / running standalone.
 *  - `isIOS`: iOS Safari, which needs the manual "Add to Home Screen" guide.
 *  - `promptInstall`: opens the native install dialog on demand.
 */
export function usePwaInstall() {
  const installable = useSyncExternalStore(subscribe, canInstall, () => false);
  const installed = useSyncExternalStore(subscribe, isAppInstalled, () => false);

  return {
    canInstall: installable,
    isInstalled: installed,
    isStandalone: isStandalone(),
    isIOS: isIOS(),
    promptInstall,
  };
}
