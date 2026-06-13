import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, PlayCircle } from "lucide-react";
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

export function CategoryCard({ category, lessonCount, index = 0 }: CategoryCardProps) {
  const meta = getCategoryMeta(category.name, category.slug);
  const Icon = meta.Icon;

  const imageUrl = normalizeUrl(category.imageUrl || "");
  const isEmojiIcon = !!category.icon && /\p{Extended_Pictographic}/u.test(category.icon);
  const accent = category.accentColor || "";
  const description = category.description || meta.description;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: (index % 8) * 0.05 }}
      className="h-full"
    >
      <Link href={`/videos?categoryId=${category.id}`}>
        <div className="group relative h-full flex flex-col rounded-2xl border border-border bg-card p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 overflow-hidden transition-transform duration-300 group-hover:scale-110 ${imageUrl || accent ? "" : `bg-gradient-to-br ${meta.gradient}`}`}
            style={accent && !imageUrl ? { background: `${accent}26` } : accent && imageUrl ? { background: `${accent}14` } : undefined}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={category.name}
                className="w-full h-full object-contain p-1.5"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : isEmojiIcon ? (
              <span className="text-2xl leading-none">{category.icon}</span>
            ) : (
              <Icon className={`w-7 h-7 ${meta.text}`} style={accent ? { color: accent } : undefined} />
            )}
          </div>

          <h3 className="font-bold text-lg mb-1.5 transition-colors group-hover:text-primary">
            {category.name}
          </h3>
          <p className="text-sm text-foreground/55 leading-relaxed line-clamp-2 mb-4 flex-1">
            {description}
          </p>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs font-semibold text-foreground/50 flex items-center gap-1">
              <PlayCircle className="w-3.5 h-3.5" />
              {lessonCount} درس
            </span>
            <span
              className="text-xs font-bold text-primary flex items-center gap-1 transition-all group-hover:gap-2"
              style={accent ? { color: accent } : undefined}
            >
              استعراض الدروس
              <ArrowLeft className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
