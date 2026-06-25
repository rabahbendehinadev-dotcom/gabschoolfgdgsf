import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleLogin } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (resp: { credential?: string }) => void }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
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
  const { setAuth } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const googleLoginMut = useGoogleLogin();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [gisStatus, setGisStatus] = useState<GisStatus>("loading");

  const handleCredential = useCallback((response: { credential?: string }) => {
    if (!response.credential) return;
    googleLoginMut.mutate({ data: { credential: response.credential } }, {
      onSuccess: (res) => {
        setAuth(res.token, res.user);
        toast({ title: "تم تسجيل الدخول بنجاح", className: "bg-green-600 text-white border-none" });
        // New Google users have no WhatsApp number yet -> collect it first.
        navigate(res.user.phone ? redirectTo : "/complete-phone");
      },
      onError: (err) => {
        const apiErr = err as Error & { status?: number; data?: { message?: string } };
        const description = apiErr.status === 403
          ? "تم الوصول للحد الأقصى من الأجهزة المسموح بها لهذا الحساب"
          : (apiErr.data?.message || "تعذّر تسجيل الدخول عبر Google، حاول مرة أخرى");
        toast({ variant: "destructive", title: "فشل تسجيل الدخول عبر Google", description });
      },
    });
  }, [googleLoginMut, setAuth, toast, navigate, redirectTo]);

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

  // Initialize Google Identity Services and render the official button.
  // The official button is layered transparently on top of our custom button so
  // the real Google sign-in flow (ID-token credential) stays untouched, while we
  // fully control the visible appearance. We flip to "ready" once the GIS script
  // has loaded and renderButton has run; only a script/init failure (true
  // outage) downgrades to the disabled "unavailable" state. We deliberately do
  // NOT require GIS to have inserted a child, because a not-yet-authorized origin
  // makes GIS skip rendering in dev even though it works once the domain is
  // added to the Google Cloud authorized origins in production.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setGisStatus("loading");

    loadGisScript()
      .then(() => {
        if (cancelled) return;
        if (!window.google?.accounts?.id || !buttonRef.current) {
          setGisStatus("error");
          return;
        }
        // The GIS script is available -> the button is usable. renderButton can
        // still throw / render nothing on a not-yet-authorized origin in dev;
        // that's non-fatal and resolves once the domain is authorized in prod.
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (resp) => handlerRef.current(resp),
          });
          buttonRef.current.innerHTML = "";
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
        } catch {
          /* non-fatal: origin not yet authorized in this environment */
        }
        setGisStatus("ready");
      })
      .catch(() => { if (!cancelled) setGisStatus("error"); });

    return () => { cancelled = true; };
  }, [clientId]);

  const pending = googleLoginMut.isPending;
  // Google not configured at all, or its script failed to load (true outage).
  const unavailable = (configLoaded && !clientId) || gisStatus === "error";
  // Config or GIS still initializing (brief), only while Google is reachable.
  const initializing = !configLoaded || (!!clientId && gisStatus === "loading");

  return (
    <div className="w-full">
      <div ref={wrapperRef} className="group relative h-14 w-full" aria-busy={pending}>
        {/* Visible custom button (presentation only) */}
        <button
          type="button"
          tabIndex={-1}
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

        {/* Real Google button, transparent and stretched to cover the custom one.
            Always mounted whenever Google is configured so GIS has a node to
            render into (the credential flow stays untouched). z-10 keeps it on
            top of the custom button so the real user gesture lands on Google. */}
        {clientId && !pending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-xl opacity-0 [color-scheme:light]">
            <div ref={buttonRef} style={{ transform: "scale(1.7)", transformOrigin: "center" }} />
          </div>
        )}

        {/* Loader overlay while config/GIS initialize (covers the button briefly) */}
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
