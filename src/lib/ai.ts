import type { AiCategory } from "./types";

export type AiVerdict = {
  relevant: boolean;
  category: AiCategory | null;
  /** Higher means a more specific offer signal. Zero when the item is not relevant. */
  score: number;
  /** A period the text itself states. Never a computed next-reset instant. */
  resetCadence: string | null;
};

const AI_TOPIC =
  /AI\b|AIGC|\bLLM\b|GPT|ChatGPT|Claude|Gemini|Copilot|Codex|Cursor|Windsurf|Devin|Perplexity|Midjourney|Stable Diffusion|Sora|DeepSeek|Kimi|Qwen|Mistral|Llama|Groq|OpenRouter|OpenAI|Anthropic|Hugging\s*Face|Runway|ElevenLabs|Suno|Grok|大模型|人工智能|通义|文心|智谱|混元|豆包|即梦|可灵|\bGPU\b/i;

/** Words that state an offer, a quota, or a discount. */
const STRONG_DEAL =
  /免费额度|赠送额度|体验额度|免费试用|免费领|限免|白嫖|羊毛|优惠码|优惠券|折扣码|兑换码|promo\s*code|coupon|free\s+credits?|api\s+credits?|free\s+tier|free\s+trial|\$\s?\d|\d+\s*%\s*off|black\s*friday|黑五|学生优惠|教育优惠|lifetime\s+deal/i;

const MEDIUM_DEAL =
  /免费|额度|试用|优惠|折扣|促销|打折|降价|\bfree\b|credits?|discount|trial|student|教育|学生|campus|requests?\s*\/\s*day|requests?\s*\/\s*month|per\s+day|per\s+month|\/month|renewable|续杯|签到/i;

const RESET =
  /额度重置|重置额度|每月重置|每周重置|每日重置|刷新额度|renew(?:s|able|ed)?|quota\s+reset|credits?\s+reset|resets?\s+(?:every|each|monthly|weekly|daily)|monthly\s+(?:reset|refresh|credit)|weekly\s+(?:reset|refresh)/i;

const PROMO = /优惠码|优惠券|折扣码|兑换码|promo\s*code|coupon\s*code|coupon/i;
const STUDENT = /学生|教育优惠|校园|student|education\s+pack|campus|university|\.edu\b/i;
const DISCOUNT = /限时折扣|折扣|打折|降价|促销|特价|\d+\s*%\s*off|discount|black\s*friday|黑五|双十一|双\s*11|sale/i;
const LAUNCH = /新模型|新发布|上线|发布|launches?|launch|preview|now\s+available/i;
const FREE_ACCESS = /免费|试用|限免|free|trial|preview|开放体验/i;

const BLOCKED =
  /抽奖|开奖|求购|收购|求助|请问|有没有|有无|能不能|可不可以|怎么|如何|为什么|为啥|ask\s+hn\b|how\s+(?:do|to|can)\b|why\s+/i;

const CUE =
  /until|expires?|expiry|deadline|ends?|through|before|valid\s+through|截止|到期|有效期至|活动至|活动截止|截止日期/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function calendarMs(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return ms;
}

function nearCue(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - 24), index + 24);
  return CUE.test(window);
}

/**
 * A calendar date the text explicitly ties to a deadline.
 * Durations ("30 days", "12 mo") and dates without a deadline cue are ignored.
 */
export function explicitDeadline(text: string, now = Date.now()): number | null {
  const found: number[] = [];
  const consider = (ms: number | null, index: number) => {
    if (ms == null || !nearCue(text, index)) return;
    const max = now + 366 * 24 * 60 * 60 * 1000;
    if (ms < Date.UTC(2000, 0, 1) || ms > max) return;
    found.push(ms);
  };
  for (const match of text.matchAll(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g)) {
    consider(calendarMs(Number(match[1]), Number(match[2]), Number(match[3])), match.index ?? 0);
  }
  for (const match of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    consider(calendarMs(Number(match[1]), Number(match[2]), Number(match[3])), match.index ?? 0);
  }
  for (const match of text.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\b/g)) {
    const month = MONTHS[match[1]!.toLowerCase()];
    if (!month) continue;
    consider(calendarMs(Number(match[3]), month, Number(match[2])), match.index ?? 0);
  }
  if (!found.length) return null;
  return found[0]!;
}

/** Periods named in the text. "30 days" is a duration, not a daily reset. */
export function resetCadence(text: string): string | null {
  const parts: string[] = [];
  if (/每\s*日|每天|daily|per\s+day|\/\s*day|requests?\s*\/\s*day/i.test(text)) parts.push("每日");
  if (/每\s*周|每周|weekly|per\s+week|\/\s*week/i.test(text)) parts.push("每周");
  if (/每\s*月|每月|monthly|per\s+month|\/\s*month/i.test(text)) parts.push("每月");
  if (/滚动|rolling/i.test(text) && /额度|credit|quota/i.test(text)) parts.push("滚动");
  return parts.length ? parts.join("、") : null;
}

function categoryFor(text: string): AiCategory {
  if (PROMO.test(text)) return "优惠码";
  if (STUDENT.test(text)) return "学生/教育";
  if (RESET.test(text) || resetCadence(text)) return "额度重置";
  if (LAUNCH.test(text) && FREE_ACCESS.test(text)) return "新模型免费体验";
  if (DISCOUNT.test(text)) return "限时折扣";
  return "免费额度";
}

/**
 * Title-and-summary heuristic for AI freebies and discounts.
 * It does not check that an offer is real, still open, or claimable.
 * `assumeTopic` is for sources whose whole feed is already an AI list or node.
 */
export function classifyAi(text: string, options?: { assumeTopic?: boolean }): AiVerdict {
  const topic = Boolean(options?.assumeTopic) || AI_TOPIC.test(text);
  const strong = STRONG_DEAL.test(text);
  const deal = strong || MEDIUM_DEAL.test(text);
  const blocked = BLOCKED.test(text);
  const relevant = topic && deal && !blocked;
  if (!relevant) return { relevant: false, category: null, score: 0, resetCadence: null };
  const category = categoryFor(text);
  const cadence = resetCadence(text);
  let score = strong ? 6 : 4;
  if (category !== "免费额度") score += 2;
  if (cadence) score += 1;
  return { relevant: true, category, score, resetCadence: cadence };
}
