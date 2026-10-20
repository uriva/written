import { randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { after } from "next/server";
import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, webhookDeliveries, webhooks } from "@/db/schema";
import { signWebhookPayload } from "./webhookSignature";
import {
  matchesFilters,
  normalizeFilters,
  type NormalizedWebhookFilters,
  type WebhookEvent,
  type WebhookEventType,
} from "./webhookTypes";

export const MAX_WEBHOOKS_PER_OWNER = 10;
export const MAX_DELIVERY_ATTEMPTS = 6;
const DISABLE_AFTER_FAILURES = 15;
const DELIVERY_TIMEOUT_MS = 8_000;
const USER_AGENT = "written-webhooks/1.0 (+https://github.com/uriva/written)";
const BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export type WebhookRow = typeof webhooks.$inferSelect;
export type DeliveryRow = typeof webhookDeliveries.$inferSelect;

export interface DeliveryResult {
  ok: boolean;
  deliveryId: string;
  status: "success" | "pending" | "failed" | "skipped";
  attempts: number;
  responseStatus?: number;
  error?: string;
  nextAttemptAt?: number;
}

/* -------------------------------------------------------------------------- */
/*                                  URLs                                      */
/* -------------------------------------------------------------------------- */

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const clean = ip.toLowerCase().split("%")[0]!;
  if (clean === "::" || clean === "::1") return true;
  if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) {
    return true;
  }
  if (clean.startsWith("fc") || clean.startsWith("fd")) return true;
  if (clean.startsWith("::ffff:")) return isPrivateIPv4(clean.slice("::ffff:".length));
  return false;
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIPv4(address);
  if (isIP(address) === 6) return isPrivateIPv6(address);
  return true;
}

/**
 * Validate a webhook target and reject internal/private destinations (SSRF).
 * Set WEBHOOK_ALLOW_PRIVATE=true for local development only.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Webhook 'url' is required");
  }
  if (raw.length > 2048) {
    throw new Error("Webhook URL is too long (max 2048 characters)");
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Webhook URL is not a valid absolute URL");
  }

  if (url.username || url.password) {
    throw new Error("Webhook URL must not contain credentials");
  }

  const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE === "true";
  const isHttps = url.protocol === "https:";
  const isHttp = url.protocol === "http:";

  if (!isHttps && !isHttp) {
    throw new Error("Webhook URL must use https:// (http:// is only allowed for local development)");
  }
  if (isHttp && !allowPrivate) {
    throw new Error("Webhook URL must use https://");
  }

  const hostname = url.hostname.toLowerCase();
  const blockedHosts = [
    "localhost",
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
  ];
  if (
    blockedHosts.includes(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  ) {
    if (!allowPrivate) throw new Error("Webhook URL must point to a public host");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname) && !allowPrivate) {
      throw new Error("Webhook URL must point to a public address");
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Webhook host could not be resolved");
  }

  if (!addresses.length) {
    throw new Error("Webhook host could not be resolved");
  }

  if (!allowPrivate) {
    for (const entry of addresses) {
      if (isPrivateAddress(entry.address)) {
        throw new Error("Webhook URL resolves to a private address");
      }
    }
  }

  return url;
}

/* -------------------------------------------------------------------------- */
/*                                CRUD                                        */
/* -------------------------------------------------------------------------- */

export async function createWebhook(input: {
  ownerPubkey: string;
  url: string;
  filters: unknown;
  description?: string | null;
}): Promise<WebhookRow & { filtersObject: NormalizedWebhookFilters }> {
  const ownerPubkey = input.ownerPubkey.trim().toLowerCase();
  const url = (await assertSafeWebhookUrl(input.url)).toString();
  const filters = normalizeFilters(input.filters);
  const db = getDb();

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(webhooks)
    .where(eq(webhooks.ownerPubkey, ownerPubkey));

  if (Number(existing) >= MAX_WEBHOOKS_PER_OWNER) {
    throw new Error(`Each key can register at most ${MAX_WEBHOOKS_PER_OWNER} webhooks`);
  }

  const now = Date.now();
  const [row] = await db
    .insert(webhooks)
    .values({
      id: randomUUID(),
      ownerPubkey,
      url,
      secret: `whsec_${randomBytes(24).toString("hex")}`,
      description: input.description?.trim() || null,
      filters,
      active: true,
      createdAt: now,
      updatedAt: now,
      lastDeliveryAt: null,
      failureCount: 0,
      disabledReason: null,
    })
    .returning();

  return { ...row!, filtersObject: filters };
}

