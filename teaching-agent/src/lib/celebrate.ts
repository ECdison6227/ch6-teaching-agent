import confetti from "canvas-confetti";

/** 整组全对时撒一次彩带：墨色 + 校徽金，不用彩虹色。尊重“减少动态效果”。 */
export function celebrate() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#111111", "#a8823a", "#c9c9c4"];
  const base = { particleCount: 70, spread: 62, startVelocity: 42, ticks: 220, scalar: 0.9, colors, disableForReducedMotion: true };
  confetti({ ...base, angle: 60, origin: { x: 0.25, y: 0.75 } });
  confetti({ ...base, angle: 120, origin: { x: 0.75, y: 0.75 } });
}
