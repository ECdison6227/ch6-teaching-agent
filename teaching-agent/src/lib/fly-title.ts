/**
 * 共享元素式的标题飞入：从知识地图点进课件时，知识点名从原位置平滑"飞"到课件顶栏。
 * 两个视图是常驻的独立图层，不能用 layoutId，所以用一个临时克隆做 FLIP。
 */
const squash = (s: string) => s.replace(/\s+/g, "");

export function flyTitle(source: HTMLElement, text: string) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const from = source.getBoundingClientRect();
  const cs = getComputedStyle(source);
  const clone = document.createElement("span");
  clone.className = "fly-title";
  clone.textContent = source.textContent || text;
  Object.assign(clone.style, {
    left: `${from.left}px`, top: `${from.top}px`,
    font: cs.font, color: cs.color, letterSpacing: cs.letterSpacing,
  });
  document.body.appendChild(clone);
  source.style.visibility = "hidden";
  window.setTimeout(() => { source.style.visibility = ""; }, 900);

  const started = performance.now();
  const find = () => {
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-fly-target]"))
      .find(el => el.offsetParent !== null && squash(el.textContent ?? "").includes(squash(text)) && el.closest('[aria-hidden="true"]') === null);
    if (!target) {
      if (performance.now() - started < 900) { requestAnimationFrame(find); return; }
      clone.remove(); return;
    }
    const to = target.getBoundingClientRect();
    const toCs = getComputedStyle(target);
    // 目标文字以知识点编号开头时，飞到名字所在的位置
    const lead = /^K\d+\s*/.exec(target.textContent ?? "")?.[0].length ?? 0;
    let offset = 0;
    if (lead > 0) {
      const probe = document.createElement("span");
      probe.style.cssText = `position:fixed;visibility:hidden;white-space:pre;font:${toCs.font}`;
      probe.textContent = (target.textContent ?? "").slice(0, lead);
      document.body.appendChild(probe);
      offset = probe.getBoundingClientRect().width;
      probe.remove();
    }
    const scale = parseFloat(toCs.fontSize) / parseFloat(cs.fontSize);
    const dx = to.left + offset - from.left;
    const dy = to.top + (to.height - from.height * scale) / 2 - from.top;
    target.style.transition = "none";
    target.style.opacity = "0";
    const anim = clone.animate(
      [
        { transform: "translate(0,0) scale(1)", color: cs.color },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, color: toCs.color },
      ],
      { duration: 560, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
    const done = () => {
      target.style.transition = "opacity .18s ease";
      target.style.opacity = "";
      clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).onfinish = () => clone.remove();
    };
    anim.onfinish = done;
    anim.oncancel = done;
  };
  requestAnimationFrame(find);
}
