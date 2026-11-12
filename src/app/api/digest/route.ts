import { authFailure } from "@/lib/auth";
import { NextResponse } from "next/server";
import { digestMarkdown, parseDigestFormat, parseSince, readDigest } from "@/lib/digest";
import { logFailure } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const denied = authFailure(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const since = parseSince(params.get("since"));
  if (!since) {
    return NextResponse.json({ error: "无效的 since" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const format = parseDigestFormat(params.get("format"));
  if (!format) {
    return NextResponse.json({ error: "无效的 format" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const digest = readDigest(Date.now(), since);
    if (format === "json") {
      return NextResponse.json(digest, { headers: { "cache-control": "no-store" } });
    }
    return new NextResponse(digestMarkdown(digest), {
      headers: { "cache-control": "no-store", "content-type": "text/markdown; charset=utf-8" },
    });
  } catch (error) {
    logFailure("digest_read_failed", error);
    return NextResponse.json({ error: "数据库不可读" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
