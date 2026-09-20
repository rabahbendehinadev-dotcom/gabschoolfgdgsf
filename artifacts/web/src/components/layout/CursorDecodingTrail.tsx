import { useEffect, useRef } from "react";

const TOKENS = ["0", "1", "A", "B", "C", "D", "E", "F", "0x", "FF", "A1", "7E", "3C", "<>", "{}", "[]", "#", "+", "/"];
const MAX_VISIBLE = 10;
const MIN_INTERVAL_MS = 55;
const MIN_DISTANCE_PX = 16;

export function CursorDecodingTrail() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    let frame = 0;
    let pendingX = 0;
    let pendingY = 0;
    let pendingInteractive = false;
    let lastX = Number.NEGATIVE_INFINITY;
    let lastY = Number.NEGATIVE_INFINITY;
    let lastSpawn = 0;
    let tokenIndex = 0;
    const visible: HTMLElement[] = [];

    const removeParticle = (particle: HTMLElement) => {
      const index = visible.indexOf(particle);
      if (index >= 0) visible.splice(index, 1);
      particle.remove();
    };

    const spawn = (now: number) => {
      frame = 0;
      const distance = Math.hypot(pendingX - lastX, pendingY - lastY);
      if (now - lastSpawn < MIN_INTERVAL_MS || distance < MIN_DISTANCE_PX) return;

      lastSpawn = now;
      lastX = pendingX;
      lastY = pendingY;

      const particle = document.createElement("span");
      const angle = tokenIndex * 2.399963;
      const offset = 7 + (tokenIndex % 3) * 2;
      particle.textContent = TOKENS[tokenIndex % TOKENS.length];
      particle.className = `gab-cursor-code${pendingInteractive && tokenIndex % 3 === 0 ? " is-interactive" : ""}`;
      particle.style.left = `${pendingX + Math.cos(angle) * offset}px`;
      particle.style.top = `${pendingY + Math.sin(angle) * offset}px`;
      particle.style.setProperty("--trail-x", `${-5 - (tokenIndex % 4) * 2}px`);
      particle.style.setProperty("--trail-y", `${-9 - (tokenIndex % 3) * 3}px`);
      particle.style.setProperty("--trail-rotate", `${-5 + (tokenIndex % 5) * 2.5}deg`);
      tokenIndex += 1;

      particle.addEventListener("animationend", () => removeParticle(particle), { once: true });
      layer.appendChild(particle);
      visible.push(particle);

      while (visible.length > MAX_VISIBLE) removeParticle(visible[0]);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (
        (event.pointerType && event.pointerType !== "mouse")
        || !finePointer.matches
        || reducedMotion.matches
      ) return;
      pendingX = event.clientX;
      pendingY = event.clientY;
      const interactive = event.target instanceof Element
        ? event.target.closest("a[href], button, select, summary, label[for], [role='button'], [role='link'], [class~='cursor-pointer']")
        : null;
      pendingInteractive = Boolean(
        interactive
        && !interactive.matches(":disabled, [aria-disabled='true']")
      );
      if (!frame) frame = requestAnimationFrame(spawn);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (frame) cancelAnimationFrame(frame);
      visible.forEach((particle) => particle.remove());
    };
  }, []);

  return <div ref={layerRef} className="gab-cursor-trail" aria-hidden="true" />;
}