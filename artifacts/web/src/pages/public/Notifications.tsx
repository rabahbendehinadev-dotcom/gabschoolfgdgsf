import { Bell } from "lucide-react";
import { motion } from "framer-motion";

export function Notifications() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="mb-5 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
        <Bell className="h-6 w-6 text-primary" />
        الإشعارات
      </h1>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center rounded-3xl border border-border bg-white/80 px-6 py-16 text-center shadow-[0_4px_20px_rgba(15,23,42,0.05)] backdrop-blur-xl"
      >
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
          <Bell className="h-10 w-10 text-orange-500" />
        </div>
        <h2 className="mb-2 text-lg font-bold text-foreground">لا توجد إشعارات بعد</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          سنُعلمك هنا بأحدث الدورات والمنشورات والتحديثات المهمة في منصة GAB.
        </p>
      </motion.div>
    </div>
  );
}