export function serializeWebhook(webhook: WebhookRow, includeSecret = false) {
  return {
    id: webhook.id,
    url: webhook.url,
    description: webhook.description || null,
    filters: webhook.filters,
    active: Boolean(webhook.active),
    createdAt: Number(webhook.createdAt),
    updatedAt: Number(webhook.updatedAt),
    lastDeliveryAt: webhook.lastDeliveryAt ?? null,
    failureCount: webhook.failureCount || 0,
    disabledReason: webhook.disabledReason || null,
    ...(includeSecret ? { secret: webhook.secret } : {}),
  };
}

export async function listWebhooks(ownerPubkey: string): Promise<WebhookRow[]> {
  const owner = ownerPubkey.trim().toLowerCase();
  return getDb()
    .select()
    .from(webhooks)
    .where(eq(webhooks.ownerPubkey, owner))
    .orderBy(desc(webhooks.createdAt))
    .limit(50);
}

export async function getWebhook(webhookId: string): Promise<WebhookRow | null> {
  if (!webhookId) return null;
  const [row] = await getDb()
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .limit(1);
  return row ?? null;
}

export async function getWebhookForOwner(
  webhookId: string,
  ownerPubkey: string
): Promise<WebhookRow | null> {
  const webhook = await getWebhook(webhookId);
  if (!webhook) return null;
  if (webhook.ownerPubkey.toLowerCase() !== ownerPubkey.trim().toLowerCase()) {
    return null;
  }
  return webhook;
}

export async function updateWebhook(
  webhookId: string,
  ownerPubkey: string,
  patch: {
    url?: string;
    filters?: unknown;
    description?: string | null;
    active?: boolean;
  }
): Promise<WebhookRow> {
  const webhook = await getWebhookForOwner(webhookId, ownerPubkey);
  if (!webhook) throw new Error("Webhook not found");

  const data: Partial<typeof webhooks.$inferInsert> = { updatedAt: Date.now() };

  if (patch.url !== undefined) {
    data.url = (await assertSafeWebhookUrl(patch.url)).toString();
  }
  if (patch.filters !== undefined) {
    data.filters = normalizeFilters(patch.filters);
  }
  if (patch.description !== undefined) {
    data.description = patch.description?.trim() || null;
  }
  if (patch.active !== undefined) {
    data.active = Boolean(patch.active);
    if (patch.active) {
      data.failureCount = 0;
      data.disabledReason = null;
    }
  }

  const [row] = await getDb()
    .update(webhooks)
    .set(data)
    .where(eq(webhooks.id, webhookId))
    .returning();

  return row!;
}

export async function deleteWebhook(
  webhookId: string,
  ownerPubkey: string
): Promise<void> {
  const webhook = await getWebhookForOwner(webhookId, ownerPubkey);
  if (!webhook) throw new Error("Webhook not found");

  await getDb().transaction(async (tx) => {
    await tx
      .delete(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId));
    await tx.delete(webhooks).where(eq(webhooks.id, webhookId));
  });
}

