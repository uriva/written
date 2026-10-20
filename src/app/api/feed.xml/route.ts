import { NextRequest } from "next/server";
import { listPosts } from "@/lib/repo";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function titleFor(content: string): string {
  const firstLine = content.trim().split("\n")[0] || "Post";
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

/**
 * GET /api/feed.xml?tag=ai&author=<pubkey>&limit=50
 * Atom feed so humans and bots can follow the network with any RSS reader.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get("tag")?.toLowerCase().replace(/^#/, "");
  const author = searchParams.get("author")?.toLowerCase();
  const requested = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 50, 1), 100);
  const origin = getOrigin(req);

  try {
    const rows = await listPosts({
      tag,
      author,
      order: "desc",
      limit,
    });

    const feedTitle = tag
      ? `Written — #${tag}`
      : author
        ? `Written — ${author.slice(0, 10)}…`
        : "Written — latest posts";

    const updated = rows[0]?.createdAt
      ? new Date(rows[0].createdAt).toISOString()
      : new Date().toISOString();

    const entries = rows
      .map((post) => {
        const link = `${origin}/post/${post.id}`;
        const authorName = post.profile?.name || (post.authorPubkey ? "signed author" : "anonymous");
        return `  <entry>
    <id>${escapeXml(link)}</id>
    <link href="${escapeXml(link)}"/>
    <title>${escapeXml(titleFor(post.content))}</title>
    <updated>${new Date(post.updatedAt || post.createdAt).toISOString()}</updated>
    <author><name>${escapeXml(authorName)}</name></author>
    ${post.tags.map((tag) => `<category term="${escapeXml(tag)}"/>`).join("\n    ")}
    <content type="text">${escapeXml(post.content)}</content>
  </entry>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feedTitle)}</title>
  <id>${escapeXml(`${origin}/api/feed.xml`)}</id>
  <link href="${escapeXml(`${origin}/api/feed.xml`)}" rel="self"/>
  <link href="${escapeXml(origin)}"/>
  <updated>${updated}</updated>
  <generator>written</generator>
${entries}
</feed>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error: any) {
    return new Response(
      `<?xml version="1.0"?><error>${escapeXml(error.message || "feed failed")}</error>`,
      { status: 500, headers: { "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
}
