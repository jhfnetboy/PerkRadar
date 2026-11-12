import { classifyAi } from "./ai";
import { listDeals, type DealRow } from "./db";
import { isStale } from "./retention";
import { sourceAssumesAi, sourceName } from "./source-defs";
import { toPlain } from "./text";
import { formatBeijing } from "./time";
import { AI_CATEGORIES, type AiCategory } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_SINCE_MS = 7 * DAY_MS;

export type DigestEntry = {
  title: string;
  sourceId: string;
  sourceName: string;
  url: string;
  summary: string;
  expiresAt: string | null;
  expiresLabel: string | null;
  resetCadence: string | null;
  relevance: number;
  firstSeenAt: string;
};

export type DigestGroup = {
  category: AiCategory;
  items: DigestEntry[];
};

export type DigestDocument = {
  note: string;
  generatedAt: string;
  since: string;
  sinceMs: number;
  windowStart: string;
  windowStartBeijing: string;
  count: number;
  groups: DigestGroup[];
};

const NOTE = "公开来源的标题线索，未核实能否领取。到期和重置只在原文写明时出现，没有的不补。";

/** `24h` / `7d` / `Nh` / `Nd`. Null when missing is not the case — pass null to mean default. */
export function parseSince(value: string | null): { since: string; ms: number } | null {
  if (value == null || value.trim() === "") return { since: "24h", ms: 24 * HOUR_MS };
  const match = /^(\d+)(h|d)$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  if (!Number.isInteger(amount) || amount < 1) return null;
  const ms = unit === "d" ? amount * DAY_MS : amount * HOUR_MS;
  if (ms > MAX_SINCE_MS) return null;
  return { since: `${amount}${unit}`, ms };
}

export function parseDigestFormat(value: string | null): "markdown" | "json" | null {
  if (value == null || value.trim() === "") return "markdown";
  if (value === "markdown" || value === "json") return value;
  return null;
}

function entryFrom(row: DealRow): { category: AiCategory; relevance: number; entry: DigestEntry } | null {
  const title = toPlain(row.title);
  const summary = toPlain(row.summary);
  const ai = classifyAi(`${title}\n${summary}`, { assumeTopic: sourceAssumesAi(row.sourceId) });
  if (!ai.relevant || !ai.category) return null;
  const relevance = ai.score + (row.expiresAt != null ? 2 : 0);
  return {
    category: ai.category,
    relevance,
    entry: {
      title,
      sourceId: row.sourceId,
      sourceName: sourceName(row.sourceId),
      url: row.url,
      summary,
      expiresAt: row.expiresAt == null ? null : new Date(row.expiresAt).toISOString(),
      expiresLabel: row.expiresAt == null ? null : formatBeijing(row.expiresAt),
      resetCadence: ai.resetCadence,
      relevance,
      firstSeenAt: new Date(row.firstSeenAt).toISOString(),
    },
  };
}

export function buildDigest(rows: DealRow[], now: number, since: { since: string; ms: number }): DigestDocument {
  const windowStart = now - since.ms;
  const grouped = new Map<AiCategory, { relevance: number; firstSeenAt: number; entry: DigestEntry }[]>();
  for (const row of rows) {
    if (isStale({ publishedAt: row.publishedAt, firstSeenAt: row.firstSeenAt, expiresAt: row.expiresAt }, now)) continue;
    if (row.firstSeenAt < windowStart || row.firstSeenAt > now) continue;
    const picked = entryFrom(row);
    if (!picked) continue;
    const list = grouped.get(picked.category) ?? [];
    list.push({ relevance: picked.relevance, firstSeenAt: row.firstSeenAt, entry: picked.entry });
    grouped.set(picked.category, list);
  }
  const groups: DigestGroup[] = [];
  for (const category of AI_CATEGORIES) {
    const list = grouped.get(category);
    if (!list?.length) continue;
    list.sort((a, b) => b.relevance - a.relevance || b.firstSeenAt - a.firstSeenAt || a.entry.title.localeCompare(b.entry.title));
    groups.push({ category, items: list.map((item) => item.entry) });
  }
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  return {
    note: NOTE,
    generatedAt: new Date(now).toISOString(),
    since: since.since,
    sinceMs: since.ms,
    windowStart: new Date(windowStart).toISOString(),
    windowStartBeijing: formatBeijing(windowStart),
    count,
    groups,
  };
}

function markdownHref(url: string): string {
  return url.replace(/[()]/g, (char) => (char === "(" ? "%28" : "%29"));
}

export function digestMarkdown(doc: DigestDocument): string {
  const lines = [
    "# PerkRadar AI 日报",
    "",
    `最近 ${doc.since} 新收录 ${doc.count} 条（自北京时间 ${doc.windowStartBeijing} 起）。`,
    doc.note,
    "",
  ];
  if (!doc.count) {
    lines.push("这个时间窗内没有新收录的 AI 优惠线索。");
    lines.push("");
    return lines.join("\n");
  }
  for (const group of doc.groups) {
    lines.push(`## ${group.category}`);
    lines.push("");
    for (const item of group.items) {
      lines.push(`- **${item.title.replace(/\*/g, "")}** · ${item.sourceName} · [原文](${markdownHref(item.url)})`);
      if (item.summary) lines.push(`  - ${item.summary}`);
      if (item.expiresLabel) lines.push(`  - 到期：${item.expiresLabel}`);
      if (item.resetCadence) lines.push(`  - 重置：${item.resetCadence}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function readDigest(now: number, since: { since: string; ms: number }): DigestDocument {
  return buildDigest(listDeals(), now, since);
}
