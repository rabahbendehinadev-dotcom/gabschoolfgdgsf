import {
  Smartphone,
  Tablet,
  Laptop,
  Server,
  KeyRound,
  Gift,
  type LucideIcon,
} from "lucide-react";

export interface CategoryMeta {
  description: string;
  Icon: LucideIcon;
  gradient: string;
  text: string;
  color: string;
}

const DEFAULT_META: CategoryMeta = {
  description: "دروس وشروحات احترافية في هذا القسم",
  Icon: Smartphone,
  gradient: "from-primary/15 to-orange-600/5",
  text: "text-primary",
  color: "#F97316",
};

const ENTRIES: { keywords: string[]; meta: CategoryMeta }[] = [
  {
    keywords: ["samsung", "سامسونج", "سامسونغ"],
    meta: {
      description: "شروحات FRP وفلاش وصيانة سوفتوير أجهزة سامسونج",
      Icon: Smartphone,
      gradient: "from-blue-500/15 to-blue-600/5",
      text: "text-blue-600",
      color: "#2563EB",
    },
  },
  {
    keywords: ["iphone", "آيفون", "ايفون"],
    meta: {
      description: "دروس iCloud وBypass وUnlock وملفات Apple",
      Icon: Smartphone,
      gradient: "from-slate-500/15 to-slate-700/5",
      text: "text-slate-700",
      color: "#334155",
    },
  },
  {
    keywords: ["ipad", "آيباد", "ايباد"],
    meta: {
      description: "حلول وتفعيل وأنظمة أجهزة iPad",
      Icon: Tablet,
      gradient: "from-zinc-500/15 to-zinc-600/5",
      text: "text-zinc-600",
      color: "#52525B",
    },
  },
  {
    keywords: ["macbook", "mac", "ماك بوك", "ماكبوك"],
    meta: {
      description: "صيانة وحلول أنظمة أجهزة MacBook",
      Icon: Laptop,
      gradient: "from-gray-500/15 to-gray-700/5",
      text: "text-gray-700",
      color: "#374151",
    },
  },
  {
    keywords: ["xiaomi", "redmi", "شاومي", "شياومي"],
    meta: {
      description: "فلاش وإزالة حسابات Mi وحلول سوفتوير شاومي",
      Icon: Smartphone,
      gradient: "from-orange-500/15 to-orange-600/5",
      text: "text-orange-600",
      color: "#EA580C",
    },
  },
  {
    keywords: ["oppo", "أوبو", "اوبو"],
    meta: {
      description: "فلاش وFRP وحلول سوفتوير أجهزة Oppo",
      Icon: Smartphone,
      gradient: "from-green-500/15 to-green-600/5",
      text: "text-green-600",
      color: "#16A34A",
    },
  },
  {
    keywords: ["realme", "ريلمي"],
    meta: {
      description: "فلاش وFRP وحلول سوفتوير أجهزة Realme",
      Icon: Smartphone,
      gradient: "from-yellow-500/15 to-yellow-600/5",
      text: "text-yellow-600",
      color: "#CA8A04",
    },
  },
  {
    keywords: ["huawei", "هواوي"],
    meta: {
      description: "فلاش وID وحلول سوفتوير أجهزة Huawei",
      Icon: Smartphone,
      gradient: "from-red-500/15 to-red-600/5",
      text: "text-red-600",
      color: "#DC2626",
    },
  },
  {
    keywords: ["oneplus", "one plus", "ون بلس", "ونبلس"],
    meta: {
      description: "فلاش وFRP وحلول سوفتوير أجهزة OnePlus",
      Icon: Smartphone,
      gradient: "from-rose-500/15 to-rose-600/5",
      text: "text-rose-600",
      color: "#E11D48",
    },
  },
  {
    keywords: ["server", "سيرفر", "سيرفرات", "gab server", "كريديت"],
    meta: {
      description: "شروحات السيرفرات والكريديت والخدمات",
      Icon: Server,
      gradient: "from-cyan-500/15 to-cyan-600/5",
      text: "text-cyan-600",
      color: "#0891B2",
    },
  },
  {
    keywords: ["activ", "تفعيل", "برامج", "بوكس", "box", "crack", "license"],
    meta: {
      description: "تفعيل وتنصيب برامج الصيانة والبوكسات",
      Icon: KeyRound,
      gradient: "from-purple-500/15 to-violet-600/5",
      text: "text-purple-600",
      color: "#9333EA",
    },
  },
  {
    keywords: ["free", "مجان", "مجاني", "مجانية", "تجريب"],
    meta: {
      description: "محتوى تجريبي مجاني قبل الاشتراك",
      Icon: Gift,
      gradient: "from-emerald-500/15 to-emerald-600/5",
      text: "text-emerald-600",
      color: "#059669",
    },
  },
];

export function getCategoryMeta(name?: string, slug?: string): CategoryMeta {
  const hay = `${name ?? ""} ${slug ?? ""}`.toLowerCase();
  for (const entry of ENTRIES) {
    if (entry.keywords.some((k) => hay.includes(k.toLowerCase()))) {
      return entry.meta;
    }
  }
  return DEFAULT_META;
}
