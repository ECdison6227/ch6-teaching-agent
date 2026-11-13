"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const THINKING_STEP_LABELS = [
  "理解问题",
  "检索相关知识",
  "分析概念与受力",
  "组织讲解思路",
  "检查回答内容",
] as const;

export const THINKING_SHAPES = ["magnifier", "cube", "bricks", "robot", "gift"] as const;

export type ThinkingIndicatorProps = {
  active: boolean;
  /** 受控步骤 0–4；省略时按时间轴自动推进 */
  step?: number;
  className?: string;
};

type Vec3 = [number, number, number];
type Face = { vertices: Vec3[]; normal: Vec3; material: number; group: number };
type RasterFace = { verts: Vec3[]; shade: number };

const LOGICAL_W = 560;
const LOGICAL_H = 530;
const CELL = 3;
const GRID_W = 180;
const GRID_H = 177;
const SHAPE_TIMES = [0, 2.53, 6.52, 10.0, 15.78] as const;
const LOOP_DURATION = 19.99;
const MORPH_DURATION = 0.9;
const ASSEMBLY_DURATION = 1.1;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function clamp(x: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, x));
}

function ease(t: number) {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function normalize(p: Vec3): Vec3 {
  const n = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / n, p[1] / n, p[2] / n];
}

function turn(p: Vec3, angle: number, axis: number): Vec3 {
  const a = (axis + 1) % 3;
  const b = (axis + 2) % 3;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const q: Vec3 = [p[0], p[1], p[2]];
  q[a] = p[a] * c - p[b] * s;
  q[b] = p[a] * s + p[b] * c;
  return q;
}

function rasterThinkingFaces(
  faces: RasterFace[],
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  depth: Float32Array,
) {
  pixels.fill(0);
  depth.fill(-Infinity);
  const edge = (a: Vec3, b: Vec3, x: number, y: number) =>
    (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
  for (const face of faces) {
    for (let i = 1; i < face.verts.length - 1; i++) {
      const a = face.verts[0];
      const b = face.verts[i];
      const c = face.verts[i + 1];
      const area = edge(a, b, c[0], c[1]);
      if (Math.abs(area) < 1e-8) continue;
      const left = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const right = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const top = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const bottom = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const u = edge(b, c, x + 0.5, y + 0.5) / area;
          const v = edge(c, a, x + 0.5, y + 0.5) / area;
          const w = 1 - u - v;
          if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
          const z = u * a[2] + v * b[2] + w * c[2];
          const index = y * width + x;
          if (z < depth[index]) continue;
          depth[index] = z;
          const offset = index * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = face.shade;
          pixels[offset + 3] = 255;
        }
      }
    }
  }
  return pixels;
}

