import { useState } from "react";
import { Link } from "wouter";
import { useGetVideos, useGetCategories } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Input } from "@/components/ui";
import { Search, Crown, PlayCircle, Filter, Lock } from "lucide-react";
import { motion } from "framer-motion";

export function Videos() {
  const { user, getAuthHeaders } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();

  const { data: videos, isLoading } = useGetVideos(
    { search: search || undefined, categoryId },
    { request: getAuthHeaders() }
  );
  
  const { data: categories } = useGetCategories();

  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        
        {/* Header & Filters */}
        <div className="mb-12 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">مكتبة الدروس</h1>
              <p className="text-foreground/60">تصفح جميع دروس الفلاش والديكوداج</p>
            </div>
            
            <div className="w-full md:w-96 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                placeholder="ابحث عن درس أو هاتف..." 
                className="pl-4 pr-10 bg-white/5 border-white/10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <Badge 
              variant={!categoryId ? "default" : "outline"}
              className="cursor-pointer whitespace-nowrap text-sm py-1.5 px-4"
              onClick={() => setCategoryId(undefined)}
            >
              الكل
            </Badge>
            {categories?.map(cat => (
              <Badge 
                key={cat.id}
                variant={categoryId === cat.id ? "default" : "outline"}
                className="cursor-pointer whitespace-nowrap text-sm py-1.5 px-4 bg-white/5"
                onClick={() => setCategoryId(cat.id)}
              >
                {cat.name}
              </Badge>
            ))}
          </div>

          {/* Guest notice banner */}
          {!isLoggedIn && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between gap-4 bg-primary/10 border border-primary/30 rounded-xl px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary shrink-0" />
                <p className="text-sm font-medium">
                  قم بتسجيل الدخول للوصول إلى الدروس والمحتوى
                </p>
              </div>
              <Link href="/login">
                <Button size="sm" className="shrink-0">تسجيل الدخول</Button>
              </Link>
            </motion.div>
          )}
        </div>

        {/* Video Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => (
              <Card key={i} className="h-72 animate-pulse bg-white/5 border-white/10" />
            ))}
          </div>
        ) : videos?.length === 0 ? (
          <div className="text-center py-24 bg-white/5 rounded-2xl border border-white/10">
            <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">لم يتم العثور على دروس</h3>
            <p className="text-muted-foreground">جرب تغيير كلمات البحث أو التصنيف</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos?.map((video, i) => {
              const card = (
                <Card className={`overflow-hidden glass-card transition-all duration-300 group h-full flex flex-col ${isLoggedIn ? "hover:-translate-y-1 hover:border-primary/50 cursor-pointer" : "cursor-not-allowed opacity-75"}`}>
                  <div className="relative aspect-video bg-black overflow-hidden">
                    <img 
                      src={video.thumbnailUrl || `https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80`} 
                      alt={video.title}
                      className={`w-full h-full object-cover transition-transform duration-500 ${isLoggedIn ? "opacity-80 group-hover:opacity-100 group-hover:scale-105" : "opacity-50"}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {isLoggedIn ? (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-14 h-14 rounded-full bg-primary/90 text-white flex items-center justify-center backdrop-blur-sm shadow-lg glow-primary">
                          <PlayCircle className="w-8 h-8 ml-1" />
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-14 h-14 rounded-full bg-black/60 border border-white/20 text-white/70 flex items-center justify-center backdrop-blur-sm">
                          <Lock className="w-6 h-6" />
                        </div>
                      </div>
                    )}

                    <div className="absolute top-3 right-3 flex gap-2">
                      {video.isVipOnly && (
                        <Badge variant="vip" className="shadow-lg">
                          <Crown className="w-3 h-3 ml-1" /> VIP
                        </Badge>
                      )}
                    </div>
                    <div className="absolute bottom-3 right-3">
                      <Badge variant="secondary" className="bg-black/60 backdrop-blur-md border-white/10 text-white hover:bg-black/60">
                        {video.categoryName}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className={`font-bold text-lg leading-tight mb-2 line-clamp-2 transition-colors ${isLoggedIn ? "group-hover:text-primary" : "text-foreground/70"}`}>
                      {video.title}
                    </h3>
                    <p className="text-sm text-foreground/60 line-clamp-2 mt-auto">
                      {video.description}
                    </p>
                    {!isLoggedIn && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-primary/80 font-medium flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          سجّل دخولك لمشاهدة هذا الدرس
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              );

              return (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  {isLoggedIn ? (
                    <Link href={`/videos/${video.id}`}>{card}</Link>
                  ) : (
                    card
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
