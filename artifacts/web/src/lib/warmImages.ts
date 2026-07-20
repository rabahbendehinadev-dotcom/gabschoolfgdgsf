/**
 * تسخين الصور مسبقاً — يجلب الصور في الخلفية بأولوية منخفضة حتى تكون
 * جاهزة في كاش المتصفح (وكاش الـ Service Worker) قبل أن يدخل الزائر
 * الصفحة التي تعرضها، فتظهر فوراً بدل بطاقات فارغة.
 */

const warmed = new Set<string>();

/** يطبّع روابط localhost المخزّنة إلى مسار نسبي يعمل خلف البروكسي */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.pathname + parsed.search;
    }
  } catch {
    /* مسار نسبي بالفعل */
  }
  return url;
}

export function warmImages(
  urls: Array<string | null | undefined>,
  max = 40,
): void {
  if (typeof window === "undefined") return;

  const list: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    const u = normalizeUrl(raw);
    if (!u || warmed.has(u)) continue;
    warmed.add(u);
    list.push(u);
    if (list.length >= max) break;
  }
  if (list.length === 0) return;

  const run = () => {
    for (const u of list) {
      const img = new Image();
      img.decoding = "async";
      // أولوية منخفضة حتى لا تزاحم محتوى الصفحة الظاهر
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
      img.src = u;
    }
  };

  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 600);
  }
}
