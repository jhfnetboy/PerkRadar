import { explicitDeadline } from "../ai";
import { publishTime } from "../publish-time";
import { cleanTitle, excerpt } from "../text";
import type { ParsedItem } from "../types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Algolia HN search response. Story links stay on the discussion page, not the off-site URL. */
export function parseHnSearch(payload: unknown, now = Date.now()): ParsedItem[] {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.hits)) throw new Error("HN 响应不是 JSON 或缺少 hits");
  const items: ParsedItem[] = [];
  for (const hit of root.hits) {
    const record = asRecord(hit);
    if (!record) continue;
    const objectId = typeof record.objectID === "string" ? record.objectID.trim() : "";
    if (!/^\d+$/.test(objectId)) continue;
    const title = cleanTitle(typeof record.title === "string" ? record.title : "");
    if (!title) continue;
    const story = typeof record.story_text === "string" ? record.story_text : "";
    const created = typeof record.created_at === "string" ? record.created_at : "";
    const blob = `${title}\n${story}`;
    items.push({
      url: `https://news.ycombinator.com/item?id=${objectId}`,
      title,
      summary: excerpt(story),
      publishedAt: created ? publishTime(created, now) : null,
      expiresAt: explicitDeadline(blob, now),
    });
  }
  return items;
}
