import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, PlayCircle, Star, Check } from "lucide-react";
import { Category } from "@workspace/api-client-react/src/generated/api.schemas";
import { getCategoryMeta } from "@/lib/categoryMeta";

interface CategoryCardProps {
  category: Category;
  lessonCount: number;
  index?: number;
  active?: boolean;
  /** عند تمريرها: الضغط يختار القسم محلياً (يعرض دروسه أسفل الكروت) بدل الانتقال لصفحة الدورات */
  onSelect?: () => void;
}

/* يطبّع روابط localhost المخزّنة إلى مسار نسبي يعمل خلف البروكسي */
function normalizeUrl(url: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.pathname + parsed.search;
    }
  } catch { /* مسار نسبي بالفعل */ }
  return url;
}

/* يتحقّق من صحّة لون الـaccent قبل حقنه في CSS ويعيد البديل عند الخطأ */
function safeColor(input: string | null | undefined, fallback: string): string {
  const c = (input || "").trim();
  if (!c) return fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) return c;
  if (/^(rgb|hsl)a?\([0-9.,%\s/]+\)$/i.test(c)) return c;
  return fallback;
}

/* صياغة عدد الدروس بالعربية الصحيحة */
function lessonsLabel(n: number) {
  if (n <= 0) return "قريباً";
  if (n === 1) return "درس واحد";
  if (n === 2) return "درسان";
  if (n <= 10) return `${n} دروس`;
  return `${n} درساً`;
}

export function CategoryCard({ category, lessonCount, index = 0, active = false, onSelect }: CategoryCardProps) {
  const meta = getCategoryMeta(category.name, category.slug);
  const Icon = meta.Icon;
  const [imgError, setImgError] = useState(false);

  const imageUrl = normalizeUrl(category.imageUrl || "");
  const hasImage = !!imageUrl && !imgError;
  const isEmojiIcon = !!category.icon && /\p{Extended_Pictographic}/u.test(category.icon);
  const accent = safeColor(category.accentColor, meta.color);
  const description = category.description || meta.description;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: (index % 8) * 0.06, duration: 0.4 }}
      className="h-full"
    >
      <Link
        href={`/videos?categoryId=${category.id}`}
        onClick={onSelect ? (e) => { e.preventDefault(); onSelect(); } : undefined}
        className="cat-card-link block h-full outline-none"
      >
        <article
          style={{ ["--accent" as string]: accent } as React.CSSProperties}
          data-active={active ? "true" : undefined}
          aria-label={category.name}
          aria-current={active ? "true" : undefined}
          className="cat-card group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_2px_16px_rgba(15,23,42,0.05)]"
        >
          {/* ── منطقة الصورة الكبيرة ── */}
          <div
            className="relative aspect-[16/10] w-full overflow-hidden"
            style={{
              backgroundImage: `linear-gradient(140deg, color-mix(in srgb, ${accent} 18%, transparent), color-mix(in srgb, ${accent} 5%, transparent))`,
            }}
          >
            {/* نقش دوائر دقيق يعكس هوية فكّ الشفرات */}
            <div
              className="absolute inset-0"
              style={{
                color: accent,
                opacity: 0.1,
                backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.5px)",
                backgroundSize: "16px 16px",
              }}
            />
            {/* توهّج ناعم */}
            <div
              className="absolute -top-12 -left-10 h-40 w-40 rounded-full blur-3xl"
              style={{ background: `color-mix(in srgb, ${accent} 26%, transparent)` }}
            />

            {/* الصورة / الأيقونة */}
            <div className="cat-media absolute inset-0 flex items-center justify-center p-6">
              {hasImage ? (
                <img
                  src={imageUrl}
                  alt={category.name}
                  loading="lazy"
                  className="h-full w-full object-contain drop-shadow-sm"
                  onError={() => setImgError(true)}
                />
              ) : isEmojiIcon ? (
                <span className="text-6xl leading-none drop-shadow-sm">{category.icon}</span>
              ) : (
                <Icon className="h-20 w-20" style={{ color: accent }} strokeWidth={1.5} />
              )}
            </div>

            {/* شارة عدد الدروس */}
            <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-foreground/75 shadow-sm backdrop-blur-sm">
              <PlayCircle className="h-3.5 w-3.5" style={{ color: accent }} />
              {lessonsLabel(lessonCount)}
            </span>

            {/* شارة الحالة: محدّد / مميّز */}
            {active ? (
              <span
                className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold text-white shadow-sm"
                style={{ background: accent }}
              >
                <Check className="h-3.5 w-3.5" />
                محدّد
              </span>
            ) : category.isFeatured ? (
              <span
                className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold text-white shadow-sm"
                style={{ background: accent }}
              >
                <Star className="h-3 w-3 fill-current" />
                مميّز
              </span>
            ) : null}
          </div>

          {/* ── المحتوى ── */}
          <div className="flex flex-1 flex-col p-5">
            <h3 className="cat-name font-display text-xl font-extrabold leading-tight text-foreground transition-colors">
              {category.name}
            </h3>
            <p className="mb-5 mt-1.5 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>

            <div className="flex items-center justify-between border-t border-border/70 pt-4">
              <span className="cat-cta text-sm font-bold" style={{ color: accent }}>
                استعراض الدروس
              </span>
              <span
                className="cat-arrow-btn flex h-9 w-9 items-center justify-center rounded-full border"
                aria-hidden="true"
              >
                <ArrowLeft className="h-4 w-4" />
              </span>
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}
