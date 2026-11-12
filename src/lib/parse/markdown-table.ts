import { explicitDeadline } from "../ai";
import { MAX_FEED_ITEMS } from "../config";
import { cleanTitle, excerpt, toPlain } from "../text";
import type { ParsedItem } from "../types";

const LINK = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/;

function sectionKept(heading: string): boolean {
  if (/self-hosted|local\s*\/|本地|自建/i.test(heading)) return false;
  return /permanent free|free tier|renewable|trial credit|one-time|免费额度|试用|额度/i.test(heading);
}

/**
 * Pinned GitHub README tables. Only https links written as markdown in an
 * offer section are kept. Code fences and the local-tool section are skipped.
 * A missing calendar deadline stays null; "30 days" is not a timestamp.
 */
export function parseMarkdownOfferTable(markdown: string, now = Date.now()): ParsedItem[] {
  const head = markdown.slice(0, 400).toLowerCase();
  if (head.includes("<!doctype html") || /<html[\s>]/.test(head) || head.trim().startsWith("{")) {
    throw new Error("未能解析 Markdown 清单");
  }
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  let section = "";
  let fence = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      section = toPlain(heading[2] ?? "");
      continue;
    }
    if (!sectionKept(section) || !line.startsWith("|")) continue;
    if (/^\|?\s*:?-{3,}/.test(line.replace(/\|/g, " | "))) continue;
    const link = LINK.exec(line);
    if (!link) continue;
    const title = cleanTitle(link[1] ?? "");
    const url = (link[2] ?? "").trim();
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const cells = line.split("|").map((cell) => toPlain(cell)).filter((cell) => cell && !cell.includes(url));
    const summary = excerpt(`${section}. ${cells.join(" · ")}`);
    items.push({
      url,
      title,
      summary,
      publishedAt: null,
      expiresAt: explicitDeadline(`${title}\n${summary}`, now),
    });
    if (items.length >= MAX_FEED_ITEMS) break;
  }
  return items;
}
