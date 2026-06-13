import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, PlayCircle, Star } from "lucide-react";
import { Category } from "@workspace/api-client-react/src/generated/api.schemas";
import { getCategoryMeta } from "@/lib/categoryMeta";

interface CategoryCardProps {
  category: Category;
  lessonCount: number;
  index?: number;
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

export function CategoryCard({ category, lessonCount, index = 0 }: CategoryCardProps) {
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
      <Link href={`/videos?categoryId=${category.id}`} className="cat-card-link block h-full outline-none">
        <article
          style={{ ["--accent" as string]: accent } as React.CSSProperties}
          aria-label={category.name}
          className="cat-card group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_2px_14px_rgba(15,23,42,0.05)]"
        >
          {/* شريط الغلاف الملوّن */}
          <div
            className="relative h-24 w-full overflow-hidden"
            style={{
              backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${accent} 20%, transparent), color-mix(in srgb, ${accent} 4%, transparent))`,
            }}
          >
            {/* نقش دوائر دقيق يعكس هوية فكّ الشفرات */}
            <div
              className="absolute inset-0"
              style={{
                color: accent,
                opacity: 0.1,
                backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.5px)",
                backgroundSize: "14px 14px",
              }}
            />
            {/* توهّج ناعم */}
            <div
              className="absolute -top-10 -left-6 h-28 w-28 rounded-full blur-2xl"
              style={{ background: `color-mix(in srgb, ${accent} 28%, transparent)` }}
            />

            {/* شارة عدد الدروس */}
            <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold text-foreground/70 shadow-sm backdrop-blur-sm">
              <PlayCircle className="h-3.5 w-3.5" style={{ color: accent }} />
              {lessonsLabel(lessonCount)}
            </span>

            {/* شارة قسم مميّز */}
            {category.isFeatured && (
              <span
                className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white shadow-sm"
                style={{ background: accent }}
              >
                <Star className="h-3 w-3 fill-current" />
                مميّز
              </span>
            )}
          </div>

          {/* بلاطة الشعار العائمة */}
          <div className="cat-logo absolute right-5 top-[60px] z-20 flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_-8px_rgba(15,23,42,0.22)] ring-1 ring-black/5">
            {hasImage ? (
              <img
                src={imageUrl}
                alt={category.name}
                className="h-full w-full object-contain p-2"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : isEmojiIcon ? (
              <span className="text-3xl leading-none">{category.icon}</span>
            ) : (
              <span
                className="flex h-full w-full items-center justify-center"
                style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
              >
                <Icon className="h-8 w-8" style={{ color: accent }} />
              </span>
            )}
          </div>

          {/* المحتوى */}
          <div className="flex flex-1 flex-col px-5 pb-5 pt-11">
            <h3 className="cat-name mb-1.5 font-display text-lg font-extrabold leading-tight text-foreground transition-colors">
              {category.name}
            </h3>
            <p className="mb-5 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
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
