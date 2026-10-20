import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign an outgoing webhook payload (Stripe-style header):
 *   X-Written-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
 * The signed string is `${timestamp}.${rawBody}`.
 */
export function signWebhookPayload(
  secret: string,
  timestampSeconds: number,
  body: string
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${digest}`;
}

/** Constant-time verification helper for webhook consumers. */
export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string,
  body: string,
  toleranceSeconds = 300
): boolean {
  if (!signatureHeader) return false;

  const parts = new Map(
    signatureHeader
      .split(",")
      .map((part) => part.split("=") as [string, string])
  );
  const timestamp = Number(parts.get("t"));
  const provided = parts.get("v1");
  if (!Number.isFinite(timestamp) || !provided) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
