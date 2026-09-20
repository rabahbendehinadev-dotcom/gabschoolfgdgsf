import { useLocale } from "@/i18n";
import { accountMessage } from "@/i18n/accountMessages";

export function Footer() {
  const { locale, direction } = useLocale();
  const m = (key: string) => accountMessage(locale, key);
  return (
    <footer className="border-t border-border bg-muted/60 py-12 mt-24" dir={direction}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="GAB Logo" className="h-10 w-auto rounded-xl bg-white px-2 py-1 shadow-sm" />
          </div>
          
          <div className="text-sm text-foreground/60">
             © {new Date().getFullYear()} {m("rights")}
          </div>
          
          <div className="flex gap-4 text-sm font-medium text-foreground/60">
          <a href="#" className="hover:text-primary transition-colors">{m("terms")}</a>
          <a href="#" className="hover:text-primary transition-colors">{m("privacy")}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
