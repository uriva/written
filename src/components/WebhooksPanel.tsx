"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Plus,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIdentity } from "@/lib/useIdentity";
import {
  buildWebhookCanonicalMessage,
  formatShortKey,
  signPayload,
} from "@/lib/crypto";

interface WebhookFilters {
  keywords?: string[];
  tags?: string[];
  authors?: string[];
  replyToId?: string;
  rootId?: string;
}

interface WebhookView {
  id: string;
  url: string;
  description?: string | null;
  filters: WebhookFilters | null;
  active: boolean;
  createdAt: number;
  failureCount?: number;
  disabledReason?: string | null;
  secret?: string;
}

interface DeliveryResult {
  ok: boolean;
  status: string;
  attempts: number;
  responseStatus?: number;
  error?: string;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function WebhooksPanel() {
  const { keypair } = useIdentity();
  const [webhooks, setWebhooks] = useState<WebhookView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [tags, setTags] = useState("");
  const [authors, setAuthors] = useState("");

  const publicKey = keypair?.publicKey;

  const signedCredentials = useCallback(
    (action: string, target: string) => {
      if (!keypair) throw new Error("Generate a keypair first");
      const timestamp = Date.now();
      const signature = signPayload(
        buildWebhookCanonicalMessage({ action, target, timestamp }),
        keypair.privateKey
      );
      return { pubkey: keypair.publicKey, signature, timestamp };
    },
    [keypair]
  );

  const loadWebhooks = useCallback(async () => {
    if (!publicKey) return;
    setIsLoading(true);
    try {
      const credentials = signedCredentials("list", publicKey);
      const params = new URLSearchParams({ pubkey: publicKey });
      const res = await fetch(`/api/webhooks?${params.toString()}`, {
        headers: {
          "x-written-pubkey": credentials.pubkey,
          "x-written-signature": credentials.signature,
          "x-written-timestamp": String(credentials.timestamp),
        },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not load webhooks");
      setWebhooks(data.webhooks || []);
    } catch (error: any) {
      toast.error(error.message || "Could not load webhooks");
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signedCredentials]);

  useEffect(() => {
    if (publicKey) void loadWebhooks();
  }, [publicKey, loadWebhooks]);

  const createWebhook = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanUrl = url.trim();
    if (!isWebhookUrl(cleanUrl)) {
      toast.error("Enter a valid https:// URL (http://localhost is allowed in development)");
      return;
    }

    const filters: WebhookFilters = {
      keywords: splitList(keywords),
      tags: splitList(tags),
      authors: splitList(authors),
    };
    if (
      !filters.keywords?.length &&
      !filters.tags?.length &&
      !filters.authors?.length
    ) {
      toast.error("Add at least one keyword, tag, or author to filter on");
      return;
    }

    setIsCreating(true);
    try {
      const credentials = signedCredentials("create", cleanUrl);
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl,
          description: description.trim() || undefined,
          filters,
          ...credentials,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not create webhook");

      toast.success("Webhook created");
      setUrl("");
      setDescription("");
      setKeywords("");
      setTags("");
      setAuthors("");
      setShowForm(false);
      setRevealedSecrets((current) => ({ ...current, [data.webhook.id]: true }));
      await loadWebhooks();
    } catch (error: any) {
      toast.error(error.message || "Could not create webhook");
    } finally {
      setIsCreating(false);
    }
  };

  const toggleWebhook = async (webhook: WebhookView) => {
    setBusyId(webhook.id);
    try {
      const credentials = signedCredentials("update", webhook.id);
      const res = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !webhook.active, ...credentials }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not update webhook");
      setWebhooks((current) =>
        current.map((entry) => (entry.id === webhook.id ? { ...entry, ...data.webhook } : entry))
      );
      toast.success(webhook.active ? "Webhook paused" : "Webhook resumed");
    } catch (error: any) {
      toast.error(error.message || "Could not update webhook");
    } finally {
      setBusyId(null);
    }
  };

  const testWebhook = async (webhook: WebhookView) => {
    setBusyId(webhook.id);
    try {
      const credentials = signedCredentials("test", webhook.id);
      const res = await fetch(`/api/webhooks/${webhook.id}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const result: DeliveryResult | undefined = data.result;
        throw new Error(
          result?.error ||
            data.error ||
            "Test delivery failed. Check the endpoint responds with 2xx."
        );
      }
      toast.success("Test event delivered (HTTP 2xx)");
      await loadWebhooks();
    } catch (error: any) {
      toast.error(error.message || "Test delivery failed");
    } finally {
      setBusyId(null);
    }
  };

  const deleteWebhook = async (webhook: WebhookView) => {
    if (!confirm(`Delete the webhook for ${webhook.url}?`)) return;
    setBusyId(webhook.id);
    try {
      const credentials = signedCredentials("delete", webhook.id);
      const res = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "DELETE",
        headers: {
          "x-written-pubkey": credentials.pubkey,
          "x-written-signature": credentials.signature,
          "x-written-timestamp": String(credentials.timestamp),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not delete webhook");
      setWebhooks((current) => current.filter((entry) => entry.id !== webhook.id));
      toast.success("Webhook deleted");
    } catch (error: any) {
      toast.error(error.message || "Could not delete webhook");
    } finally {
      setBusyId(null);
    }
  };

  const copySecret = async (webhook: WebhookView) => {
    if (!webhook.secret) return;
    await navigator.clipboard.writeText(webhook.secret);
    setCopiedId(webhook.id);
    toast.success("Signing secret copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filterSummary = useMemo(
    () =>
      (webhook: WebhookView) => {
        const filters = webhook.filters || {};
        const parts: string[] = [];
        if (filters.keywords?.length) {
          parts.push(filters.keywords.map((keyword) => `"${keyword}"`).join(" or "));
        }
        if (filters.tags?.length) {
          parts.push(filters.tags.map((tag) => `#${tag}`).join(" or "));
        }
        if (filters.authors?.length) {
          parts.push(filters.authors.map((author) => formatShortKey(author)).join(" or "));
        }
        if (filters.replyToId) parts.push(`reply to ${filters.replyToId.slice(0, 8)}…`);
        if (filters.rootId) parts.push(`thread ${filters.rootId.slice(0, 8)}…`);
        return parts.join(" · ") || "no filters";
      },
    []
  );

  if (!keypair) {
    return (
      <p className="text-xs text-neutral-500">
        Generate or import a keypair to register webhooks.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500 leading-normal flex-1 pr-3">
          Receive an HMAC-signed POST when a post matches keywords, hashtags, or a
          specific author. Signed with {formatShortKey(keypair.publicKey)}.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowForm((value) => !value)}
          className="h-7 px-2 font-mono text-[11px] rounded-none hover:bg-neutral-100 dark:hover:bg-neutral-900 shrink-0"
        >
          <Plus className="w-3 h-3 mr-1" />
          {showForm ? "Close" : "New"}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={createWebhook}
          className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 space-y-2"
        >
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/written-hook"
            className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 font-mono text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder="keywords: ai, agent"
              className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
            />
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="tags: ai, agents"
              className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
            />
            <input
              value={authors}
              onChange={(event) => setAuthors(event.target.value)}
              placeholder="author pubkey(s)"
              className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
            />
          </div>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="description (optional)"
            maxLength={200}
            className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-neutral-400">
              Filters are ANDed across fields. Comma-separate values.
            </span>
            <Button
              type="submit"
              disabled={isCreating}
              className="rounded-none text-xs h-7 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 shrink-0"
            >
              {isCreating ? "Creating..." : "Create webhook"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-neutral-500 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading webhooks...
        </div>
      ) : webhooks.length === 0 ? (
        <p className="text-xs text-neutral-400 py-1">No webhooks registered yet.</p>
      ) : (
        <ul className="space-y-2">
          {webhooks.map((webhook) => (
            <li
              key={webhook.id}
              className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono break-all">{webhook.url}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {filterSummary(webhook)}
                  </p>
                </div>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 border shrink-0 ${
                    webhook.active
                      ? "border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
                  }`}
                >
                  {webhook.active ? "active" : "paused"}
                </span>
              </div>

              {webhook.disabledReason && (
                <p className="text-[11px] text-red-500">{webhook.disabledReason}</p>
              )}

              {webhook.secret && (
                <div className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2 py-1.5">
                  <WebhookIcon className="w-3 h-3 text-neutral-400 shrink-0" />
                  <code className="font-mono text-[10px] truncate flex-1">
                    {revealedSecrets[webhook.id]
                      ? webhook.secret
                      : "whsec_••••••••••••••••"}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedSecrets((current) => ({
                        ...current,
                        [webhook.id]: !current[webhook.id],
                      }))
                    }
                    className="text-neutral-400 hover:text-black dark:hover:text-white"
                    title="Toggle secret"
                  >
                    {revealedSecrets[webhook.id] ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copySecret(webhook)}
                    className="text-neutral-400 hover:text-black dark:hover:text-white"
                    title="Copy secret"
                  >
                    {copiedId === webhook.id ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void testWebhook(webhook)}
                  disabled={busyId === webhook.id}
                  className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-black dark:hover:text-white disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => void toggleWebhook(webhook)}
                  disabled={busyId === webhook.id}
                  className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-black dark:hover:text-white disabled:opacity-50"
                >
                  {webhook.active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteWebhook(webhook)}
                  disabled={busyId === webhook.id}
                  className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-red-500 disabled:opacity-50 ml-auto"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-neutral-400 leading-normal">
        Deliveries include X-Written-Signature: t=&lt;unix&gt;,v1=&lt;HMAC-SHA256&gt;.
        See /llms.txt for a verification snippet.
      </p>
    </div>
  );
}
