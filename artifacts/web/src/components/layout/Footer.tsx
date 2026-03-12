import { PlayCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/40 py-12 mt-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <PlayCircle className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight text-white">
              Cours <span className="text-primary">Online</span>
            </span>
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