function createThinkingRenderer(canvas: HTMLCanvasElement) {
  const maybeCtx = canvas.getContext("2d", { alpha: true });
  if (!maybeCtx) throw new Error("2d context unavailable");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const pixels = new Uint8ClampedArray(GRID_W * GRID_H * 4);
  const depthBuffer = new Float32Array(GRID_W * GRID_H);
  let faces: Face[] = [];
  let part = 0;
  let previousIndex = -1;
  let lastPixels: Array<[number, number]> = [];
  let originPixels: Array<[number, number]> = [];
  const staticMeshes = new Map<number, Face[]>();

  function face(vertices: Vec3[], normal: Vec3, material = 0, group = part) {
    faces.push({ vertices, normal, material, group });
  }

  function box(center: Vec3, size: Vec3, bevel = 0.018, material = 0, angle = 0, group = part) {
    const half = size.map((x) => x / 2) as Vec3;
    const inset = half.map((x) => Math.max(0.001, x - bevel)) as Vec3;
    const put = (v: Vec3[], n: Vec3) =>
      face(
        v.map((p) => turn(p, angle, 2).map((x, i) => x + center[i]) as Vec3),
        turn(n, angle, 2),
        material,
        group,
      );
    for (let axis = 0; axis < 3; axis++) {
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      for (const sign of [-1, 1] as const) {
        const n: Vec3 = [0, 0, 0];
        n[axis] = sign;
        put(
          (
            [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ] as const
          ).map(([u, v]) => {
            const p: Vec3 = [0, 0, 0];
            p[axis] = sign * half[axis];
            p[a] = u * inset[a];
            p[b] = v * inset[b];
            return p;
          }),
          n,
        );
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      for (const sa of [-1, 1] as const) {
        for (const sb of [-1, 1] as const) {
          const p: Vec3 = [0, 0, 0];
          const q: Vec3 = [0, 0, 0];
          const n: Vec3 = [0, 0, 0];
          p[a] = sa * half[a];
          p[b] = sb * inset[b];
          q[a] = sa * inset[a];
          q[b] = sb * half[b];
          n[a] = sa;
          n[b] = sb;
          put(
            [
              p.map((v, i) => (i === axis ? -inset[axis] : v)) as Vec3,
              q.map((v, i) => (i === axis ? -inset[axis] : v)) as Vec3,
              q.map((v, i) => (i === axis ? inset[axis] : v)) as Vec3,
              p.map((v, i) => (i === axis ? inset[axis] : v)) as Vec3,
            ],
            normalize(n),
          );
        }
      }
    }
    for (const x of [-1, 1] as const) {
      for (const y of [-1, 1] as const) {
        for (const z of [-1, 1] as const) {
          put(
            [
              [x * half[0], y * inset[1], z * inset[2]],
              [x * inset[0], y * half[1], z * inset[2]],
              [x * inset[0], y * inset[1], z * half[2]],
            ],
            normalize([x, y, z]),
          );
        }
      }
    }
  }

  function rod(a: Vec3, b: Vec3, width: number, depth: number, material = 0) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    box(
      a.map((x, i) => (x + b[i]) / 2) as Vec3,
      [width, Math.hypot(dx, dy), depth],
      0.018,
      material,
      Math.atan2(-dx, dy),
    );
  }

  function cylinder(center: Vec3, radius: number, height: number, axis = 1, material = 0) {
    const convert = (p: Vec3): Vec3 => {
      if (axis === 2) return [p[0], p[2], p[1]];
      return p;
    };
    const rings: number[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const b = ((i + 1) / 40) * Math.PI * 2;
      const v: Vec3[] = [
        [Math.cos(a) * radius, -height / 2, Math.sin(a) * radius],
        [Math.cos(b) * radius, -height / 2, Math.sin(b) * radius],
        [Math.cos(b) * radius, height / 2, Math.sin(b) * radius],
        [Math.cos(a) * radius, height / 2, Math.sin(a) * radius],
      ];
      face(
        v.map((p) => convert(p).map((x, j) => x + center[j]) as Vec3),
        convert([Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)]),
        material,
      );
      rings.push(a);
    }
    for (const sign of [-1, 1] as const) {
      face(
        rings.map((a) => convert([Math.cos(a) * radius, sign * (height / 2), Math.sin(a) * radius]).map((x, i) => x + center[i]) as Vec3),
        convert([0, sign, 0]),
        material,
      );
    }
  }

  function ring(center: Vec3, outer: number, inner: number, depth: number, stretch = 1, angle = 0, material = 30) {
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      const p = (r: number, t: number, z: number) =>
        turn([r * Math.cos(t) * stretch, r * Math.sin(t), z], angle, 2).map((x, k) => x + center[k]) as Vec3;
      for (const sign of [-1, 1] as const) {
        face(
          [p(outer, a, sign * depth / 2), p(outer, b, sign * depth / 2), p(inner, b, sign * depth / 2), p(inner, a, sign * depth / 2)],
          [0, 0, sign],
          material,
        );
      }
      for (const r of [outer, inner]) {
        face(
          [p(r, a, -depth / 2), p(r, b, -depth / 2), p(r, b, depth / 2), p(r, a, depth / 2)],
          turn(
            [Math.cos((a + b) / 2) * (r === inner ? -1 : 1), Math.sin((a + b) / 2) * (r === inner ? -1 : 1), 0],
            angle,
            2,
          ),
          material - 20,
        );
      }
    }
  }

  function roundedRing(center: Vec3) {
    const position = (u: number, v: number): Vec3 => [
      center[0] + (0.73 + 0.12 * Math.cos(v)) * Math.cos(u),
      center[1] + (0.73 + 0.12 * Math.cos(v)) * Math.sin(u),
      center[2] + 0.084 * Math.sin(v),
    ];
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 12; j++) {
        const u = (i / 64) * Math.PI * 2;
        const w = ((i + 1) / 64) * Math.PI * 2;
        const v = (j / 12) * Math.PI * 2;
        const q = ((j + 1) / 12) * Math.PI * 2;
        const normal = normalize([
          Math.cos((u + w) / 2) * Math.cos((v + q) / 2),
          Math.sin((u + w) / 2) * Math.cos((v + q) / 2),
          Math.sin((v + q) / 2) / 0.7,
        ]);
        face([position(u, v), position(w, v), position(w, q), position(u, q)], normal, 85);
      }
    }
  }

  function build(kind: number, time: number) {
    if (staticMeshes.has(kind)) return staticMeshes.get(kind)!;
    faces = [];
    part = 0;
    if (kind === 0) {
      roundedRing([-0.35, 0.2, 0]);
      part++;
      rod([0.19, -0.36, 0], [0.99, -1.13, 0], 0.27, 0.19, 90);
    } else if (kind === 1) {
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            const first = faces.length;
            part++;
            box([x * 0.62, y * 0.62, z * 0.62], [0.576, 0.576, 0.576], 0.025, 0);
            const starts = y === 1 ? 1.1 : y === 0 ? 1.8 : 2.6;
            const angle = ease((time - SHAPE_TIMES[1] - starts) / 0.62) * (Math.PI / 2) * (y === 0 ? -1 : 1);
            for (let i = first; i < faces.length; i++) {
              faces[i].vertices = faces[i].vertices.map((v) => turn(v, angle, 1));
              faces[i].normal = turn(faces[i].normal, angle, 1);
            }
          }
        }
      }
    } else if (kind === 2) {
      part++;
      box([-0.12, -0.48, 0.16], [0.95, 0.61, 1.36], 0.024);
      part++;
      box([0.15, 0.4, -0.42], [0.95, 0.61, 1.36], 0.024);
      for (const z of [-0.75, -0.07]) {
        part++;
        cylinder([0.15, 0.84, z], 0.25, 0.29, 1, 10);
      }
      part++;
      cylinder([-0.12, -0.04, 0.54], 0.25, 0.27, 1, 10);
    } else if (kind === 3) {
      const local = time - SHAPE_TIMES[3];
      const k: Array<[number, number]> = [
        [0, 1.02],
        [2.1, 1.02],
        [4.0, 0.12],
        [5.55, 1.03],
      ];
      let theta = k[k.length - 1][1];
      for (let i = 1; i < k.length; i++) {
        if (local <= k[i][0]) {
          theta = k[i - 1][1] + (k[i][1] - k[i - 1][1]) * ease((local - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
          break;
        }
      }
      const a: Vec3 = [0.19, -0.82, 0];
      const b: Vec3 = [-0.47, -0.23, 0];
      const c: Vec3 = [b[0] + 1.25 * Math.cos(theta), b[1] + 1.25 * Math.sin(theta), 0];
      part++;
      box([0.08, -1.02, 0], [1.18, 0.15, 0.73], 0.022, 5);
      part++;
      rod([0.18, -0.96, 0], a, 0.32, 0.32);
      part++;
      rod(a, b, 0.21, 0.31);
      for (const z of [-0.15, 0.15]) {
        part++;
        rod([b[0], b[1], z], [c[0], c[1], z], 0.23, 0.075, 96);
      }
      for (const joint of [a, b, c]) {
        part++;
        cylinder(joint, 0.115, 0.39, 2, 20);
      }
      part++;
      box([c[0], c[1], 0], [0.32, 0.4, 0.38], 0.018, 80, theta - 0.4);
      const tip: Vec3 = [c[0] + 0.3, c[1] + 0.1, 0];
      part++;
      rod(c, tip, 0.11, 0.23, 10);
      part++;
      rod([tip[0] - 0.06, tip[1], -0.16], [tip[0] + 0.36, tip[1] - 0.06, -0.2], 0.07, 0.07);
      part++;
      rod([tip[0] - 0.06, tip[1], 0.16], [tip[0] + 0.36, tip[1] - 0.06, 0.2], 0.07, 0.07);
    } else {
      part++;
      box([0, -0.14, 0], [1.82, 1.65, 1.43], 0.025);
      part++;
      box([0, 0.76, 0], [1.99, 0.22, 1.59], 0.022);
      part++;
      box([0, -0.13, 0.728], [0.17, 1.7, 0.02], 0.002, 165);
      part++;
      box([-0.923, -0.13, 0], [0.02, 1.7, 0.17], 0.002, 155);
      part++;
      box([0, 0.36, 0.732], [1.82, 0.2, 0.025], 0.002, 165);
      part++;
      box([-0.925, 0.36, 0], [0.025, 0.2, 1.43], 0.002, 150);
      part++;
      box([0, 0.882, 0], [0.17, 0.02, 1.62], 0.001, 140);
      part++;
      box([0, 0.882, 0], [2.02, 0.02, 0.17], 0.001, 140);
      part++;
      ring([-0.29, 1.17, 0.28], 0.235, 0.158, 0.075, 1.5, -0.23, 0);
      part++;
      ring([0.29, 1.17, 0.28], 0.235, 0.158, 0.075, 1.5, 0.23, 0);
      part++;
      box([0, 0.98, 0.28], [0.18, 0.2, 0.12], 0.012, 30);
    }
    if (kind === 0 || kind === 2 || kind === 4) staticMeshes.set(kind, faces);
    return faces;
  }

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, canvas.clientWidth || LOGICAL_W);
    const cssH = Math.max(1, canvas.clientHeight || LOGICAL_H);
    const nextW = Math.round(cssW * dpr);
    const nextH = Math.round(cssH * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    ctx.setTransform((nextW / LOGICAL_W), 0, 0, (nextH / LOGICAL_H), 0, 0);
    return { cssW, cssH };
  }

  function render(time: number, rotation = 0, reduced = false, color = "#2a2a2e") {
    syncCanvasSize();
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    let index = 0;
    for (let i = 0; i < SHAPE_TIMES.length; i++) if (time >= SHAPE_TIMES[i]) index = i;
    const phase = time - SHAPE_TIMES[index];
    const forming = reduced ? 1 : ease(phase / (index ? ASSEMBLY_DURATION : 0.65));
    const yaw =
      (index === 0 ? 0.08 : index === 1 ? 0.6 : index === 2 ? 0.62 : 0.4) +
      rotation +
      Math.sin(time * 0.65) * 0.035;
    const pitch = index === 0 ? 0.08 : index === 2 ? 0.34 : 0.36;
    const scales = [108, 120, 111, 121, 111];
    const scale = scales[index];
    const camera = (p: Vec3) => turn(turn(p, yaw, 1), pitch, 0);
    const cx = [296, 310, 316, 291, 315][index];
    const cy = [275, 267, 253, 261, 251][index];
    const list: RasterFace[] = [];
    for (const f of build(index, time)) {
      const normal = camera(f.normal);
      if (normal[2] < 0.001) continue;
      const burst = index === 0 ? 0 : 1 - forming;
      const group = f.group;
      const offset: Vec3 = [
        (hash(group + 1) - 0.5) * 0.6 * burst,
        (hash(group + 53) - 0.5) * 0.6 * burst,
        (hash(group + 63) - 0.5) * 0.6 * burst,
      ];
      const g = group - 1;
      const cubeCenter: Vec3 = [
        (Math.floor(g / 9) - 1) * 0.62,
        (Math.floor((g % 9) / 3) - 1) * 0.62,
        (g % 3 - 1) * 0.62,
      ];
      const verts = f.vertices.map((p) =>
        camera(
          p.map((v, i) =>
            index === 1
              ? cubeCenter[i] + (v - cubeCenter[i]) * (0.6 + 0.4 * forming) + offset[i]
              : v + offset[i],
          ) as Vec3,
        ),
      );
      const shade = clamp(60 + 132 * f.normal[1] - 18 * f.normal[0] - 22 * f.normal[2] + f.material, 28, 225);
      list.push({
        verts: verts.map((p) => [(cx + p[0] * scale) / CELL, (cy - p[1] * scale) / CELL, p[2]]),
        shade,
      });
    }
    rasterThinkingFaces(list, GRID_W, GRID_H, pixels, depthBuffer);
    ctx.fillStyle = color;
    const targets: Array<[number, number]> = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = (y * GRID_W + x) * 4;
        if (pixels[i + 3] < 128 || pixels[i] > ((BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) * 255) continue;
        const px = index === 0 ? x * CELL + (hash(i + 31) * 500 - x * CELL) * (1 - forming) : x * CELL;
        const py = index === 0 ? y * CELL + (hash(i + 71) * 490 - y * CELL) * (1 - forming) : y * CELL;
        targets.push([px, py]);
      }
    }
    if (index !== previousIndex) {
      originPixels = lastPixels;
      previousIndex = index;
    }
    const blend = index === 0 || !originPixels.length ? 1 : reduced ? 1 : ease(phase / MORPH_DURATION);
    if (blend < 1) {
      const count = Math.max(originPixels.length, targets.length);
      for (let i = 0; i < count; i++) {
        const a = originPixels[Math.floor((i * originPixels.length) / count)];
        const b = targets[Math.floor((i * targets.length) / count)];
        if (!a || !b) continue;
        const delay = hash(i + 209) * 0.12;
        const progress = ease((phase - delay) / (MORPH_DURATION - delay));
        const arc = Math.sin(progress * Math.PI) * (16 + hash(i + 419) * 26);
        const angle = hash(i + 619) * Math.PI * 2;
        ctx.fillRect(
          a[0] + (b[0] - a[0]) * progress + Math.cos(angle) * arc,
          a[1] + (b[1] - a[1]) * progress + Math.sin(angle) * arc,
          CELL,
          CELL,
        );
      }
    } else {
      for (const p of targets) ctx.fillRect(p[0], p[1], CELL, CELL);
    }
    lastPixels = targets;
    for (let i = 0; i < 235; i++) {
      const x = 15 + hash(i + 101) * 535 + Math.sin(time * 0.13 + i) * 5;
      const y = 0 + hash(i + 819) * 493 + Math.cos(time * 0.17 + i) * 4;
      ctx.fillRect(Math.floor(x / CELL) * CELL, Math.floor(y / CELL) * CELL, CELL, CELL);
    }
    for (let y = -24; y <= 24; y += 6) {
      for (let x = -150; x <= 150; x += 6) {
        const density = Math.exp((-x * x) / 10000 - (y * y) / 170) * 0.95;
        if (hash(x * 9 + y * 19 + 6901) > density) continue;
        ctx.fillRect(315 + x, 430 + y, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
    return THINKING_SHAPES[index];
  }

  return { render };
}

function stepIndexAt(time: number) {
  let index = 0;
  for (let i = 0; i < SHAPE_TIMES.length; i++) if (time >= SHAPE_TIMES[i]) index = i;
  return index;
}

function clampStep(step: number | undefined) {
  if (step == null || !Number.isFinite(step)) return null;
  return Math.max(0, Math.min(THINKING_STEP_LABELS.length - 1, Math.round(step)));
}

/** 粒子形变「思考中」指示器：canvas 实现，配色跟随 currentColor。 */
export function ThinkingIndicator({ active, step, className }: ThinkingIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [autoStep, setAutoStep] = useState(0);
  const controlled = clampStep(step);
  const currentStep = controlled ?? autoStep;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let renderer: ReturnType<typeof createThinkingRenderer> | null = null;
    try {
      renderer = createThinkingRenderer(canvas);
    } catch {
      return;
    }

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reducedMq.matches;
    let raf = 0;
    let lastTs = 0;
    let time = controlled != null ? SHAPE_TIMES[controlled] : 0.02;
    let visible = true;
    let lastReported = -1;

    const colorOf = () => getComputedStyle(host).color || "#2a2a2e";

    const paint = (t: number, withMorph: boolean) => {
      const shape = renderer!.render(t, 0, !withMorph || reduced, colorOf());
      canvas.dataset.shape = shape;
      const index = stepIndexAt(t);
      if (index !== lastReported) {
        lastReported = index;
        if (controlled == null) setAutoStep(index);
      }
    };

    const onReduced = () => {
      reduced = reducedMq.matches;
      if (reduced) {
        cancelAnimationFrame(raf);
        raf = 0;
        paint(controlled != null ? SHAPE_TIMES[controlled] : 0, false);
      } else if (active) {
        lastTs = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) lastTs = 0;
    });
    observer.observe(canvas);

    const resizeObserver = new ResizeObserver(() => {
      paint(time, active && !reduced);
    });
    resizeObserver.observe(host);

    function tick(ts: number) {
      const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
      lastTs = ts;
      if (active && visible && !document.hidden && !reduced) {
        if (controlled != null) {
          const start = SHAPE_TIMES[controlled];
          const end =
            controlled + 1 < SHAPE_TIMES.length ? SHAPE_TIMES[controlled + 1] - 0.01 : LOOP_DURATION;
          time += dt;
          if (time < start || time > end) time = start;
        } else {
          time += dt;
          if (time >= LOOP_DURATION) time = 0;
        }
        paint(time, true);
      }
      raf = requestAnimationFrame(tick);
    }

    reducedMq.addEventListener("change", onReduced);

    if (!active || reduced) {
      paint(controlled != null ? SHAPE_TIMES[controlled] : 0, false);
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      reducedMq.removeEventListener("change", onReduced);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [active, controlled]);

  return (
    <div
      ref={hostRef}
      className={cn("relative size-full text-current", className)}
      role="status"
      aria-live="polite"
      aria-label={THINKING_STEP_LABELS[currentStep]}
      data-step={currentStep}
      data-shape={THINKING_SHAPES[currentStep]}
      data-active={active ? "true" : "false"}
    >
      <canvas ref={canvasRef} className="block size-full" aria-hidden />
    </div>
  );
}
