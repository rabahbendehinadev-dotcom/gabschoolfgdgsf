import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { studentResources } from "./studentResources";

export type Locale = "ar" | "fr" | "en";

const STORAGE_KEY = "gab-online-locale";
const MANUAL_KEY = "gab-online-locale-manual";
const FALLBACK_LOCALE: Locale = "ar";

const messages: Record<Locale, Record<string, string>> = {
  ar: {
    ...studentResources.ar,
    "language.name": "العربية",
    "language.ar": "العربية",
    "language.fr": "Français",
    "language.en": "English",
    "nav.home": "الرئيسية",
    "nav.courses": "الدورات",
    "nav.tools": "الأدوات",
    "nav.solutions": "الحلول",
    "nav.community": "المجتمع",
    "nav.subscriptions": "الاشتراكات",
    "nav.account": "حسابي",
    "nav.notifications": "الإشعارات",
    "nav.menu": "القائمة",
    "nav.login": "دخول",
    "nav.register": "حساب جديد",
    "nav.subscribe": "اشترك الآن",
    "nav.logout": "تسجيل الخروج",
    "nav.vip": "VIP",
    "language.label": "اللغة",
    "common.loading": "جارٍ التحميل...",
    "common.error": "حدث خطأ. حاول مرة أخرى.",
    "common.empty": "لا توجد نتائج",
    "notifications.all": "الكل",
    "notifications.lessons": "الدروس",
    "notifications.community": "المجتمع",
    "notifications.system": "النظام",
    "notifications.now": "الآن",
    "notifications.minutesAgo": "قبل {count} دقيقة",
    "notifications.hoursAgo": "قبل {count} ساعة",
    "notifications.daysAgo": "قبل {count} يوم",
    "courses.title": "الدورات التعليمية",
    "courses.subtitle": "اختر دورة وابدأ رحلتك نحو الاحتراف",
    "courses.course": "دورة",
    "courses.lesson": "درس",
    "courses.highQuality": "جودة عالية",
  },
  fr: {
    ...studentResources.fr,
    "language.name": "Français",
    "language.ar": "العربية",
    "language.fr": "Français",
    "language.en": "English",
    "nav.home": "Accueil",
    "nav.courses": "Cours",
    "nav.tools": "Outils",
    "nav.solutions": "Solutions",
    "nav.community": "Communauté",
    "nav.subscriptions": "Abonnements",
    "nav.account": "Compte",
    "nav.notifications": "Notifications",
    "nav.menu": "Menu",
    "nav.login": "Connexion",
    "nav.register": "Créer un compte",
    "nav.subscribe": "S’abonner maintenant",
    "nav.logout": "Se déconnecter",
    "nav.vip": "VIP",
    "language.label": "Langue",
    "common.loading": "Chargement...",
    "common.error": "Une erreur est survenue. Réessayez.",
    "common.empty": "Aucun résultat",
    "notifications.all": "Tout",
    "notifications.lessons": "Cours",
    "notifications.community": "Communauté",
    "notifications.system": "Système",
    "notifications.now": "À l’instant",
    "notifications.minutesAgo": "Il y a {count} min",
    "notifications.hoursAgo": "Il y a {count} h",
    "notifications.daysAgo": "Il y a {count} j",
    "courses.title": "Cours de formation",
    "courses.subtitle": "Choisissez un cours et commencez votre parcours vers l’expertise",
    "courses.course": "cours",
    "courses.lesson": "leçon",
    "courses.highQuality": "Haute qualité",
  },
  en: {
    ...studentResources.en,
    "language.name": "English",
    "language.ar": "العربية",
    "language.fr": "Français",
    "language.en": "English",
    "nav.home": "Home",
    "nav.courses": "Courses",
    "nav.tools": "Tools",
    "nav.solutions": "Solutions",
    "nav.community": "Community",
    "nav.subscriptions": "Subscriptions",
    "nav.account": "Account",
    "nav.notifications": "Notifications",
    "nav.menu": "Menu",
    "nav.login": "Log in",
    "nav.register": "Create account",
    "nav.subscribe": "Subscribe now",
    "nav.logout": "Log out",
    "nav.vip": "VIP",
    "language.label": "Language",
    "common.loading": "Loading...",
    "common.error": "Something went wrong. Please try again.",
    "common.empty": "No results",
    "notifications.all": "All",
    "notifications.lessons": "Lessons",
    "notifications.community": "Community",
    "notifications.system": "System",
    "notifications.now": "Now",
    "notifications.minutesAgo": "{count} min ago",
    "notifications.hoursAgo": "{count} hr ago",
    "notifications.daysAgo": "{count} days ago",
    "courses.title": "Training courses",
    "courses.subtitle": "Choose a course and start your journey toward expertise",
    "courses.course": "courses",
    "courses.lesson": "lessons",
    "courses.highQuality": "High quality",
  },
};

function normalizeLocale(value: string | undefined | null): Locale | null {
  if (!value) return null;
  const base = value.toLowerCase().split("-")[0];
  return base === "ar" || base === "fr" || base === "en" ? base : null;
}

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return FALLBACK_LOCALE;
  const candidates = [...(navigator.languages || []), navigator.language];
  for (const candidate of candidates) {
    const detected = normalizeLocale(candidate);
    if (detected) return detected;
  }
  return FALLBACK_LOCALE;
}

type LocaleContextValue = {
  locale: Locale;
  direction: "rtl" | "ltr";
  setLocale: (locale: Locale) => void;
  applySavedLocale: (locale: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (localStorage.getItem(MANUAL_KEY) === "1") return normalizeLocale(saved) ?? FALLBACK_LOCALE;
    } catch {
      // Private browsing/storage restrictions should not block the app.
    }
    return detectLocale();
  });

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.setItem(MANUAL_KEY, "1");
    } catch {
      // The in-memory selection still applies for this session.
    }
    const token = (() => {
      try { return localStorage.getItem("token"); } catch { return null; }
    })();
    if (token) {
      const credential = (() => {
        try { return localStorage.getItem("device_credential"); } catch { return null; }
      })();
      void fetch("/api/auth/me/locale", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(credential ? { "X-Device-Credential": credential } : {}),
        },
        body: JSON.stringify({ locale: next }),
      }).catch(() => {});
    }
  }, []);

  const applySavedLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.setItem(MANUAL_KEY, "1");
    } catch {
      // Server preference still applies for this session.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";
    root.dataset.locale = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    direction: locale === "ar" ? "rtl" : "ltr",
    setLocale,
    applySavedLocale,
    t: (key: string, values?: Record<string, string | number>) => {
      const template = messages[locale][key] ?? messages[FALLBACK_LOCALE][key] ?? key;
      return values ? Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template) : template;
    },
  }), [locale, setLocale, applySavedLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}
