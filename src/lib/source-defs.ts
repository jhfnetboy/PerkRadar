export type SourceFormat = "linuxdo" | "epic" | "feed" | "hn" | "markdown-table" | "json-programs";

export type SourceDef = {
  id: string;
  name: string;
  url: string;
  /** Item links must stay on the source's own domain, unless `linkScope` says otherwise. */
  allowedHosts: string[];
  format?: SourceFormat;
  /** Drop titles that are not AI offers before insert. Display still re-checks. */
  ingest?: "all" | "ai-deals";
  /** The feed or file is already an AI topic, so a deal signal is enough. */
  assumeAi?: boolean;
  /** Zero kept items is a normal result of keyword filtering, not a broken feed. */
  allowEmpty?: boolean;
  /**
   * `pinned-outbound` keeps https links inside a file pinned in this list.
   * Used only for curated GitHub documents whose row link is the offer.
   */
  linkScope?: "host" | "pinned-outbound";
  /** Fixed Algolia title queries. Callers cannot replace them. */
  hnQueries?: string[];
};

export function sourceFormat(source: SourceDef): SourceFormat {
  if (source.format) return source.format;
  if (source.id === "linuxdo") return "linuxdo";
  if (source.id === "epic") return "epic";
  return "feed";
}

/**
 * Fixed sources. Callers cannot substitute URLs.
 * V2EX must be the plural `promotions.xml`. `promotion.xml` returns an empty feed.
 * LINUX DO must go through the Jina reader. Direct category RSS is not used.
 * 异次元 is requested at the URL that 301-redirects; the client follows it.
 */
export const SOURCE_DEFS: SourceDef[] = [
  {
    id: "linuxdo",
    name: "LINUX DO福利羊毛",
    url: "https://r.jina.ai/https://linux.do/c/welfare/36.rss",
    allowedHosts: ["linux.do"],
  },
  {
    id: "v2ex",
    name: "V2EX推广",
    url: "https://www.v2ex.com/feed/promotions.xml",
    allowedHosts: ["v2ex.com"],
  },
  {
    id: "epic",
    name: "Epic",
    url: "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=zh-CN&country=CN&allowCountries=CN",
    allowedHosts: ["store.epicgames.com"],
  },
  {
    id: "nodeseek",
    name: "NodeSeek",
    url: "https://rss.nodeseek.com/",
    allowedHosts: ["nodeseek.com"],
  },
  {
    id: "appinn",
    name: "小众软件",
    url: "https://www.appinn.com/feed/",
    allowedHosts: ["appinn.com"],
  },
  {
    id: "ghxi",
    name: "果核剥壳",
    url: "https://www.ghxi.com/feed",
    allowedHosts: ["ghxi.com"],
  },
  {
    id: "iplaysoft",
    name: "异次元软件世界",
    url: "https://www.iplaysoft.com/feed",
    allowedHosts: ["iplaysoft.com"],
  },
  {
    id: "hn-ai",
    name: "Hacker News AI 优惠",
    url: "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=30&restrictSearchableAttributes=title&advancedSyntax=true",
    allowedHosts: ["news.ycombinator.com"],
    format: "hn",
    hnQueries: ['"free credits"', '"free tier"', '"API credits"', '"promo code"', '"free trial"'],
    ingest: "ai-deals",
    allowEmpty: true,
  },
  {
    id: "producthunt-ai",
    name: "Product Hunt AI",
    url: "https://www.producthunt.com/feed?category=artificial-intelligence",
    allowedHosts: ["producthunt.com"],
    format: "feed",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
  },
  {
    id: "v2ex-openai",
    name: "V2EX OpenAI",
    url: "https://www.v2ex.com/feed/openai.xml",
    allowedHosts: ["v2ex.com"],
    format: "feed",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
  },
  {
    id: "v2ex-cursor",
    name: "V2EX Cursor",
    url: "https://www.v2ex.com/feed/cursor.xml",
    allowedHosts: ["v2ex.com"],
    format: "feed",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
  },
  {
    id: "v2ex-claude",
    name: "V2EX Claude",
    url: "https://www.v2ex.com/feed/claude.xml",
    allowedHosts: ["v2ex.com"],
    format: "feed",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
  },
  {
    id: "v2ex-gemini",
    name: "V2EX Gemini",
    url: "https://www.v2ex.com/feed/gemini.xml",
    allowedHosts: ["v2ex.com"],
    format: "feed",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
  },
  {
    id: "v2ex-deepseek",
    name: "V2EX DeepSeek",
    url: "https://www.v2ex.com/feed/deepseek.xml",
    allowedHosts: ["v2ex.com"],
    format: "feed",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
  },
  {
    id: "v2ex-aigc",
    name: "V2EX 人工智能",
    url: "https://www.v2ex.com/feed/aigc.xml",
    allowedHosts: ["v2ex.com"],
    format: "feed",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
  },
  {
    id: "free-llm",
    name: "Free-LLM 免费额度",
    url: "https://raw.githubusercontent.com/nejib1/Free-LLM/main/README.md",
    allowedHosts: ["raw.githubusercontent.com", "github.com"],
    format: "markdown-table",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
    linkScope: "pinned-outbound",
  },
  {
    id: "ai-programs",
    name: "AI 创业与学生额度",
    url: "https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/data/programs.json",
    allowedHosts: ["raw.githubusercontent.com", "github.com"],
    format: "json-programs",
    ingest: "ai-deals",
    assumeAi: true,
    allowEmpty: true,
    linkScope: "pinned-outbound",
  },
];

export function sourceName(id: string): string {
  return SOURCE_DEFS.find((source) => source.id === id)?.name ?? id;
}

export function sourceAssumesAi(id: string): boolean {
  return SOURCE_DEFS.find((source) => source.id === id)?.assumeAi === true;
}

export function sourceAllowsEmpty(id: string): boolean {
  return SOURCE_DEFS.find((source) => source.id === id)?.allowEmpty === true;
}
