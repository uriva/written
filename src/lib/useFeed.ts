"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PostItem } from "@/components/PostCard";

interface ApiPost {
  id: string;
  content: string;
  authorPubkey?: string | null;
  signed?: boolean;
  signature?: string | null;
  createdAt: number;
  updatedAt?: number | null;
  replyToId?: string | null;
  rootId?: string | null;
  tags?: string[] | null;
  mentions?: string[] | null;
  profile?: { name?: string | null; bio?: string | null; avatar?: string | null } | null;
  replies?: ApiPost[];
  repliesCount?: number;
  parent?: ApiPost | null;
}

export function mapApiPost(post: ApiPost): PostItem {
  return {
    id: post.id,
    content: post.content,
    authorPubkey: post.authorPubkey || null,
    signed: Boolean(post.signed),
    signature: post.signature || null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt || null,
    replyToId: post.replyToId || null,
    rootId: post.rootId || post.id,
    tags: Array.isArray(post.tags) ? post.tags : [],
    mentions: Array.isArray(post.mentions) ? post.mentions : [],
    profile: post.profile
      ? {
          name: post.profile.name || null,
          bio: post.profile.bio || null,
          avatar: post.profile.avatar || null,
        }
      : null,
    replies: (post.replies || []).map(mapApiPost),
    repliesCount: post.repliesCount ?? post.replies?.length ?? 0,
    parent: post.parent ? mapApiPost(post.parent) : null,
  };
}

const POLL_INTERVAL_MS = 5_000;

function useJsonPolling<T>(
  url: string | null,
  transform: (data: any) => T,
  intervalMs = POLL_INTERVAL_MS
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (quiet = false) => {
      if (!url) {
        setData(null);
        setIsLoading(false);
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestId = ++requestRef.current;

      if (!quiet) setIsLoading(true);

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || `Request failed (HTTP ${response.status})`);
        }
        if (requestId !== requestRef.current) return;

        setData(transform(payload));
        setError(null);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (requestId !== requestRef.current) return;
        if (!quiet) setError(err?.message || "Request failed");
      } finally {
        if (requestId === requestRef.current && !quiet) setIsLoading(false);
      }
    },
    [url, transform]
  );

  useEffect(() => {
    setData(null);
    setError(null);
    setIsLoading(true);
    void load(false);

    const interval = setInterval(() => void load(true), intervalMs);
    const onFocus = () => void load(true);
    const onVisibility = () => {
      if (!document.hidden) void load(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.abort();
    };
  }, [load, intervalMs]);

  return { data, isLoading, error, refresh: () => load(true) };
}

interface FeedPayload {
  posts: ApiPost[];
}

const feedTransform = (payload: FeedPayload): PostItem[] =>
  (payload.posts || []).map(mapApiPost);

export function useFeed(tag: string | null) {
  const params = new URLSearchParams({ limit: "100", topLevel: "true" });
  if (tag) params.set("tag", tag);
  const url = `/api/posts?${params.toString()}`;

  const { data, isLoading, error, refresh } = useJsonPolling<PostItem[]>(
    url,
    feedTransform
  );

  return { posts: data ?? [], isLoading, error, refresh };
}

interface ThreadPayload {
  post: PostItem | null;
  parent: PostItem | null;
  grandParent: PostItem | null;
}

const threadTransform = (payload: any): ThreadPayload => ({
  post: payload.post ? mapApiPost(payload.post) : null,
  parent: payload.parent ? mapApiPost(payload.parent) : null,
  grandParent: payload.grandParent ? mapApiPost(payload.grandParent) : null,
});

export function usePostThread(postId: string) {
  const url = `/api/posts/${encodeURIComponent(postId)}`;
  const { data, isLoading, error, refresh } = useJsonPolling<ThreadPayload>(
    url,
    threadTransform
  );

  return {
    post: data?.post ?? null,
    parent: data?.parent ?? null,
    grandParent: data?.grandParent ?? null,
    isLoading,
    error,
    refresh,
  };
}

const tagsTransform = (
  payload: any
): Array<{ id: string; name: string; postCount: number; updatedAt: number }> =>
  payload.tags || [];

export function useTags() {
  const url = "/api/tags";
  const { data, isLoading } = useJsonPolling<
    Array<{ id: string; name: string; postCount: number; updatedAt: number }>
  >(url, tagsTransform, 15_000);

  return { tags: data ?? [], isLoading };
}
