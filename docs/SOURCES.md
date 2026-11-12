# 来源与合规说明

本文说明数据从哪来、存什么、以及使用边界。**公开可访问不等于可任意再分发**；本文不替代对各站条款的法律判断。

## 来源清单

URL 写死在 `src/lib/source-defs.ts`，调用方不能替换。每个来源另有一份允许域名（含子域）；条目链接不在本源允许域名内会被丢弃，不入库、不展示，并记 `offsite_link_dropped` 日志。

| id | 名称 | 请求 URL | 允许域名 | 格式 | 收录规则 | 到期时间 |
| --- | --- | --- | --- | --- | --- | --- |
| `linuxdo` | LINUX DO 福利羊毛 | `https://r.jina.ai/https://linux.do/c/welfare/36.rss` | `linux.do` | 经 Jina 转换的 Markdown | 拆出 `### [标题](.../t/topic/<数字>)` 与 RFC822 日期；解析不到整源失败 | 无 |
| `v2ex` | V2EX 推广 | `https://www.v2ex.com/feed/promotions.xml` | `v2ex.com` | Atom | feed 条目，链接去 `#reply0` | 无 |
| `epic` | Epic | `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=zh-CN&country=CN&allowCountries=CN` | `store.epicgames.com` | JSON | 仅 `start <= now < end` 且折扣价为 0 的当前促销；商品列表为空数组视为上游异常、该源失败 | 促销结束时间 |
| `nodeseek` | NodeSeek | `https://rss.nodeseek.com/` | `nodeseek.com` | RSS/Atom | feed 条目 | 无 |
| `appinn` | 小众软件 | `https://www.appinn.com/feed/` | `appinn.com` | RSS/Atom | feed 条目 | 无 |
| `ghxi` | 果核剥壳 | `https://www.ghxi.com/feed` | `ghxi.com` | RSS/Atom | feed 条目 | 无 |
| `iplaysoft` | 异次元软件世界 | `https://www.iplaysoft.com/feed` | `iplaysoft.com` | RSS/Atom | 请求会 301，跟随到最终地址 | 无 |
| `hn-ai` | Hacker News AI 优惠 | `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=30&restrictSearchableAttributes=title&advancedSyntax=true` | `news.ycombinator.com` | Algolia JSON | 固定再查 `"free credits"`、`"free tier"`、`"API credits"`、`"promo code"`、`"free trial"` 五个标题短语。条目链接只用 `https://news.ycombinator.com/item?id=<objectID>`，不用 hit 里的站外 `url`。缺 `hits` 整源失败；筛完为 0 条不算异常 | 仅当标题或正文把日历日期和 until / expires / 截止 / 到期写在一起 |
| `producthunt-ai` | Product Hunt AI | `https://www.producthunt.com/feed?category=artificial-intelligence` | `producthunt.com` | Atom | 只留标题或摘要里写明优惠、额度、折扣的产品。话题页 `/topics/.../feed` 会碰到 Cloudflare 挑战，不使用 | 无，除非原文写了上述截止日期 |
| `v2ex-openai` | V2EX OpenAI | `https://www.v2ex.com/feed/openai.xml` | `v2ex.com` | Atom | 节点已是 AI 话题，只留优惠类标题。链接去掉 `#reply0` | 无，除非原文写了截止日期 |
| `v2ex-cursor` | V2EX Cursor | `https://www.v2ex.com/feed/cursor.xml` | `v2ex.com` | Atom | 同上 | 同上 |
| `v2ex-claude` | V2EX Claude | `https://www.v2ex.com/feed/claude.xml` | `v2ex.com` | Atom | 同上 | 同上 |
| `v2ex-gemini` | V2EX Gemini | `https://www.v2ex.com/feed/gemini.xml` | `v2ex.com` | Atom | 同上 | 同上 |
| `v2ex-deepseek` | V2EX DeepSeek | `https://www.v2ex.com/feed/deepseek.xml` | `v2ex.com` | Atom | 同上 | 同上 |
| `v2ex-aigc` | V2EX 人工智能 | `https://www.v2ex.com/feed/aigc.xml` | `v2ex.com` | Atom | 同上 | 同上 |
| `free-llm` | Free-LLM 免费额度 | `https://raw.githubusercontent.com/nejib1/Free-LLM/main/README.md` | 清单内的 https 链接 | Markdown 表格 | 只读 Permanent Free Tiers、Renewable Credits、One-Time Trial Credits 三张表。本地/自建小节和代码块不收。这是固定文件，行内 https 链接是优惠地址，因此允许离开 github.com；带账号密码的链接仍丢弃 | 仅表格文字里的明确日历日期。文件没有逐行发布时间，`publishedAt` 为空，按首次入库留 7 天 |
| `ai-programs` | AI 创业与学生额度 | `https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/data/programs.json` | 清单内的 https 链接 | JSON | 只读 `startups` 与 `research`。文件级 `generated` 是生成时间，不当成优惠发布时间或到期时间。链接规则同 Free-LLM | 仅 `what` 文本里的明确日历日期 |

