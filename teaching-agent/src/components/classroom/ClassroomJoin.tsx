"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appPath } from "@/lib/app-path";
import { classroomFetch } from "@/hooks/use-classroom";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";

type Found = { title: string; status: string; participants: number };

/** 一个数字格：数字从上方落进来，当前格有光标 */
function CodeSlot({ slot, index }: { slot: SlotProps; index: number }) {
  return (
    <div className="code-slot" data-active={slot.isActive || undefined} data-filled={!!slot.char || undefined}>
      <AnimatePresence mode="popLayout" initial={false}>
        {slot.char ? (
          <motion.span key={slot.char + index} initial={{ y: -18, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 26 }}>
            {slot.char}
          </motion.span>
        ) : null}
      </AnimatePresence>
      {slot.hasFakeCaret ? <span className="code-caret" /> : null}
    </div>
  );
}

/**
 * 加入课堂两步走：
 * 1. 六格课堂码，填满自动查询；查到后格子合成一枚印章盖下去
 * 2. 只填姓名（学号可选），进入课堂
 * 扫码进来（/join/123456）直接从第 2 步开始。
 */
export function ClassroomJoin({ initialCode = "", onJoined }: { initialCode?: string; onJoined: (classroomId: string, code: string) => void }) {
  const reduce = useHydratedReducedMotion();
  const [code, setCode] = useState(initialCode);
  const [found, setFound] = useState<Found | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();
  const nameRef = useRef<HTMLInputElement>(null);

  const lookup = async (value: string) => {
    setChecking(true); setError("");
    try {
      const result = await classroomFetch<Found>("/api/classroom-participation/lookup", { code: value });
      setFound(result);
      window.setTimeout(() => nameRef.current?.focus(), reduce ? 0 : 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "没有找到这个课堂");
      if (!reduce) void shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.42 } });
    } finally { setChecking(false); }
  };

  useEffect(() => { if (/^\d{6}$/.test(initialCode)) void lookup(initialCode); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initialCode]);

  const join = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await classroomFetch("/api/classroom-participation/session", {});
      const result = await classroomFetch<{ classroomId: string }>("/api/classroom-participation/join", { code, name, studentNo });
      try { localStorage.setItem(`ch6-classroom:${appPath("/")}:${code}`, result.classroomId); } catch { /* Cookie 仍可用 */ }
      onJoined(result.classroomId, code);
    } catch (e) { setError(e instanceof Error ? e.message : "加入失败，请重试"); }
    finally { setBusy(false); }
  };

  const back = () => { setFound(null); setCode(""); setError(""); };

  return (
    <div className="join-flow">
      <AnimatePresence mode="wait" initial={false}>
        {!found ? (
          <motion.section key="code" className="join-step" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }} transition={{ duration: 0.28 }}>
            <h1 className="join-title font-serif-cn">加入课堂</h1>
            <motion.div animate={shake}>
              <OTPInput
                maxLength={6}
                value={code}
                onChange={v => { setCode(v); setError(""); }}
                onComplete={(v: string) => void lookup(v)}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoFocus
                disabled={checking}
                aria-label="六位课堂码"
                containerClassName="code-row"
                render={({ slots }) => <>{slots.slice(0, 3).map((slot, i) => <CodeSlot key={i} slot={slot} index={i} />)}<span className="code-dash" />{slots.slice(3).map((slot, i) => <CodeSlot key={i + 3} slot={slot} index={i + 3} />)}</>}
              />
            </motion.div>
            <p className={`join-msg ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{error || (checking ? "正在查找课堂…" : "输入老师给的 6 位课堂码")}</p>
          </motion.section>
        ) : (
          <motion.section key="name" className="join-step" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="join-seal"
              initial={reduce ? false : { scale: 1.7, rotate: -14, opacity: 0 }}
              animate={{ scale: 1, rotate: -4, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 17, mass: 0.9 }}
            >
              <span className="join-seal-code">{code.slice(0, 3)}<i />{code.slice(3)}</span>
              <span className="join-seal-label font-serif-cn">课堂</span>
            </motion.div>
            <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.45 }}>
              <h1 className="join-title font-serif-cn">{found.title}</h1>
              <p className="join-msg">{found.status === "active" ? "上课中" : "等待开始"} · 已有 {found.participants} 人加入</p>
              <form onSubmit={join} className="join-form">
                <Input ref={nameRef} name="name" placeholder="你的姓名" maxLength={60} required value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="join-input" />
                <details className="join-more">
                  <summary>填写学号<ChevronDown className="size-3.5" /></summary>
                  <Input name="studentNo" placeholder="学号（选填）" maxLength={80} value={studentNo} onChange={e => setStudentNo(e.target.value)} className="join-input mt-2" />
                </details>
                <Button type="submit" className="join-submit" disabled={busy || !name.trim()}>{busy ? "正在加入…" : "进入课堂"}<ArrowRight /></Button>
                {error ? <p className="join-msg is-error" role="alert">{error}</p> : null}
              </form>
              <button type="button" className="join-back" onClick={back}><ArrowLeft className="size-3.5" />换一个课堂码</button>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
