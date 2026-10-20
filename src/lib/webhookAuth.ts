import type { NextRequest } from "next/server";
import {
  buildWebhookCanonicalMessage,
  isValidPubkey,
  verifyPayload,
} from "./crypto";

/** Requests older than this are rejected to limit replay. */
export const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export type WebhookAction =
  | "list"
  | "create"
  | "get"
  | "update"
  | "delete"
  | "test"
  | "deliveries";

export interface AuthSuccess {
  ok: true;
  pubkey: string;
  timestamp: number;
}

export interface AuthFailure {
  ok: false;
  status: number;
  error: string;
}

export type AuthResult = AuthSuccess | AuthFailure;

function failure(status: number, error: string): AuthFailure {
  return { ok: false, status, error };
}

/**
 * Authenticate an accountless webhook-management request.
 *
 * Credentials may be supplied in the JSON body or as headers:
 *   x-written-pubkey, x-written-signature, x-written-timestamp
 *
 * The signature covers: WRITTEN_WEBHOOK:{action}:{target}:{timestamp}
 */
export function authenticateWebhookRequest(
  req: NextRequest,
  body: Record<string, unknown> | null,
  action: WebhookAction,
  target: string
): AuthResult {
  const bodyPubkey = typeof body?.pubkey === "string" ? body.pubkey : undefined;
  const bodySignature =
    typeof body?.signature === "string" ? body.signature : undefined;
  const bodyTimestamp = body?.timestamp;

  const pubkey = (bodyPubkey || req.headers.get("x-written-pubkey") || "")
    .trim()
    .toLowerCase();
  const signature = (
    bodySignature ||
    req.headers.get("x-written-signature") ||
    ""
  )
    .trim()
    .toLowerCase();

  const rawTimestamp = bodyTimestamp ?? req.headers.get("x-written-timestamp");
  const timestamp = Number(rawTimestamp);

  if (!isValidPubkey(pubkey)) {
    return failure(
      401,
      "A valid 64-char hex public key is required ('pubkey' body field or X-Written-Pubkey header)"
    );
  }

  if (!signature) {
    return failure(
      401,
      "An Ed25519 signature is required ('signature' body field or X-Written-Signature header)"
    );
  }

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return failure(
      401,
      "A millisecond timestamp is required ('timestamp' body field or X-Written-Timestamp header)"
    );
  }

  if (Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) {
    return failure(
      401,
      "Signature timestamp is too old or too far in the future (max 5 minutes of clock skew)"
    );
  }

  if (!target || target.length > 2048) {
    return failure(400, "Invalid signature target");
  }

  const message = buildWebhookCanonicalMessage({ action, target, timestamp });
  if (!verifyPayload(signature, message, pubkey)) {
    return failure(401, "Invalid signature for this webhook action");
  }

  return { ok: true, pubkey, timestamp };
}

export function parseFiltersField(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("'filters' must be a JSON object or object");
    }
  }
  return value;
}
