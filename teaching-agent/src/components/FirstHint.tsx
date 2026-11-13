"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

/** 首次使用的就地提示：每条只出现一次，点掉或 9 秒后自动消失。全站不超过 3 处。 */
export function FirstHint({ id, children, className = "" }: { id: string; children: React.ReactNode; className?: string }) {
  const key = `ch6-hint:${id}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(key)) return;
    const t = window.setTimeout(() => setShow(true), 900);
    return () => window.clearTimeout(t);
  }, [key]);
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => dismiss(), 9000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  const dismiss = () => { setShow(false); try { localStorage.setItem(key, "1"); } catch { /* ignore */ } };
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          className={`first-hint ${className}`}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          role="status"
        >
          <span className="first-hint-dot" />
          <span>{children}</span>
          <button type="button" aria-label="知道了" onClick={dismiss}><X className="size-3.5" /></button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