综合源收录落在 7 天窗口、且链接在本源允许域名内的条目，包含闲聊、求购、抽奖与软件新闻；它们只是线索，不是已核实的优惠。AI 节点和两份 AI 清单在入库前会丢掉不像优惠的标题，筛完 0 条不算来源异常。发布时间早于 2000-01-01 或晚于当前时刻 +7 天视为无效（`published_at` 为 `null`，留存改用 `first_seen_at`），单个 feed 最多解析前 2000 条。日期校验也适用于LINUX DO；分类在读时评分重算（可回退），规则、时间边界与每轮验收见 [DATA_QUALITY.md](DATA_QUALITY.md)。

## 只存必要字段

入库字段：标题（≤300 字）、规范化后的原文链接、摘要（≤160 字，没有正文就留空）、来源提供的发布时间、Epic 的促销结束时间、首次收录时间与轮次 id。**不存正文全文、图片、Cookie、请求头、账号、邮箱或凭证**，也不补写来源没有提供的价格或日期。原文链接经校验后保留：超过 2048 字符、含 `user:pass@` 凭证、非 http/https 协议或不在本源允许域名内的会被拒绝 / 丢弃；页面「打开原文」指向规范化后的地址。纯文本清洗会去掉 ANSI/SGR 控制序列、C0 控制字符与长分隔线。结构化日志也只记轮次、逐源成败、耗时与失败分类，不含标题正文、Cookie、请求头或个人状态，见 [DEVELOPMENT.md](DEVELOPMENT.md)。

测试夹具同样遵守这条边界：`tests/fixtures/README.md` 记录来源与采集时间，正文全文已裁剪，且 `tests/` 不进生产镜像。

## 使用条件核查状态

核查日期：2026-11-12。下表记录的是**当前能确认的事实**，不是授权结论。

| 来源 | 公开可访问 | 书面条款核查 | 结论 |
| --- | --- | --- | --- |
| 原有 7 个来源 | 是（按上表 URL 可读取） | **未完成逐站书面核查** | 仅按「读取公开 feed、保留原文链接、只存短摘要」的最低限度使用；维护者需按各站 ToS / robots 逐条复核后再扩大用途 |
| Hacker News Algolia | 2026-11-12 查询返回 JSON | `news.ycombinator.com/robots.txt` 禁止投票、登录等 HTML 动作并设 crawl-delay 30；本次走的是公开搜索 API `hn.algolia.com/api`，不抓讨论页 HTML | 只存讨论页链接和短摘要 |
| Product Hunt AI feed | 2026-11-12 返回 Atom | `robots.txt` 未禁止 `/feed`。`/topics/artificial-intelligence/feed` 返回 Cloudflare 挑战页，未使用 | 只用未受挑战的分类 feed |
| V2EX 六个 AI 节点 | 2026-11-12 返回非空 Atom | `robots.txt` 只禁止 `/backstage/`、登录和设置，不禁止 `/feed/`。与现有推广 feed 同一访问方式 | 空响应的 `ai.xml`、`chatgpt.xml`、`llm.xml` 未接入 |
| Free-LLM README | 2026-11-12 `raw.githubusercontent.com` 返回 Markdown，仓库许可证 MIT | `raw.githubusercontent.com/robots.txt` 返回 404，没有额外禁止规则。公开仓库原文可读取 | 只解析三张优惠表。行内链接离开 GitHub，这是该固定文件的例外 |
| free-llm-api-hub `programs.json` | 2026-11-12 可读取，仓库许可证 MIT | 同上 | 只存项目名、官方链接和短说明。不把文件生成时间当成活动日期 |

因此：