export async function listDeliveries(
  webhookId: string,
  ownerPubkey: string,
  limit = 25
): Promise<DeliveryRow[]> {
  const webhook = await getWebhookForOwner(webhookId, ownerPubkey);
  if (!webhook) throw new Error("Webhook not found");

  return getDb()
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/* -------------------------------------------------------------------------- */
/*                              Event dispatch                                */
/* -------------------------------------------------------------------------- */

function runAfterResponse(fn: () => Promise<void>) {
  try {
    after(async () => {
      await fn();
    });
  } catch {
    // Not in a request scope (tests, scripts): run immediately.
    void fn();
  }
}

function createDeliveryTransition(
  webhook: WebhookRow,
  event: WebhookEvent,
  now: number
): DeliveryRow {
  const deliveryId = randomUUID();
  return {
    id: deliveryId,
    webhookId: webhook.id,
    ownerPubkey: webhook.ownerPubkey,
    event: event.type,
    payload: JSON.stringify({
      id: `evt_${deliveryId}`,
      type: event.type,
      createdAt: now,
      data: event.data,
    }),
    status: "pending",
    attempts: 0,
    responseStatus: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
    deliveredAt: null,
  };
}

async function enqueueDelivery(webhook: WebhookRow, event: WebhookEvent) {
  const now = Date.now();
  const delivery = createDeliveryTransition(webhook, event, now);

  await getDb().insert(webhookDeliveries).values(delivery);
  return delivery;
}

/**
 * Fan an event out to every matching active webhook.
 * Never throws: webhook plumbing must not break posting.
 */
export async function emitEvent(
  event: WebhookEvent,
  opts?: { origin?: string }
): Promise<{ matched: number; deliveryIds: string[]; error?: string }> {
  try {
    const origin = opts?.origin?.replace(/\/+$/, "") || "";
    if (event.data.post && origin && !event.data.post.url) {
      event.data.post.url = `${origin}/post/${event.data.post.id}`;
    }
    if (event.data.profile && origin && !event.data.profile.url) {
      event.data.profile.url = `${origin}/u/${event.data.profile.pubkey}`;
    }

    if (event.data.post && !event.data.post.profile && event.data.post.authorPubkey) {
      const [profile] = await getDb()
        .select()
        .from(profiles)
        .where(eq(profiles.pubkey, event.data.post.authorPubkey.toLowerCase()))
        .limit(1);
      if (profile) {
        event.data.post.profile = {
          name: profile.name,
          bio: profile.bio || null,
          avatar: profile.avatar || null,
        };
      }
    }

    const candidates = await getDb()
      .select()
      .from(webhooks)
      .where(eq(webhooks.active, true))
      .limit(500);

    const matched = candidates.filter((webhook) => {
      try {
        // Normalize on read so filters created before newer fields were added
        // (e.g. mentions) keep matching instead of silently failing.
        return matchesFilters(normalizeFilters(webhook.filters), event);
      } catch {
        return false;
      }
    });

    if (!matched.length) return { matched: 0, deliveryIds: [] };

    const deliveries = await Promise.all(
      matched.map((webhook) => enqueueDelivery(webhook, event))
    );

    runAfterResponse(async () => {
      await Promise.allSettled(
        deliveries.map((delivery) => attemptDelivery(delivery.id))
      );
    });

    return { matched: matched.length, deliveryIds: deliveries.map((d) => d.id) };
  } catch (error: any) {
    console.error("[webhooks] emitEvent failed:", error?.message || error);
    return { matched: 0, deliveryIds: [], error: error?.message || "emit failed" };
  }
}

/** Send a test event and wait for the delivery result. */
export async function sendTestEvent(
  webhookId: string,
  ownerPubkey: string
): Promise<DeliveryResult> {
  const webhook = await getWebhookForOwner(webhookId, ownerPubkey);
  if (!webhook) throw new Error("Webhook not found");

  const delivery = await enqueueDelivery(webhook, {
    type: "webhook.test" as WebhookEventType,
    data: {
      message: "This is a test event from Written.",
    },
  });

  return attemptDelivery(delivery.id);
}

/* -------------------------------------------------------------------------- */
/*                                Delivery                                    */
/* -------------------------------------------------------------------------- */

function nextAttemptDelay(attempts: number): number {
  const base = BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1)]!;
  return base + Math.floor(Math.random() * base * 0.2);
}

async function markDelivery(
  delivery: DeliveryRow,
  status: "pending" | "success" | "failed" | "skipped",
  fields: {
    responseStatus?: number;
    error?: string;
    nextAttemptAt?: number;
    deliveredAt?: number;
  }
) {
  const now = Date.now();
  await getDb()
    .update(webhookDeliveries)
    .set({
      status,
      updatedAt: now,
      nextAttemptAt: fields.nextAttemptAt ?? now,
      responseStatus: fields.responseStatus ?? null,
      error: fields.error ? fields.error.slice(0, 1000) : null,
      deliveredAt: fields.deliveredAt ?? null,
    })
    .where(eq(webhookDeliveries.id, delivery.id));
}

