import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleLogin } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { getGoogleLoginErrorDescription } from "@/lib/googleLoginError";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
            itp_support?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
          prompt: (notification?: (n: {
            isDisplayed: () => boolean;
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            isDismissedMoment: () => boolean;
            getDismissedReason: () => string;
            getNotDisplayedReason: () => string;
          }) => void) => void;
          cancel: () => void;
        };
      };
    };
    __gisScriptLoading?: Promise<void>;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (window.__gisScriptLoading) return window.__gisScriptLoading;

  window.__gisScriptLoading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      // Script tag exists but may still be loading
      if (window.google?.accounts?.id) { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });

  return window.__gisScriptLoading;
}

function GoogleIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

type GisStatus = "loading" | "ready" | "error";

export function GoogleSignInButton({ redirectTo = "/videos" }: { redirectTo?: string }) {
  void redirectTo; // kept for API compatibility; navigation handled in handleCredential
  const { setAuth } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const googleLoginMut = useGoogleLogin();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [gisStatus, setGisStatus] = useState<GisStatus>("loading");
  // Whether the GIS renderButton actually injected an iframe into buttonRef
  const [gisRendered, setGisRendered] = useState(false);

  const navigateAfterLogin = useCallback(async (token: string, phone: string | null | undefined, deviceCredential?: string) => {
    if (!phone) { navigate("/complete-phone"); return; }
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (deviceCredential) {
        headers["X-Device-Credential"] = deviceCredential;
      } else {
        const stored = localStorage.getItem("device_credential");
        if (stored) headers["X-Device-Credential"] = stored;
      }
      const res = await fetch("/api/user/courses", { headers });
      const courses: { id: number }[] = res.ok ? await res.json() : [];
      navigate(courses.length === 1 ? `/courses/${courses[0].id}` : "/courses");
    } catch {
      navigate("/courses");
    }
  }, [navigate]);

  const handleCredential = useCallback((response: { credential?: string }) => {
    if (!response.credential) return;
    googleLoginMut.mutate({ data: { credential: response.credential } }, {
      onSuccess: (res) => {
        setAuth(res.token, res.user, res.deviceCredential);
        toast({ title: "تم تسجيل الدخول بنجاح", className: "bg-green-600 text-white border-none" });
        void navigateAfterLogin(res.token, res.user.phone, res.deviceCredential);
      },
      onError: (err) => {
        const apiErr = err as Error & {
          status?: number;
          data?: { code?: string; message?: string; deviceCredential?: string };
        };
        if (apiErr.data?.deviceCredential) {
          localStorage.setItem("device_credential", apiErr.data.deviceCredential);
        }
        const description = getGoogleLoginErrorDescription(apiErr);
        toast({ variant: "destructive", title: "فشل تسجيل الدخول عبر Google", description });
      },
    });
  }, [googleLoginMut, setAuth, toast, navigateAfterLogin]);

  // Keep latest handler in a ref so the init effect only depends on clientId.
  const handlerRef = useRef(handleCredential);
  useEffect(() => { handlerRef.current = handleCredential; }, [handleCredential]);

  // Fetch the public Google Client ID from the API.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/google/config")
      .then((r) => (r.ok ? r.json() : { clientId: null }))
      .then((d: { clientId: string | null }) => {
        if (!cancelled) { setClientId(d.clientId); setConfigLoaded(true); }
      })
      .catch(() => { if (!cancelled) { setClientId(null); setConfigLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  // Initialize GIS and render the real button at the exact wrapper width (no scaling).
  // Removing scale(1.7) fixes hit-testing in Safari/Firefox where pointer-events
  // follows the un-transformed layout box rather than the scaled visual bounds.
  // overflow-hidden is also removed so the button can extend to fill the wrapper.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setGisStatus("loading");
    setGisRendered(false);

    loadGisScript()
      .then(() => {
        if (cancelled) return;
        if (!window.google?.accounts?.id || !buttonRef.current) {
          setGisStatus("error");
          return;
        }
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (resp) => handlerRef.current(resp),
            cancel_on_tap_outside: false,
            // Keep iOS/Safari on Google's ITP-compatible button flow. FedCM and
            // One Tap prompt fallbacks can hand off to a localized Google
            // country domain (for example accounts.google.dz) in an insecure
            // browser sheet on some iPhones.
            itp_support: true,
            use_fedcm_for_prompt: false,
          });

          buttonRef.current.innerHTML = "";

          // Use the full wrapper width so the iframe covers the entire button.
          // No scale needed — the iframe will be exactly the right size.
          const measured = wrapperRef.current?.offsetWidth || 360;
          const width = Math.min(400, Math.max(200, Math.round(measured)));

          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: "outline",
            size: "large",
            type: "standard",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "center",
            locale: "ar",
            width,
          });

          // Check if GIS actually injected an iframe (it skips rendering on
          // un-authorized origins, FedCM environments, or blocked contexts).
          const rendered = !!buttonRef.current.querySelector("iframe, div");
          if (!cancelled) setGisRendered(rendered);
        } catch {
          /* non-fatal: origin not yet authorized in this environment */
          if (!cancelled) setGisRendered(false);
        }
        if (!cancelled) setGisStatus("ready");
      })
      .catch(() => { if (!cancelled) setGisStatus("error"); });

    return () => { cancelled = true; };
  }, [clientId]);

  const pending = googleLoginMut.isPending;
  // Google not configured at all, or its script failed to load (true outage).
  const unavailable =
    (configLoaded && !clientId) ||
    gisStatus === "error" ||
    (gisStatus === "ready" && !gisRendered);
  // Config or GIS still initializing.
  const initializing = !configLoaded || (!!clientId && gisStatus === "loading");

  return (
    <div className="w-full">
      <div
        ref={wrapperRef}
        className="group relative h-14 w-full"
        aria-busy={pending}
        style={{ cursor: pending || unavailable ? undefined : "pointer" }}
      >
        {/* Visible custom button (presentation layer, pointer-events-none) */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="الدخول بواسطة Google"
          aria-hidden="true"
          disabled={pending}
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 rounded-xl border-2 border-gray-300 bg-white text-lg font-bold text-gray-700 shadow-md transition-all duration-200 group-hover:border-primary/50 group-hover:bg-gray-50 group-hover:shadow-lg group-active:scale-[0.99] group-focus-within:border-primary group-focus-within:ring-2 group-focus-within:ring-primary/40"
        >
          {pending ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <>
              <GoogleIcon className="h-6 w-6" />
              <span>الدخول بواسطة Google</span>
            </>
          )}
        </button>

        {/*
          Real Google button: transparent overlay at z-10.
          KEY FIX: removed overflow-hidden (was clipping the iframe hit area)
          and removed scale(1.7) (was causing hit-testing to follow un-scaled
          layout box in Safari/Firefox, leaving parts of the button dead).
          The iframe is now rendered at the exact wrapper width — no transform needed.
        */}
        {clientId && !pending && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl opacity-0 [color-scheme:light]"
          >
            <div ref={buttonRef} className="w-full" />
          </div>
        )}

        {/* Loader overlay while config/GIS initialize */}
        {initializing && !unavailable && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-gray-200 bg-white">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {/* Disabled overlay when Google sign-in genuinely isn't available */}
        {unavailable && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-sm font-medium text-gray-400"
            role="status"
          >
            <GoogleIcon className="h-5 w-5 opacity-50" />
            تسجيل الدخول عبر Google غير متاح حالياً
          </div>
        )}
      </div>

    </div>
  );
}
