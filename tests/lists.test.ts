import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseMarkdownOfferTable } from "../src/lib/parse/markdown-table";
import { parseAiPrograms } from "../src/lib/parse/programs";
import { loadSource } from "../src/lib/sources";
import { SOURCE_DEFS } from "../src/lib/source-defs";
import { resetCircuitsForTests } from "../src/lib/source-resilience";
import type { FetchLike } from "../src/lib/http";
import { canonicalUrl } from "../src/lib/url";
import { atomFeed, responseFor } from "./helpers";

const NOW = Date.parse("2026-11-12T00:00:00.000Z");

describe("curated AI list parsers", () => {
  it("reads offer tables, skips local tools and fenced rows, and does not invent dates", () => {
    const markdown = readFileSync(new URL("./fixtures/free-llm-synthetic.md", import.meta.url), "utf8");
    const items = parseMarkdownOfferTable(markdown, NOW);
    assert.deepEqual(items.map((item) => item.title), ["SYNTHETIC Groq", "SYNTHETIC Secret", "SYNTHETIC Fire", "SYNTHETIC Days"]);
    assert.equal(items[0]?.publishedAt, null);
    assert.equal(items[0]?.expiresAt, null);
    assert.equal(items[0]?.summary.includes("requests/day"), true);
    const fire = items.find((item) => item.title === "SYNTHETIC Fire");
    assert.equal(fire?.expiresAt, Date.UTC(2026, 11, 1));
    assert.equal(items.find((item) => item.title === "SYNTHETIC Days")?.expiresAt, null);
    assert.equal(items.some((item) => item.url.includes("ollama") || item.url.includes("fence")), false);
    assert.throws(() => parseMarkdownOfferTable("<!doctype html><html></html>", NOW), /Markdown/);
  });

  it("drops credential and non-https links for the pinned markdown source", async () => {
    resetCircuitsForTests();
    const source = SOURCE_DEFS.find((item) => item.id === "free-llm")!;
    const markdown = readFileSync(new URL("./fixtures/free-llm-synthetic.md", import.meta.url), "utf8");
    const fetchImpl: FetchLike = async () => responseFor(markdown, source.url);
    const loaded = await loadSource(source, { fetchImpl, signal: new AbortController().signal, now: NOW });
    assert.deepEqual(loaded.items.map((item) => item.url), ["https://example.com/groq", "https://example.com/fire", "https://example.com/days"]);
  });

  it("reads startup and student programs without using the file generation time", () => {
    const payload = JSON.parse(readFileSync(new URL("./fixtures/programs-synthetic.json", import.meta.url), "utf8"));
    const items = parseAiPrograms(payload, NOW);
    assert.deepEqual(items.map((item) => item.title), ["SYNTHETIC Cloud", "SYNTHETIC Students"]);
    assert.equal(items[0]?.publishedAt, null);
    assert.equal(items[0]?.expiresAt, Date.UTC(2026, 11, 15));
    assert.equal(items[1]?.expiresAt, null);
    assert.equal(JSON.stringify(items).includes("1999-01-01"), false);
    assert.throws(() => parseAiPrograms({ startups: [] }, NOW), /启动信贷清单/);
    assert.throws(() => parseAiPrograms(JSON.parse("[]"), NOW), /启动信贷清单/);
  });

  it("keeps only deal-like posts from an AI node feed", async () => {
    resetCircuitsForTests();
    const source = SOURCE_DEFS.find((item) => item.id === "v2ex-openai")!;
    const body = atomFeed([
      { title: "SYNTHETIC 有没有 API 额度", link: "https://www.v2ex.com/t/1#reply0", published: "2026-11-11T00:00:00Z" },
      { title: "SYNTHETIC Claude 免费额度每月重置", link: "https://www.v2ex.com/t/2#reply0", published: "2026-11-11T00:00:00Z" },
      { title: "SYNTHETIC 站外优惠码", link: "https://evil.example/deal", published: "2026-11-11T00:00:00Z" },
    ]);
    const fetchImpl: FetchLike = async () => responseFor(body, source.url);
    const loaded = await loadSource(source, { fetchImpl, signal: new AbortController().signal, now: NOW });
    assert.equal(canonicalUrl(loaded.items[0]!.url), "https://www.v2ex.com/t/2");
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.items[0]?.expiresAt, null);
  });

  it("keeps Product Hunt posts only when the title states an offer", async () => {
    resetCircuitsForTests();
    const source = SOURCE_DEFS.find((item) => item.id === "producthunt-ai")!;
    const body = atomFeed([
      { title: "SYNTHETIC bonds chat", link: "https://www.producthunt.com/products/bonds", published: "2026-11-11T00:00:00Z" },
      { title: "SYNTHETIC free credits for agents", link: "https://www.producthunt.com/products/credits", published: "2026-11-11T00:00:00Z" },
    ]);
    const fetchImpl: FetchLike = async () => responseFor(body, source.url);
    const loaded = await loadSource(source, { fetchImpl, signal: new AbortController().signal, now: NOW });
    assert.deepEqual(loaded.items.map((item) => item.url), ["https://www.producthunt.com/products/credits"]);
  });
});
