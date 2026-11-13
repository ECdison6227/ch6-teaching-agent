"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BlurFade } from "@/components/ui/blur-fade";
import { DotPattern } from "@/components/ui/dot-pattern";
import { BorderBeam } from "@/components/ui/border-beam";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { readStudyPosition, requestStudySection, type StudyPosition } from "@/lib/study-nav";
import { questions } from "@/lib/questions";
import { appPath } from "@/lib/app-path";
import type { AppView } from "@/lib/views";
import slidesData from "@/content/slides.json";
import { BeamHero } from "./BeamHero";

const slides = slidesData as { page: number; section: string }[];

const GROUPS = [
  { title: "概述", ids: ["K1"] },
  { title: "正截面受弯", ids: ["K2", "K3", "K4", "K5", "K6", "K7"] },
  { title: "斜截面受剪", ids: ["K8", "K9", "K10", "K11"] },
  { title: "受扭 · 变形 · 裂缝", ids: ["K12", "K13", "K14"], book: true },
] as const;

const pad = (kid: string) => `K${kid.slice(1).padStart(2, "0")}`;

export function CourseHome({ active, onView }: { active: boolean; onView: (view: AppView) => void }) {
  const [last, setLast] = useState<StudyPosition | null>(null);
  useEffect(() => { if (active) setLast(readStudyPosition()); }, [active]);

  const pages = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of slides) {
      const kid = /^K\d+/.exec(s.section)?.[0];
      if (kid) count.set(kid, (count.get(kid) ?? 0) + 1);
    }
    return count;
  }, []);

  const openSection = (kid: string) => { requestStudySection(kid); onView("slides"); };
  const resume = () => { if (last) requestStudySection(last.kid); onView("slides"); };

  return (
    <div className="course-home h-full overflow-y-auto">
      <header className="kimi-toolbar course-home-bar">
        <SidebarTrigger />
        <span className="text-[13px] text-muted-foreground">东南大学 · 土木工程学院</span>
        <span className="ml-auto mono-kicker">CH.06</span>
      </header>

      {/* 首屏 */}
      <section className="course-hero">
        <DotPattern width={22} height={22} cr={0.9} className="course-hero-dots" />
        <div className="course-wrap relative">
          <BlurFade delay={0.05} inView>
            <p className="mono-kicker">工程结构设计原理 · 第六章</p>
          </BlurFade>
          <BlurFade delay={0.12} inView>
            <h1 className="course-title font-serif-cn">钢筋混凝土梁<br />承载力计算原理</h1>
          </BlurFade>
          <BlurFade delay={0.22} inView>
            <div className="course-cta-row">
              <button type="button" className="course-cta" onClick={resume}>
                {last ? <><span className="course-cta-dot" />继续学习<span className="course-cta-sub">{pad(last.kid)} {last.name}</span></> : "开始学习"}
                <ArrowRight className="size-4" />
              </button>
              <button type="button" className="course-cta-ghost" onClick={() => onView("chat")}>问 AI 助教</button>
            </div>
          </BlurFade>
          <BlurFade delay={0.3} inView>
            <dl className="course-stats">
              <div><dt>页课件</dt><dd><NumberTicker value={slides.length} delay={0.5} /></dd></div>
              <div><dt>个知识点</dt><dd><NumberTicker value={KNOWLEDGE_SECTIONS.length} delay={0.6} /></dd></div>
              <div><dt>道题</dt><dd><NumberTicker value={questions.length} delay={0.7} /></dd></div>
            </dl>
          </BlurFade>
        </div>
        <div className="course-wrap relative mt-10">
          <BlurFade delay={0.35} inView>
            <BeamHero active={active} />
          </BlurFade>
        </div>
      </section>

      {/* 知识地图 */}
      <section className="course-section">
        <div className="course-wrap">
          <div className="course-section-head">
            <h2 className="font-serif-cn">知识地图</h2>
            <span className="mono-kicker">K01 — K14</span>
          </div>
          <div className="kmap">
            {GROUPS.map((group, gi) => (
              <BlurFade key={group.title} delay={0.05 * gi} inView className="kmap-group">
                <h3 className="kmap-group-title">
                  <span className="font-serif-cn">{group.title}</span>
                  {"book" in group ? <span className="kmap-tag">教材</span> : null}
                </h3>
                <ol>
                  {group.ids.map(kid => {
                    const s = KNOWLEDGE_SECTIONS.find(x => x.id === kid)!;
                    const here = last?.kid === kid;
                    return (
                      <li key={kid}>
                        <button type="button" className="kmap-row" data-here={here || undefined} onClick={() => openSection(kid)}>
                          <span className="kmap-code">{pad(kid)}</span>
                          <span className="kmap-name">{s.name}</span>
                          <span className="kmap-meta">{here ? <><span className="kmap-here" />上次学到</> : pages.get(kid) ? `${pages.get(kid)} 页` : "习题"}</span>
                          <ArrowRight className="kmap-arrow" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* 工具 */}
      <section className="course-section">
        <div className="course-wrap">
          <div className="course-section-head">
            <h2 className="font-serif-cn">动手</h2>
          </div>
          <div className="bento">
            <BlurFade inView className="bento-cell bento-demo">
              <button type="button" onClick={() => onView("demo")} className="bento-tile">
                <span className="bento-title">受力演示<ArrowUpRight /></span>
                <MiniStrain />
                <span className="bento-foot">单筋 · 双筋</span>
              </button>
            </BlurFade>
            <BlurFade inView delay={0.06} className="bento-cell">
              <button type="button" onClick={() => onView("lab")} className="bento-tile">
                <span className="bento-title">配筋计算<ArrowUpRight /></span>
                <span className="bento-formula font-serif-cn">α<sub>1</sub>f<sub>c</sub>bx = f<sub>y</sub>A<sub>s</sub></span>
                <span className="bento-foot">设计 · 复核</span>
              </button>
            </BlurFade>
            <BlurFade inView delay={0.12} className="bento-cell">
              <button type="button" onClick={() => onView("classroom")} className="bento-tile relative overflow-hidden">
                <span className="bento-title">课堂<ArrowUpRight /></span>
                <span className="bento-code" aria-hidden>{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</span>
                <span className="bento-foot">输入课堂码加入</span>
                <BorderBeam size={70} duration={7} colorFrom="#111" colorTo="#b08a3e" />
              </button>
            </BlurFade>
            <BlurFade inView delay={0.18} className="bento-cell">
              <button type="button" onClick={() => onView("practice")} className="bento-tile">
                <span className="bento-title">练习<ArrowUpRight /></span>
                <span className="bento-big"><NumberTicker value={questions.length + 610} /></span>
                <span className="bento-foot">自测 · 专项 · 错题本</span>
              </button>
            </BlurFade>
            <BlurFade inView delay={0.24} className="bento-cell">
              <button type="button" onClick={() => onView("materials")} className="bento-tile">
                <span className="bento-title">资料下载<ArrowUpRight /></span>
                <span className="bento-pdf" aria-hidden><span /><span /><span /></span>
                <span className="bento-foot">课件 · 讲解 · 题目 PDF</span>
              </button>
            </BlurFade>
          </div>
        </div>
      </section>

      <footer className="course-foot">
        <div className="course-wrap flex flex-wrap items-center gap-x-5 gap-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appPath("/seu-badge.svg")} alt="东南大学校徽" className="size-9" />
          <div className="leading-6">
            <p className="text-[13px] font-medium">东南大学 · 土木工程学院</p>
            <p className="text-[12px] text-muted-foreground">工程结构设计原理 · 第六章</p>
          </div>
          <p className="ml-auto font-serif-cn text-[13px] tracking-[0.5em] text-muted-foreground">止于至善</p>
        </div>
      </footer>
    </div>
  );
}

/** 截面应变示意：受压区高度随时间往复，像在拖动配筋率 */
function MiniStrain() {
  const na = [48, 34, 66, 48];
  const strain = na.map(y => `M150,10 L130,10 L${(150 + (20 * (110 - y)) / (y - 10)).toFixed(1)},110 L150,110 Z`);
  const t = { duration: 6, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <svg viewBox="0 0 220 120" className="bento-art" aria-hidden>
      <rect x="20" y="10" width="54" height="100" className="art-section" />
      {[32, 47, 62].map(x => <circle key={x} cx={x} cy={97} r={4} className="art-bar" />)}
      <line x1="150" x2="150" y1="4" y2="116" className="art-line" />
      <motion.path className="art-strain" initial={{ d: strain[0] }} animate={{ d: strain }} transition={t} />
      <motion.line x1="12" x2="206" className="art-na" initial={{ y1: na[0], y2: na[0] }} animate={{ y1: na, y2: na }} transition={t} />
      <text x="112" y="20" className="art-text">ε<tspan dy="3" fontSize="7">cu</tspan></text>
    </svg>
  );
}