- 不把抓取到的标题与摘要视为可自由再分发的内容资产；本仓库只把它们作为运行时的线索索引。
- 若来源方要求停止抓取、移除内容或更正表述，按下面渠道处理，不要求对方先证明损失。
- 新增来源必须按 [CONTRIBUTING.md](../CONTRIBUTING.md) 提供使用条件核查结论与采集时间。

### 两处需要单独标注的风险

1. **LINUX DO 经第三方 `r.jina.ai` 代理**。这等于把第三方服务纳入抓取链路，其可用性、条款与内容转换规则不由本仓库控制。被阻断时按现有约定让该源失败、下一轮再试，不改成直连，也不做挑战绕过。
2. **Epic 使用静态后端端点**，不是公开承诺的稳定 API。响应结构或访问策略变化会导致整源失败；代码只识别当前免费促销窗口，不识别「长期免费本体」与「限时礼包」的语义差别。
3. **两个 GitHub 清单的行内链接不在 github.com 上**。它们被写死在 `source-defs.ts`，只接受 https，仍拒绝 `user:pass@`。清单更新后，新的链接会在下一轮出现；如果仓库被改成无关推广，应停用该来源，而不是放宽其他 feed 的域名限制。
4. **静态清单没有逐条发布时间**。按首次入库保留 7 天，到期后下一轮会重新入库。日报只看窗口内的首次入库，所以一份长期清单可能在重新入库的那一天再次出现，不代表活动刚开始。

## 评估后未接入

| 候选 | 2026-11-12 看到的情况 | 原因 |
| --- | --- | --- |
| Reddit `r/OpenAI`、`r/LocalLLaMA`、`r/ChatGPT` 的 `.rss` / `.json` | `.rss` 能返回 Atom，但一次请求后 `x-ratelimit-remaining` 为 0。`robots.txt` 对 `User-agent: *` 是 `Disallow: /`，并指向 Public Content Policy | 站点明确不让通用爬虫抓取，限流也不稳定 |
| AppSumo | `/feed/` 与 `/rss` 均为 404 | 没有可用的公开优惠 feed。不注册合作方账号 |
| OpenAI 新闻 RSS | `https://openai.com/news/rss.xml` 约 840KB、一千多条历史正文 | 贴近 150 万字符上限，而且是新闻归档，不是优惠 feed |
| Anthropic RSS | `/rss.xml` 与 `/news/rss.xml` 均为 404 | 没有这个地址 |
| Hugging Face 博客 | feed 可读取 | 研究博客，不是优惠清单 |
| Product Hunt 话题路径 | `/topics/artificial-intelligence/feed` 返回挑战页 | 不绕过挑战。改用上面的分类 Atom |
| `cheahjs/free-llm-api-resources` | GitHub API 与 raw README 均为 404 | 地址当前不可用 |
| `LiLittleCat/awesome-free-chatgpt` | README 目录是「ChatGPT 镜像列表」 | 镜像站不是官方免费额度 |
| 各类「免费 API 中转站」仓库 | 搜索结果指向第三方转发 | 不收录非官方中转或共享入口 |
| V2EX `ai.xml`、`chatgpt.xml`、`llm.xml` | HTTP 200 但正文 0 字节 | 节点不存在或没有 feed |
| LINUX DO 额外 AI 分区 | 没有核对到稳定、公开的分区 RSS 编号 | 不猜测分区 id，也不改成直连。现有福利区仍走 Jina，AI 筛选会从中挑线索 |
| `ruodou233/free-token-eggs` | README 是工具介绍，不是优惠列表 | 没有可解析的条目 |

## 移除与纠错渠道

- 内容错报、失效条目、来源失效：使用 `.github/ISSUE_TEMPLATE/` 里的模板，附原文链接、发现时间与期望行为。
- 涉及许可、隐私或授权：按 [SECURITY.md](../SECURITY.md) 走私密渠道，不要公开贴数据。
- 维护者收到请求后的处理顺序：先确认涉及的来源或条目 → 从库中移除或暂缓抓取 → 复核解析与分类规则 → 在变更记录里说明。原文链接是否继续保留，以来源方要求为准。

审核修复：Epic非空但缺字段/类型漂移/部分异常亦整源失败，禁止误删；Jina匿名配置、429退避、短时熔断状态分别呈现，不代表已实测当前限流。运行请求UA为PerkRadar/版本及仓库链接。逐站书面条款核查仍未完成，不因代码修复自动获得授权。
