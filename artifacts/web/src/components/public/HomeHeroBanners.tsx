import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fetchActiveHeroBanners, type HeroBanner } from "@/features/heroBanners/api";

const SHOW_DELAY_MS = 2500;
const ROTATION_MS = 4500;

export function HomeHeroBanners() {
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    fetchActiveHeroBanners()
      .then((items) => {
        if (!cancelled) setBanners(items.filter((item) => item.desktopImageUrl));
      })
      .catch(() => {
        if (!cancelled) setBanners([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (banners.length === 0) return;
    const showTimer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(showTimer);
  }, [banners.length]);

  useEffect(() => {
    if (!visible || reducedMotion || banners.length < 2) return;
    const rotationTimer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % banners.length);
    }, ROTATION_MS);
    return () => window.clearInterval(rotationTimer);
  }, [banners.length, reducedMotion, visible]);

  const preloadUrls = useMemo(
    () => banners.flatMap((banner) => [banner.desktopImageUrl, banner.mobileImageUrl]).filter(Boolean) as string[],
    [banners],
  );

  useEffect(() => {
    preloadUrls.forEach((url) => {
      const image = new Image();
      image.src = url;
    });
  }, [preloadUrls]);

  if (banners.length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[15] overflow-hidden transition-opacity ${reducedMotion ? "duration-0" : "duration-1000"} ${visible ? "opacity-100" : "opacity-0"}`}
      aria-label="Promotional banners"
      aria-live={reducedMotion ? "polite" : "off"}
    >
      <div className="absolute inset-0 bg-neutral-950/45" />
      <div className="absolute inset-0 flex items-center justify-center p-5 sm:p-8 lg:p-12">
        {banners.map((banner, index) => (
          <motion.picture
            key={banner.id}
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-1000 ${index === activeIndex ? "opacity-100" : "opacity-0"}`}
            initial={false}
            animate={index === activeIndex ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.015 }}
            transition={{ duration: reducedMotion ? 0 : 1 }}
            aria-hidden={index !== activeIndex}
          >
            {banner.mobileImageUrl && (
              <source media="(max-width: 767px)" srcSet={banner.mobileImageUrl} />
            )}
            <img
              src={banner.desktopImageUrl!}
              alt=""
              className="h-full w-full object-contain object-center opacity-95"
              draggable={false}
            />
          </motion.picture>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 gap-1.5" role="tablist" aria-label="Banner slides">
          {banners.map((banner, index) => (
            <span
              key={banner.id}
              role="tab"
              aria-selected={index === activeIndex}
              className={`h-1 rounded-full transition-all ${index === activeIndex ? "w-6 bg-orange-400" : "w-2 bg-white/45"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}