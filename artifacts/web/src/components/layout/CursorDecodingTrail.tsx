import { useEffect, useRef } from "react";

const TOKENS = ["01", "10", "FF", "A1", "7E", "3C", "0x", "HEX", "<>", "{}", "[]", "#", "+", "/", "A", "B", "C", "D", "E", "F", "0xFF", "A1:7E", "01FF", "3C:A1", "FF01"];
const MAX_VISIBLE = 36;
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

      const fragmentCount = 3 + (tokenIndex % 4);

      for (let fragment = 0; fragment < fragmentCount; fragment += 1) {
        const particle = document.createElement("span");
        const sequence = tokenIndex + fragment;
        const angle = sequence * 2.399963 + fragment * 0.52;
        const offset = 10 + (sequence % 5) * 4;
        const colorSlot = sequence % 20;
        const colorClass = colorSlot < 13 ? "" : colorSlot < 17 ? " is-amber" : " is-teal";

        particle.textContent = TOKENS[sequence % TOKENS.length];
        particle.className = `gab-cursor-code${colorClass}${pendingInteractive && fragment === 0 ? " is-interactive" : ""}`;
        particle.style.left = `${pendingX + Math.cos(angle) * offset}px`;
        particle.style.top = `${pendingY + Math.sin(angle) * offset}px`;
        particle.style.setProperty("--trail-x", `${-5 - (sequence % 5) * 2}px`);
        particle.style.setProperty("--trail-y", `${-12 - (sequence % 4) * 4}px`);
        particle.style.setProperty("--trail-rotate", `${-10 + (sequence % 7) * 3.25}deg`);
        particle.style.setProperty("--trail-size", `${8 + (sequence % 3)}px`);
        particle.style.setProperty("--trail-duration", `${720 + (sequence % 5) * 45}ms`);

        particle.addEventListener("animationend", () => removeParticle(particle), { once: true });
        layer.appendChild(particle);
        visible.push(particle);
      }
      tokenIndex += fragmentCount;

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