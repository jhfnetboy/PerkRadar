import { explicitDeadline } from "../ai";
import { MAX_FEED_ITEMS } from "../config";
import { cleanTitle, excerpt } from "../text";
import type { ParsedItem } from "../types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Pinned `programs.json`: startup and student/research credit programs.
 * `generated` is the file's build time, not an offer date, so it is ignored.
 * Items have no per-row publish time. Expiry is set only from an explicit date.
 */
export function parseAiPrograms(payload: unknown, now = Date.now()): ParsedItem[] {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.startups) || !Array.isArray(root.research)) {
    throw new Error("未能解析启动信贷清单");
  }
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  const groups: { label: string; rows: unknown[] }[] = [
    { label: "startup", rows: root.startups },
    { label: "research", rows: root.research },
  ];
  for (const group of groups) {
    for (const row of group.rows) {
      const record = asRecord(row);
      if (!record) continue;
      const url = text(record.url);
      const title = cleanTitle(text(record.name));
      if (!title || !url.startsWith("https://") || seen.has(url)) continue;
      seen.add(url);
      const audience = text(record.audience);
      const what = text(record.what);
      const summary = excerpt([group.label, audience, what].filter(Boolean).join(". "));
      items.push({
        url,
        title,
        summary,
        publishedAt: null,
        expiresAt: explicitDeadline(`${title}\n${summary}`, now),
      });
      if (items.length >= MAX_FEED_ITEMS) return items;
    }
  }
  return items;
}
