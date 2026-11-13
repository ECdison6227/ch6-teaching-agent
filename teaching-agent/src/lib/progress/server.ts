import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";

/** 学习码：8 位，去掉易混的 0/O/1/I/L，展示为 XXXX-XXXX */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TTL = 90 * 86_400_000;
export const MAX_BLOB = 256 * 1024;

export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return code.length === 8 && [...code].every(ch => ALPHABET.includes(ch)) ? code : null;
}
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

let db: DatabaseSync | undefined;
function open() {
  if (db) return db;
  // 和课堂数据放在同一个跨发布保留的目录里
  const base = process.env.CLASSROOM_DB_PATH ? dirname(process.env.CLASSROOM_DB_PATH) : resolve(".data/classroom");
  const path = process.env.PROGRESS_DB_PATH || resolve(base, "progress.sqlite");
  mkdirSync(dirname(path), { recursive: true, mode: 0o750 });
  db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS progress (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  return db;
}

function sweep(now: number) {
  open().prepare("DELETE FROM progress WHERE updated_at < ?").run(now - TTL);
}

export function readProgress(code: string): string | null {
  const row = open().prepare("SELECT data, updated_at FROM progress WHERE code = ?").get(code) as { data: string; updated_at: number } | undefined;
  if (!row || row.updated_at < Date.now() - TTL) return null;
  open().prepare("UPDATE progress SET updated_at = ? WHERE code = ?").run(Date.now(), code);
  return row.data;
}

/** 写入进度；没有学习码时新建一个 */
export function writeProgress(data: string, code?: string | null): string {
  const now = Date.now();
  if (Math.random() < 0.05) sweep(now);
  const d = open();
  let target = code ?? null;
  if (!target) {
    for (let i = 0; i < 6 && !target; i++) {
      const candidate = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
      if (!d.prepare("SELECT 1 FROM progress WHERE code = ?").get(candidate)) target = candidate;
    }
    if (!target) throw new Error("生成学习码失败，请重试");
  }
  d.prepare("INSERT INTO progress (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(target, data, now);
  return target;
}

/** 极简限流：每个 IP 每分钟 20 次 */
const hits = new Map<string, number[]>();
export function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter(t => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 20;
}
