/**
 * Public origin used in links inside webhook payloads and feeds.
 * Prefers an explicitly configured canonical URL, then proxy headers.
 */
export function getOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");

  if (host) return `${proto}://${host}`;

  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

export function postUrl(origin: string, postId: string): string {
  return `${origin}/post/${postId}`;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}
