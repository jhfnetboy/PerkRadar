import { existsSync } from "node:fs";
import { digestMarkdown, parseDigestFormat, parseSince, readDigest } from "../src/lib/digest";
import { databaseFile } from "../src/lib/db";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? "";
  return null;
}

const since = parseSince(arg("since"));
const format = parseDigestFormat(arg("format"));
if (!since) {
  console.error("无效的 since。示例：--since=24h 或 --since=7d，最长 7 天。");
  process.exit(1);
}
if (!format) {
  console.error("无效的 format。可用 markdown 或 json。");
  process.exit(1);
}

const file = databaseFile();
if (!existsSync(file)) {
  console.error("没有可用的数据库，尚未抓取。");
  process.exit(1);
}

try {
  const digest = readDigest(Date.now(), since);
  process.stdout.write(format === "json" ? `${JSON.stringify(digest, null, 2)}\n` : digestMarkdown(digest));
} catch (error) {
  const message = error instanceof Error ? error.message : "数据库不可读";
  console.error(message.slice(0, 300));
  process.exit(1);
}
