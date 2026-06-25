/*
 * Lightweight PWA install controller.
 *
 * Responsibilities:
 *  - Capture the browser's `beforeinstallprompt` event and call preventDefault()
 *    so NOTHING pops up automatically on the first visit.
 *  - Keep the deferred prompt so a custom in-app button can open the native
 *    install dialog ON DEMAND (when the user clicks "تثبيت التطبيق").
 *  - Register a minimal service worker (required for installability).
 *  - Detect iOS / standalone so the UI can show the right affordance.
 *
 * It never changes app behaviour, authentication or subscriptions.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export function isAppInstalled(): boolean {
  return installed;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari uses a non-standard navigator.standalone flag
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "MacIntel" — detect it via touch support.
  const isIPadOS =
    window.navigator.platform === "MacIntel" &&
    (window.navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
    (window.navigator.maxTouchPoints ?? 0) > 1;
  return isAppleMobile || isIPadOS;
}

/**
 * Trigger the browser's native install dialog. A deferred prompt can only be
 * used once, so it is cleared afterwards.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const event = deferredPrompt;
  await event.prompt();
  const choice = await event.userChoice;
  deferredPrompt = null;
  emit();
  return choice.outcome;
}

export function initPwa(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    // Suppress the browser's automatic install banner — we only install
    // when the user explicitly clicks our button.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });

  // Use the artifact base path so links resolve whether the app is served at
  // "/" or under a sub-path. The manifest + apple-touch-icon are injected here
  // (instead of index.html) to stay correct across deep-linked SPA routes.
  const base = import.meta.env.BASE_URL || "/";

  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = `${base}manifest.webmanifest`;
    document.head.appendChild(manifestLink);
  }

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = `${base}apple-touch-icon.png`;
    document.head.appendChild(appleIcon);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
        // Installability is best-effort; ignore registration failures.
      });
    });
  }
}
