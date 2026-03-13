import { PlayCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/40 py-12 mt-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="GAB Logo" className="h-10 w-auto rounded-xl bg-white px-2 py-1" />
          </div>
          
          <div className="text-sm text-foreground/60">
            © {new Date().getFullYear()} جميع الحقوق محفوظة. منصة احتراف فلاش وديكوداج الهواتف.
          </div>
          
          <div className="flex gap-4 text-sm font-medium text-foreground/60">
            <a href="#" className="hover:text-primary transition-colors">الشروط والأحكام</a>
            <a href="#" className="hover:text-primary transition-colors">سياسة الخصوصية</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
