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
 * Known in-app browsers (embedded WebViews). "Add to Home Screen" is either
 * missing or non-functional inside these, so the user must reopen the link in
 * Safari first. Returns the app's slug (for tailored copy) or null.
 */
export type InAppBrowser =
  | "instagram"
  | "facebook"
  | "messenger"
  | "tiktok"
  | "snapchat"
  | "twitter"
  | "linkedin"
  | "line"
  | "webview"
  | null;

export function getInAppBrowser(): InAppBrowser {
  if (typeof window === "undefined") return null;
  const ua = window.navigator.userAgent || "";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return "facebook";
  if (/Messenger/i.test(ua)) return "messenger";
  if (/TikTok|musical_ly|Bytedance/i.test(ua)) return "tiktok";
  if (/Snapchat/i.test(ua)) return "snapchat";
  if (/Twitter/i.test(ua)) return "twitter";
  if (/LinkedInApp/i.test(ua)) return "linkedin";
  if (/\bLine\//i.test(ua)) return "line";
  // Generic iOS WebView: WebKit on an Apple device with no real browser token.
  const isAppleDevice = /iPad|iPhone|iPod/.test(ua);
  const isGenericIosWebview =
    isAppleDevice &&
    /AppleWebKit/.test(ua) &&
    !/Safari/.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  if (isGenericIosWebview) return "webview";
  return null;
}

export function isInAppBrowser(): boolean {
  return getInAppBrowser() !== null;
}

/** True only for genuine iOS Safari (not Chrome/Firefox/Edge on iOS, not a WebView). */
export function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  if (!isIOS()) return false;
  const ua = window.navigator.userAgent || "";
  const isRealSafari =
    /Safari/.test(ua) && /AppleWebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isRealSafari && !isInAppBrowser();
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
