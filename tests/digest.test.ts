import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { GET } from "../src/app/api/digest/route";
import { insertDeal, listDeals, openDatabase, useDatabase } from "../src/lib/db";
import { buildDigest, digestMarkdown, parseDigestFormat, parseSince } from "../src/lib/digest";
import { useMemoryDb } from "./helpers";

const NOW = Date.parse("2026-11-12T08:00:00.000Z");

function seed(firstSeenAt: number, title: string, sourceId: string, extra: { summary?: string; expiresAt?: number | null } = {}) {
  insertDeal({
    canonicalUrl: `https://example.com/${encodeURIComponent(title)}`,
    url: `https://example.com/${encodeURIComponent(title)}`,
    title,
    summary: extra.summary ?? "",
    category: "其他",
    sourceId,
    publishedAt: firstSeenAt,
    expiresAt: extra.expiresAt ?? null,
    firstSeenAt,
    firstSeenRoundId: 1,
    updatedAt: firstSeenAt,
  });
}

describe("daily digest", () => {
  it("parses since and format without accepting a window past the shelf", () => {
    assert.deepEqual(parseSince(null), { since: "24h", ms: 24 * 60 * 60 * 1000 });
    assert.equal(parseSince("8d"), null);
    assert.equal(parseSince("0h"), null);
    assert.equal(parseSince("24"), null);
    assert.equal(parseDigestFormat(null), "markdown");
    assert.equal(parseDigestFormat("xml"), null);
  });

  it("groups new AI items by category and leaves out everything else", () => {
    useMemoryDb();
    seed(NOW - 60 * 60 * 1000, "SYNTHETIC Groq 免费额度", "free-llm", { summary: "free tier" });
    seed(NOW - 2 * 60 * 60 * 1000, "SYNTHETIC Cursor 优惠码", "v2ex-cursor", { summary: "promo code, resets monthly", expiresAt: Date.parse("2026-12-01T00:00:00.000Z") });
    seed(NOW - 30 * 60 * 1000, "SYNTHETIC 会员打折", "iplaysoft");
    seed(NOW - 48 * 60 * 60 * 1000, "SYNTHETIC 昨天的 Claude 免费额度", "v2ex-claude");
    const rows = listDeals();
    const digest = buildDigest(rows, NOW, { since: "24h", ms: 24 * 60 * 60 * 1000 });
    assert.equal(digest.count, 2);
    assert.deepEqual(digest.groups.map((group) => group.category), ["免费额度", "优惠码"]);
    assert.equal(digest.groups[0]?.items[0]?.resetCadence, null);
    assert.equal(digest.groups[1]?.items[0]?.resetCadence, "每月");
    assert.equal(digest.groups[1]?.items[0]?.expiresLabel, "2026-12-01 08:00");
    const markdown = digestMarkdown(digest);
    assert.match(markdown, /^# PerkRadar AI 日报/);
    assert.match(markdown, /## 免费额度/);
    assert.match(markdown, /## 优惠码/);
    assert.equal(markdown.includes("会员打折"), false);
    assert.equal(markdown.includes("昨天的 Claude"), false);
    assert.match(markdown, /重置：每月/);
    assert.match(markdown, /到期：2026-12-01 08:00/);
    const recent = buildDigest(listDeals(), NOW, { since: "1h", ms: 60 * 60 * 1000 });
    assert.equal(recent.count, 1);
    assert.equal(recent.groups[0]?.items[0]?.title, "SYNTHETIC Groq 免费额度");
  });

  it("serves markdown and json from the API", async () => {
    useMemoryDb();
    seed(Date.now() - 1000, "SYNTHETIC API 免费额度", "free-llm", { summary: "free credits" });
    const markdown = await GET(new Request("http://127.0.0.1/api/digest?since=24h&format=markdown"));
    assert.equal(markdown.status, 200);
    assert.match(markdown.headers.get("content-type") ?? "", /markdown/);
    assert.match(await markdown.text(), /SYNTHETIC API 免费额度/);
    const json = await GET(new Request("http://127.0.0.1/api/digest?format=json"));
    const body = await json.json() as { count: number };
    assert.equal(body.count, 1);
    const bad = await GET(new Request("http://127.0.0.1/api/digest?since=8d"));
    assert.equal(bad.status, 400);
  });

  it("prints markdown from the CLI and refuses a missing database", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "perkradar-digest-"));
    const missing = spawnSync(process.execPath, ["--import", "tsx", "scripts/digest.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: dir },
      encoding: "utf8",
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /没有可用的数据库/);

    const db = openDatabase(path.join(dir, "deals.db"));
    useDatabase(db);
    seed(Date.now() - 1000, "SYNTHETIC CLI 免费额度", "free-llm", { summary: "free credits" });
    useDatabase(null);
    const printed = spawnSync(process.execPath, ["--import", "tsx", "scripts/digest.ts", "--since=24h"], {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: dir },
      encoding: "utf8",
    });
    assert.equal(printed.status, 0, printed.stderr);
    assert.match(printed.stdout, /SYNTHETIC CLI 免费额度/);
  });
});
