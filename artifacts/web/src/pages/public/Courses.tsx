import { useMemo } from "react";
import { useLocation } from "wouter";
import { useGetCategories, useGetVideos } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { CategoryCard } from "@/components/public/CategoryCard";
import { motion } from "framer-motion";
import { GraduationCap } from "lucide-react";

export function Courses() {
  const { user, getAuthHeaders } = useAuth();
  const [, navigate] = useLocation();
  const { data: categories } = useGetCategories();
  const { data: allVideos } = useGetVideos({}, { request: getAuthHeaders() });

  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    (allVideos ?? []).forEach((v) => map.set(v.categoryId, (map.get(v.categoryId) ?? 0) + 1));
    return map;
  }, [allVideos]);

  const handleSelect = (id: number) => {
    navigate(`/videos?categoryId=${id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-24" dir="rtl">
      {/* Header */}
      <div className="border-b border-border bg-white/80 backdrop-blur-sm px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-foreground sm:text-2xl">الدورات</h1>
              <p className="text-sm text-muted-foreground">اختر دورة وابدأ رحلتك</p>
            </div>
          </div>
        </div>
      </div>

      {/* Categories grid */}
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {!categories || categories.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">لا توجد دورات بعد</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((cat, i) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <CategoryCard
                  category={cat}
                  lessonCount={countByCategory.get(cat.id) ?? 0}
                  isActive={false}
                  onSelect={() => handleSelect(cat.id)}
                  isVip={user?.accountType === "vip"}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