async function markWebhookFailure(webhook: WebhookRow, error: string) {
  const now = Date.now();
  const failureCount = (webhook.failureCount || 0) + 1;

  await getDb()
    .update(webhooks)
    .set({
      failureCount,
      lastDeliveryAt: now,
      updatedAt: now,
      ...(failureCount >= DISABLE_AFTER_FAILURES
        ? {
            active: false,
            disabledReason: `Auto-disabled after ${failureCount} consecutive delivery failures`,
          }
        : {}),
    })
    .where(eq(webhooks.id, webhook.id));

  console.warn(`[webhooks] delivery failed for ${webhook.id}: ${error}`);
}

export async function attemptDelivery(deliveryId: string): Promise<DeliveryResult> {
  const [delivery] = await getDb()
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) {
    return {
      ok: false,
      deliveryId,
      status: "failed",
      attempts: 0,
      error: "Delivery not found",
    };
  }

  const webhook = await getWebhook(delivery.webhookId);

  if (!webhook) {
    await markDelivery(delivery, "failed", { error: "Webhook no longer exists" }).catch(() => {});
    return {
      ok: false,
      deliveryId,
      status: "failed",
      attempts: delivery.attempts || 0,
      error: "Webhook no longer exists",
    };
  }

  if (!webhook.active) {
    await markDelivery(delivery, "skipped", { error: "Webhook is disabled" }).catch(() => {});
    return {
      ok: false,
      deliveryId,
      status: "skipped",
      attempts: delivery.attempts || 0,
      error: "Webhook is disabled",
    };
  }

  const attempts = (delivery.attempts || 0) + 1;
  let responseStatus: number | undefined;
  let error: string | undefined;

  try {
    const target = await assertSafeWebhookUrl(webhook.url);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(webhook.secret, timestamp, delivery.payload);

    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        "x-written-event": delivery.event,
        "x-written-delivery": delivery.id,
        "x-written-webhook": webhook.id,
        "x-written-attempt": String(attempts),
        "x-written-signature": signature,
      },
      body: delivery.payload,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    responseStatus = response.status;
    await response.text().catch(() => "");

    if (response.status >= 200 && response.status < 300) {
      const now = Date.now();
      await markDelivery(delivery, "success", {
        responseStatus,
        deliveredAt: now,
        nextAttemptAt: now,
      });
      await getDb()
        .update(webhooks)
        .set({
          failureCount: 0,
          lastDeliveryAt: now,
          updatedAt: now,
          disabledReason: null,
        })
        .where(eq(webhooks.id, webhook.id));
      return { ok: true, deliveryId, status: "success", attempts, responseStatus };
    }

    if (response.status >= 300 && response.status < 400) {
      error = `Endpoint returned a redirect (HTTP ${response.status}); redirects are not followed`;
    } else {
      error = `Endpoint responded with HTTP ${response.status}`;
    }
  } catch (err: any) {
    error = err?.message || "Delivery request failed";
  }

  const now = Date.now();
  const finalFailure = attempts >= MAX_DELIVERY_ATTEMPTS;
  const nextAttemptAt = finalFailure ? now : now + nextAttemptDelay(attempts);

  await markDelivery(delivery, finalFailure ? "failed" : "pending", {
    responseStatus,
    error,
    nextAttemptAt,
  }).catch((e) => console.error("[webhooks] could not update delivery:", e));

  await markWebhookFailure(webhook, error || "unknown error").catch((e) =>
    console.error("[webhooks] could not update webhook:", e)
  );

  return {
    ok: false,
    deliveryId,
    status: finalFailure ? "failed" : "pending",
    attempts,
    responseStatus,
    error,
    nextAttemptAt: finalFailure ? undefined : nextAttemptAt,
  };
}

/** Retry deliveries whose nextAttemptAt has passed. Used by the cron endpoint. */
export async function dispatchDueDeliveries(limit = 25): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  retrying: number;
}> {
  const now = Date.now();
  const due = await getDb()
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextAttemptAt, now)
      )
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  const results = await Promise.allSettled(
    due.map((delivery) => attemptDelivery(delivery.id))
  );

  const counts = { attempted: due.length, succeeded: 0, failed: 0, retrying: 0 };
  for (const result of results) {
    if (result.status !== "fulfilled") {
      counts.failed += 1;
      continue;
    }
    if (result.value.status === "success") counts.succeeded += 1;
    else if (result.value.status === "pending") counts.retrying += 1;
    else counts.failed += 1;
  }

  return counts;
}
