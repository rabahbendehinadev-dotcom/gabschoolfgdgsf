import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleLogin } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

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

export function GoogleSignInButton({ redirectTo = "/videos" }: { redirectTo?: string }) {
  const { setAuth } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const googleLoginMut = useGoogleLogin();

  const buttonRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);

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
      .then((d: { clientId: string | null }) => { if (!cancelled) setClientId(d.clientId); })
      .catch(() => { if (!cancelled) setClientId(null); });
    return () => { cancelled = true; };
  }, []);

  // Initialize Google Identity Services and render the official button.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGisScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => handlerRef.current(resp),
        });
        buttonRef.current.innerHTML = "";
        const width = Math.min(400, Math.max(240, buttonRef.current.offsetWidth || 360));
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
      })
      .catch(() => { /* silent: button simply won't render */ });

    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="mt-5">
      <div className="my-4 flex items-center gap-3 text-xs text-foreground/40">
        <span className="h-px flex-1 bg-border" />
        أو
        <span className="h-px flex-1 bg-border" />
      </div>
      <div ref={buttonRef} className="flex justify-center [color-scheme:light]" />
      {googleLoginMut.isPending && (
        <p className="text-center text-xs text-foreground/50 mt-2">جارٍ تسجيل الدخول…</p>
      )}
    </div>
  );
}
