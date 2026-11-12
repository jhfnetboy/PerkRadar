import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseHnSearch } from "../src/lib/parse/hn";
import { loadSource } from "../src/lib/sources";
import { SOURCE_DEFS } from "../src/lib/source-defs";
import { resetCircuitsForTests } from "../src/lib/source-resilience";
import type { FetchLike } from "../src/lib/http";

const NOW = Date.parse("2026-11-12T00:00:00.000Z");
const fixture = readFileSync(new URL("./fixtures/hn-synthetic.json", import.meta.url), "utf8");

describe("Hacker News search parser", () => {
  it("keeps the discussion URL, a real deadline, and drops non-stories", () => {
    const items = parseHnSearch(JSON.parse(fixture), NOW);
    assert.deepEqual(items.map((item) => item.url), [
      "https://news.ycombinator.com/item?id=101",
      "https://news.ycombinator.com/item?id=102",
      "https://news.ycombinator.com/item?id=103",
    ]);
    assert.equal(items[0]?.expiresAt, Date.UTC(2026, 11, 1));
    assert.equal(items[0]?.url.includes("evil.example"), false);
    assert.equal(items[2]?.expiresAt, null);
    assert.equal(items[2]?.title.includes("30 days"), true);
  });

  it("rejects a drifted payload and an HTML challenge page", () => {
    assert.throws(() => parseHnSearch({ results: [] }, NOW), /hits/);
    assert.throws(() => parseHnSearch("not-json", NOW), /JSON/);
  });

  it("filters to AI offers and surfaces HTTP 429 from the search API", async () => {
    resetCircuitsForTests();
    const source = SOURCE_DEFS.find((item) => item.id === "hn-ai")!;
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      url: source.url,
      headers: { get: () => null },
      text: async () => fixture,
    });
    const loaded = await loadSource(source, { fetchImpl, signal: new AbortController().signal, now: NOW });
    assert.equal(loaded.finalUrl, source.url);
    assert.deepEqual(loaded.items.map((item) => item.title), [
      "SYNTHETIC Groq free credits for LLM apps",
      "SYNTHETIC credits that expire after 30 days",
    ]);

    const limited: FetchLike = async () => ({
      ok: false,
      status: 429,
      url: source.url,
      headers: { get: () => "0" },
      text: async () => "",
    });
    await assert.rejects(
      () => loadSource(source, { fetchImpl: limited, signal: new AbortController().signal, now: NOW }),
      /HTTP 429/,
    );
  });
});
