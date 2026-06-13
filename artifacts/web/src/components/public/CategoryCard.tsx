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

export function CategoryCard({ category, lessonCount, index = 0 }: CategoryCardProps) {
  const meta = getCategoryMeta(category.name, category.slug);
  const Icon = meta.Icon;
  const isEmojiIcon = !!category.icon && /\p{Extended_Pictographic}/u.test(category.icon);

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
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}>
            {isEmojiIcon ? (
              <span className="text-2xl leading-none">{category.icon}</span>
            ) : (
              <Icon className={`w-7 h-7 ${meta.text}`} />
            )}
          </div>

          <h3 className="font-bold text-lg mb-1.5 transition-colors group-hover:text-primary">
            {category.name}
          </h3>
          <p className="text-sm text-foreground/55 leading-relaxed line-clamp-2 mb-4 flex-1">
            {meta.description}
          </p>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs font-semibold text-foreground/50 flex items-center gap-1">
              <PlayCircle className="w-3.5 h-3.5" />
              {lessonCount} درس
            </span>
            <span className="text-xs font-bold text-primary flex items-center gap-1 transition-all group-hover:gap-2">
              استعراض الدروس
              <ArrowLeft className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
