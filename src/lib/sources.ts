import { classifyAi } from "./ai";
import { fetchText, type FetchLike } from "./http";
import { resilientSource } from "./source-resilience";
import { logEvent } from "./log";
import { parseEpicFreeGames } from "./parse/epic";
import { parseFeed } from "./parse/feed";
import { parseHnSearch } from "./parse/hn";
import { parseLinuxDoMarkdown } from "./parse/linuxdo";
import { parseMarkdownOfferTable } from "./parse/markdown-table";
import { parseAiPrograms } from "./parse/programs";
import { SOURCE_DEFS, sourceFormat, type SourceDef } from "./source-defs";
import type { ParsedItem } from "./types";
import { readFileSync } from "fs";

let keyFileFailed = false;
export function jinaMissingKey(): boolean { return keyFileFailed || (!process.env.JINA_API_KEY?.trim() && !process.env.JINA_API_KEY_FILE?.trim()); }
function readJinaApiKey(): string {
  keyFileFailed = false;
  const fromEnv = process.env.JINA_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = process.env.JINA_API_KEY_FILE?.trim();
  if (!file) return "";
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    keyFileFailed = true;
    logEvent("jina_key_file_unreadable", { warning: "无法读取密钥文件，匿名请求可能受限" });
    return "";
  }
}

function linkKept(item: ParsedItem, source: SourceDef): boolean {
  try {
    const url = new URL(item.url);
    if (url.username || url.password) return false;
    if (source.linkScope === "pinned-outbound") return url.protocol === "https:";
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return source.allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/** Feeds are untrusted: an item link pointing off-site is dropped, not published as a "claim" link. */
function onSourceDomain(items: ParsedItem[], source: SourceDef): ParsedItem[] {
  const kept = items.filter((item) => linkKept(item, source));
  const dropped = items.length - kept.length;
  if (dropped > 0) logEvent("offsite_link_dropped", { sourceId: source.id, dropped });
  return kept;
}

function keepAiDeals(items: ParsedItem[], source: SourceDef): ParsedItem[] {
  if (source.ingest !== "ai-deals") return items;
  const kept = items.filter((item) => classifyAi(`${item.title}\n${item.summary}`, { assumeTopic: source.assumeAi }).relevant);
  const dropped = items.length - kept.length;
  if (dropped > 0) logEvent("ai_filter_dropped", { sourceId: source.id, dropped });
  return kept;
}

function parseBody(source: SourceDef, body: string, now: number): ParsedItem[] {
  const format = sourceFormat(source);
  if (format === "linuxdo") return parseLinuxDoMarkdown(body, now);
  if (format === "epic") {
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("Epic 响应不是 JSON");
    }
    return parseEpicFreeGames(payload, now);
  }
  if (format === "hn") {
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("HN 响应不是 JSON 或缺少 hits");
    }
    return parseHnSearch(payload, now);
  }
  if (format === "markdown-table") return parseMarkdownOfferTable(body, now);
  if (format === "json-programs") {
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("未能解析启动信贷清单");
    }
    return parseAiPrograms(payload, now);
  }
  return parseFeed(body, now);
}

async function fetchHn(source: SourceDef, ctx: { fetchImpl: FetchLike; signal: AbortSignal; now: number }): Promise<ParsedItem[]> {
  const queries = source.hnQueries ?? [];
  if (!queries.length) throw new Error("HN 响应不是 JSON 或缺少 hits");
  const batches = await Promise.all(queries.map(async (query) => {
    const fetched = await fetchText(`${source.url}&query=${encodeURIComponent(query)}`, ctx);
    return parseBody(source, fetched.body, ctx.now);
  }));
  const seen = new Set<string>();
  const items: ParsedItem[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
  }
  return items;
}

export async function loadSource(
  source: SourceDef,
  ctx: { fetchImpl: FetchLike; signal: AbortSignal; now: number },
): Promise<{ items: ParsedItem[]; finalUrl: string }> {
  if (process.env.PERKRADAR_OFFLINE === "1") throw new Error("离线模式：未访问来源");
  const headers: Record<string, string> = { accept: "text/markdown" };
  const key = source.id === "linuxdo" ? readJinaApiKey() : "";
  if (key) headers.Authorization = `Bearer ${key}`;
  const loaded = await resilientSource(source.id, async () => {
    if (sourceFormat(source) === "hn") {
      const items = await fetchHn(source, ctx);
      return { items, finalUrl: source.url };
    }
    const fetched = source.id === "linuxdo"
      ? await fetchText(source.url, ctx, { headers })
      : await fetchText(source.url, ctx);
    return { items: parseBody(source, fetched.body, ctx.now), finalUrl: fetched.finalUrl };
  }, ctx.signal);
  return { items: keepAiDeals(onSourceDomain(loaded.items, source), source), finalUrl: loaded.finalUrl };
}

export function listSources(): SourceDef[] {
  return SOURCE_DEFS;
}
