#!/usr/bin/env python3
"""给题库每道题标注所属知识点 K1–K14（一次性内容工作，可重复运行，已有结果会跳过）。

用法：DEEPSEEK_API_KEY=... python3 scripts/tag-knowledge.py
输出：src/content/question-k.json  { "<题目id>": {"k": "K5", "c": 0.9} }
      src/features/linked-practice/content/question-k.json  （同上，专项练习）
"""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP = """K1 概述：受弯构件、截面形式、课程导言、材料选用背景
K2 正截面构造要求：梁/板尺寸、保护层、钢筋净距、配筋构造
K3 正截面试验研究与破坏形态：受弯三阶段、少筋/适筋/超筋/界限破坏、配筋率影响
K4 正截面受力分析与基本规定：四个基本假定、等效矩形应力图、α1/β1、ξb、ρmin
K5 单筋矩形截面计算：基本公式、适用条件、截面设计与复核
K6 双筋矩形截面：受压钢筋、x≥2as′、分解计算
K7 T形截面：翼缘计算宽度、两类T形判别与公式
K8 斜截面受剪·破坏形态：剪跨比、斜压/剪压/斜拉破坏
K9 无腹筋梁抗剪性能：斜裂缝、隔离体、影响因素
K10 有腹筋梁受剪性能：箍筋/弯起筋作用、配箍率、桁架模型
K11 斜截面受剪承载力计算：计算公式、截面限制、最小配箍率、计算截面、材料抵抗弯矩图、弯起与截断
K12 受扭构件·弯剪扭
K13 变形（挠度）验算：刚度、ψ、σsk
K14 裂缝宽度验算：wmax、裂缝控制、耐久性"""

def env(name):
    v = os.environ.get(name)
    if not v: sys.exit(f"缺少环境变量 {name}")
    return v

BASE = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
KEY = env("DEEPSEEK_API_KEY")

def ask(batch):
    items = "\n".join(f'{q["id"]}｜{q["text"][:420]}' for q in batch)
    prompt = (f"下面是《钢筋混凝土梁承载力计算原理》第六章的知识点：\n{MAP}\n\n"
              "给每道题选一个最主要考查的知识点（只能从 K1–K14 里选），并给出 0–1 的把握度。"
              "只输出 JSON 对象，形如 {\"题目id\": [\"K5\", 0.9]}，不要任何解释。\n\n题目（id｜内容）：\n" + items)
    body = json.dumps({"model": MODEL, "messages": [{"role": "user", "content": prompt}],
                       "temperature": 0, "response_format": {"type": "json_object"}}).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{BASE}/chat/completions", body, {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
            with urllib.request.urlopen(req, timeout=120) as r:
                content = json.load(r)["choices"][0]["message"]["content"]
            data = json.loads(re.search(r"\{.*\}", content, re.S).group(0))
            out = {}
            for qid, v in data.items():
                k, c = (v[0], v[1]) if isinstance(v, list) else (v, 0.6)
                if re.fullmatch(r"K(1[0-4]|[1-9])", str(k)): out[qid] = {"k": k, "c": round(float(c), 2)}
            return out
        except Exception as e:
            print("重试", attempt, e, file=sys.stderr); time.sleep(3 * (attempt + 1))
    return {}

def run(questions, out_path):
    done = json.load(open(out_path)) if os.path.exists(out_path) else {}
    todo = [q for q in questions if q["id"] not in done]
    batches = [todo[i:i + 20] for i in range(0, len(todo), 20)]
    with ThreadPoolExecutor(4) as pool:
        for res in pool.map(ask, batches):
            done.update(res)
            json.dump(done, open(out_path, "w"), ensure_ascii=False, indent=0, sort_keys=True)
    print(out_path, f"{len(done)}/{len(questions)}")

def text(q, *fields):
    parts = [str(q.get(f) or "") for f in fields]
    opts = q.get("options") or []
    parts += [str(o.get("text", "")) for o in opts if isinstance(o, dict)]
    return re.sub(r"\s+", " ", " ".join(parts))

main = json.load(open(f"{ROOT}/src/content/questions.json")) + json.load(open(f"{ROOT}/src/content/k12-14-questions.json"))
run([{"id": q["id"], "text": text(q, "prompt", "analysis")} for q in main], f"{ROOT}/src/content/question-k.json")
linked = json.load(open(f"{ROOT}/src/features/linked-practice/content/questions.json"))
run([{"id": q["id"], "text": text(q, "knowledge", "prompt")} for q in linked], f"{ROOT}/src/features/linked-practice/content/question-k.json")
