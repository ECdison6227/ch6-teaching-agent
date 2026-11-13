"use client";

import { motion } from "motion/react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeacherSnapshot } from "@/lib/classroom/types";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 课后报告：每题正确率、最多人选的错误选项；可导出全部作答为 CSV（Excel 可直接打开） */
export function ClassroomReport({ state }: { state: TeacherSnapshot }) {
  const total = state.participants.length;
  const rows = state.rounds.map(r => {
    const judged = r.stats.correct + r.stats.incorrect;
    const wrong = Object.entries(r.stats.distribution)
      .filter(([id]) => !(r.answer ?? "").toUpperCase().includes(id))
      .sort((a, b) => b[1] - a[1])[0];
    return { r, rate: judged ? r.stats.correct / judged : null, wrong: wrong && wrong[1] > 0 ? wrong : null };
  });
  const answered = rows.reduce((n, x) => n + x.r.stats.submitted, 0);
  const avg = rows.filter(x => x.rate !== null);
  const mean = avg.length ? avg.reduce((n, x) => n + (x.rate ?? 0), 0) / avg.length : null;

  const exportCsv = () => {
    const head = ["题号", "题目ID", "姓名", "学号", "答案", "结果", "提交时间"];
    const lines = [head.join(",")];
    for (const r of state.rounds) for (const p of state.participants) {
      const s = r.submissions.find(x => x.participantId === p.id);
      lines.push([r.sequence, r.question.id, p.name, p.studentNo, s?.answer ?? "", s ? (s.grade === true ? "对" : s.grade === false ? "错" : "待核对") : "未答", s ? new Date(s.submittedAt).toLocaleString("zh-CN") : ""].map(csvCell).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.classroom.title}-${state.classroom.code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="report">
      <div className="report-head">
        <h2 className="font-serif-cn">课堂报告</h2>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!state.rounds.length}><Download />导出 CSV</Button>
      </div>
      <dl className="report-stats">
        <div><dt>参与人数</dt><dd>{total}</dd></div>
        <div><dt>发布题目</dt><dd>{state.rounds.length}</dd></div>
        <div><dt>作答人次</dt><dd>{answered}</dd></div>
        <div><dt>平均正确率</dt><dd>{mean === null ? "—" : pct(mean)}</dd></div>
      </dl>
      {rows.length ? (
        <ol className="report-list">
          {rows.map(({ r, rate, wrong }, i) => (
            <motion.li key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <span className="report-seq">{String(r.sequence).padStart(2, "0")}</span>
              <span className="report-q">{r.question.prompt.replace(/[*`$]/g, "").slice(0, 60)}</span>
              <span className="report-rate">
                <span className="report-track"><motion.span initial={{ scaleX: 0 }} animate={{ scaleX: rate ?? 0 }} transition={{ delay: 0.2 + i * 0.04, duration: 0.6 }} /></span>
                <b>{rate === null ? "—" : pct(rate)}</b>
              </span>
              <span className="report-wrong">{wrong ? `易错 ${wrong[0]} · ${wrong[1]} 人` : `${r.stats.submitted}/${total} 已答`}</span>
            </motion.li>
          ))}
        </ol>
      ) : <p className="kimi-quiet-state">本节课还没有发题</p>}
    </section>
  );
}
