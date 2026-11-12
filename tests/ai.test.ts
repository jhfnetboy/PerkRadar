import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAi, explicitDeadline, resetCadence } from "../src/lib/ai";
import { loadAiOnly } from "../src/lib/personal-storage";

const NOW = Date.parse("2026-11-12T00:00:00.000Z");

describe("AI relevance", () => {
  it("assigns bilingual offer categories and ignores discussion", () => {
    assert.equal(classifyAi("Groq free credits for new LLM apps").category, "免费额度");
    assert.equal(classifyAi("Claude API 每月重置免费额度").category, "额度重置");
    assert.equal(classifyAi("ChatGPT promo code for Plus").category, "优惠码");
    assert.equal(classifyAi("GitHub Student Developer Pack includes Copilot").category, "学生/教育");
    assert.equal(classifyAi("Cursor Black Friday 50% off").category, "限时折扣");
    assert.equal(classifyAi("OpenAI launches a new model with a free preview").category, "新模型免费体验");
    assert.equal(classifyAi("通义千问赠送 API 额度").relevant, true);
    assert.equal(classifyAi("Ask HN: any free credits for GPT?").relevant, false);
    assert.equal(classifyAi("有没有办法在 Codex 里用 API 额度").relevant, false);
    assert.equal(classifyAi("【抽奖】ChatGPT 免费账号").relevant, false);
    assert.equal(classifyAi("GitLab.com free tier").relevant, false);
    assert.equal(classifyAi("ChatGPT Pro 套餐").relevant, false);
  });

  it("lets an AI-scoped source through when the title only states the offer", () => {
    const row = classifyAi("SYNTHETIC Groq\nPermanent Free Tiers. 1,000 requests/day.", { assumeTopic: true });
    assert.equal(row.relevant, true);
    assert.equal(row.category, "额度重置");
    assert.equal(row.resetCadence, "每日");
    assert.equal(classifyAi("hello", { assumeTopic: true }).relevant, false);
  });

  it("reads cadence and calendar deadlines without inventing either", () => {
    assert.equal(resetCadence("50 requests/day and $5/month"), "每日、每月");
    assert.equal(resetCadence("rolling credit refresh"), "滚动");
    assert.equal(resetCadence("expires after 30 days"), null);
    assert.equal(explicitDeadline("free until 2026-12-01", NOW), Date.UTC(2026, 11, 1));
    assert.equal(explicitDeadline("截止2026年12月1日", NOW), Date.UTC(2026, 11, 1));
    assert.equal(explicitDeadline("expires on December 1, 2026", NOW), Date.UTC(2026, 11, 1));
    assert.equal(explicitDeadline("expires after 30 days", NOW), null);
    assert.equal(explicitDeadline("published 2026-12-01", NOW), null);
    assert.equal(explicitDeadline("until 1999-01-01", NOW), null);
  });

  it("defaults the AI-only preference to on and keeps it separate from favorites", () => {
    const store = { getItem: () => null, setItem() {} };
    assert.equal(loadAiOnly(store), true);
    assert.equal(loadAiOnly({ getItem: () => "0", setItem() {} }), false);
    assert.equal(loadAiOnly({ getItem: () => "1", setItem() {} }), true);
  });
});
