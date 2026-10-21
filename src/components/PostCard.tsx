"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils";
import { useIdentity } from "@/lib/useIdentity";
import {
  buildStanceCanonicalMessage,
  buildVoteCanonicalMessage,
  signPayload,
} from "@/lib/crypto";
import { pubkeyToFriendlyName, getAuthorInitials } from "@/lib/nameGenerator";
import { MENTION_REGEX_SOURCE, formatMention } from "@/lib/mentions";
import {
  MessageCircle,
  Pencil,
  CornerDownRight,
  ChevronRight,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";

export interface PostItem {
  id: string;
  content: string;
  authorPubkey?: string | null;
  signature?: string | null;
  signed: boolean;
  createdAt: number;
  updatedAt?: number | null;
  replyToId?: string | null;
  rootId?: string | null;
  tags?: string[];
  mentions?: string[];
  editHistory?: any[];
  profile?: {
    name?: string | null;
    bio?: string | null;
    avatar?: string | null;
  } | null;
  replies?: any[];
  repliesCount?: number;
  parent?: any;
  viewerVote?: 1 | -1 | 0;
  likenessScore?: number;
  supportCount?: number;
  objectCount?: number;
  viewerStance?: "support" | "object" | null;
  supporters?: Array<{ pubkey: string; name: string | null }>;
  objectors?: Array<{ pubkey: string; name: string | null }>;
}

interface PostCardProps {
  post: PostItem;
  onReply?: (post: PostItem) => void;
  onEdit?: (post: PostItem) => void;
  onSelectTag?: (tag: string) => void;
  onViewAuthorProfile?: (pubkey: string) => void;
  onViewThread?: (post: PostItem) => void;
  onVoteChange?: () => void;
  isThreadView?: boolean;
}

export function PostCard({
  post,
  onReply,
  onEdit,
  onSelectTag,
  onViewAuthorProfile,
  onViewThread,
  onVoteChange,
  isThreadView = false,
}: PostCardProps) {
  const { keypair } = useIdentity();
  const [localVote, setLocalVote] = useState<1 | -1 | 0 | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  const [localStance, setLocalStance] = useState<"support" | "object" | "none" | null>(
    null
  );
  const [isStancing, setIsStancing] = useState(false);

  const effectiveVote: 1 | -1 | 0 = localVote ?? post.viewerVote ?? 0;
  const effectiveStance: "support" | "object" | null =
    localStance === "none"
      ? null
      : localStance ?? post.viewerStance ?? null;

  const baseSupport =
    (post.supportCount ?? 0) - (post.viewerStance === "support" ? 1 : 0);
  const baseObject =
    (post.objectCount ?? 0) - (post.viewerStance === "object" ? 1 : 0);
  const supportCount = Math.max(
    0,
    baseSupport + (effectiveStance === "support" ? 1 : 0)
  );
  const objectCount = Math.max(
    0,
    baseObject + (effectiveStance === "object" ? 1 : 0)
  );

  const handleVote = async (target: 1 | -1) => {
    if (!keypair) {
      toast.error("Generate or import a key in Settings to tune your feed");
      return;
    }
    if (isVoting) return;

    const current = effectiveVote;
    const nextValue: -1 | 0 | 1 = current === target ? 0 : target;

    setLocalVote(nextValue);
    setIsVoting(true);

    try {
      const updatedAt = Date.now();
      const canonical = buildVoteCanonicalMessage({
        postId: post.id,
        value: nextValue,
        updatedAt,
      });
      const signature = signPayload(canonical, keypair.privateKey);
      const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voterPubkey: keypair.publicKey,
          value: nextValue,
          updatedAt,
          signature,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Vote failed");
      }
      onVoteChange?.();
    } catch (err: any) {
      setLocalVote(current);
      toast.error(err?.message || "Failed to submit vote");
    } finally {
      setIsVoting(false);
    }
  };

  const handleStance = async (target: "support" | "object") => {
    if (!keypair) {
      toast.error("Generate or import a key in Settings to sign a public stance");
      return;
    }
    if (isStancing) return;

    const current = effectiveStance;
    const nextStance: "support" | "object" | "none" =
      current === target ? "none" : target;

    setLocalStance(nextStance);
    setIsStancing(true);

    try {
      const updatedAt = Date.now();
      const canonical = buildStanceCanonicalMessage({
        postId: post.id,
        stance: nextStance,
        updatedAt,
      });
      const signature = signPayload(canonical, keypair.privateKey);
      const res = await fetch(
        `/api/posts/${encodeURIComponent(post.id)}/stance`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            voterPubkey: keypair.publicKey,
            stance: nextStance,
            updatedAt,
            signature,
          }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Stance failed");
      }
      onVoteChange?.();
    } catch (err: any) {
      setLocalStance(current ?? "none");
      toast.error(err?.message || "Failed to submit public stance");
    } finally {
      setIsStancing(false);
    }
  };

  const isSigned = Boolean(post.signed && post.authorPubkey);
  const isAuthor =
    isSigned &&
    keypair?.publicKey &&
    post.authorPubkey?.toLowerCase() === keypair.publicKey.toLowerCase();

  const repliesCount = post.repliesCount ?? post.replies?.length ?? 0;
  const isEdited = Boolean(post.updatedAt && post.updatedAt > post.createdAt);

  const displayName = isSigned
    ? post.profile?.name || pubkeyToFriendlyName(post.authorPubkey)
    : "Anonymous";

  const initials = isSigned
    ? getAuthorInitials(displayName)
    : "A";

  // Render content with interactive hashtags and links (including domains like uriv.me)
  const renderFormattedContent = (text: string) => {
    const tokenRegex = new RegExp(
      `(${MENTION_REGEX_SOURCE}|#[a-zA-Z0-9_\\p{L}]+|https?:\\/\\/[^\\s]+|www\\.[^\\s]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}(?:\\/[^\\s]*)?)`,
      "gu"
    );
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      const matchStart = match.index;
      let raw = match[0];
      let trailing = "";

      // Strip trailing punctuation if it's not a hashtag
      if (!raw.startsWith("#")) {
        const trailMatch = raw.match(/[.,;:!?)]+$/);
        if (trailMatch) {
          trailing = trailMatch[0];
          raw = raw.slice(0, -trailing.length);
        }
      }

      if (matchStart > lastIndex) {
        parts.push(text.slice(lastIndex, matchStart));
      }

      if (raw.startsWith("@")) {
        const pubkey = raw.slice(1).toLowerCase();
        parts.push(
          <Link
            key={`mention-${matchStart}`}
            href={`/u/${pubkey}`}
            onClick={(e) => e.stopPropagation()}
            title={pubkey}
            className="text-neutral-700 dark:text-neutral-300 font-mono underline underline-offset-2 hover:text-black dark:hover:text-white"
          >
            {formatMention(pubkey)}
          </Link>
        );
      } else if (raw.startsWith("#")) {
        const tagName = raw.slice(1).toLowerCase();
        parts.push(
          <button
            key={`tag-${matchStart}`}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectTag) onSelectTag(tagName);
            }}
            className="text-neutral-900 dark:text-neutral-100 font-semibold hover:underline cursor-pointer"
          >
            {raw}
          </button>
        );
      } else {
        let href = raw;
        if (!href.startsWith("http://") && !href.startsWith("https://")) {
          href = "https://" + href;
        }
        parts.push(
          <a
            key={`link-${matchStart}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-neutral-600 dark:text-neutral-400 underline underline-offset-2 hover:text-black dark:hover:text-white"
          >
            {raw.length > 35 ? `${raw.slice(0, 32)}…` : raw}
          </a>
        );
      }

      if (trailing) {
        parts.push(trailing);
      }

      lastIndex = matchStart + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return (
    <article
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!isThreadView && !target.closest("button") && !target.closest("a")) {
          if (onViewThread) {
            onViewThread(post);
          }
        }
      }}
      className={`border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 transition-all ${
        !isThreadView
          ? "hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer"
          : ""
      }`}
    >
      {/* Post Header */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar */}
          {isSigned ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (post.authorPubkey && onViewAuthorProfile) {
                  onViewAuthorProfile(post.authorPubkey);
                }
              }}
              className="w-8 h-8 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 flex items-center justify-center font-semibold text-xs shrink-0 hover:opacity-85 transition-opacity"
              title="View profile"
            >
              {post.profile?.avatar ? (
                <img
                  src={post.profile.avatar}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </button>
          ) : (
            <div
              className="w-8 h-8 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-400 flex items-center justify-center text-xs shrink-0 font-medium"
              title="Anonymous"
            >
              A
            </div>
          )}

          {/* Author Name */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isSigned ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (post.authorPubkey && onViewAuthorProfile) {
                    onViewAuthorProfile(post.authorPubkey);
                  }
                }}
                className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-100 hover:underline truncate focus:outline-none flex items-center gap-1"
              >
                <span>{displayName}</span>
                <CheckCircle2
                  className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0"
                  aria-label="Verified sign"
                />
              </button>
            ) : (
              <span className="font-semibold text-[15px] text-neutral-500">
                Anonymous
              </span>
            )}

            {/* Replying context */}
            {post.replyToId && (
              <span className="text-neutral-400" title="Reply">
                <CornerDownRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>

        {/* Timestamp & Edited status */}
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 shrink-0">
          {isEdited && (
            <span
              className="italic text-neutral-400"
              title={`Edited: ${new Date(post.updatedAt!).toLocaleString()}`}
            >
              (edited)
            </span>
          )}
          <time dateTime={new Date(post.createdAt).toISOString()}>
            {formatTimeAgo(post.createdAt)}
          </time>
        </div>
      </div>

      {/* Post Body - Large, highly legible, readable */}
      <div className="text-[15px] sm:text-base text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap break-words leading-relaxed my-2">
        {renderFormattedContent(post.content)}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 pt-2.5 border-t border-neutral-100 dark:border-neutral-900 text-xs text-neutral-500">
        <div className="flex flex-wrap items-center gap-3">
          {/* Private Curation: More / Less like this */}
          <div
            className="inline-flex items-center border border-neutral-200 dark:border-neutral-800 divide-x divide-neutral-200 dark:divide-neutral-800"
            title="Private feed curation: only your own choice is visible to you; used for signed random-walk ranking"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleVote(1);
              }}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] transition-colors ${
                effectiveVote === 1
                  ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
              }`}
              title="Private: show me more like this"
            >
              <ArrowUp className="w-3 h-3" />
              <span>More like this</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleVote(-1);
              }}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] transition-colors ${
                effectiveVote === -1
                  ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
              }`}
              title="Private: show me less like this"
            >
              <ArrowDown className="w-3 h-3" />
              <span>Less like this</span>
            </button>
          </div>

          {onReply && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReply(post);
              }}
              className="flex items-center gap-1.5 hover:text-black dark:hover:text-white transition-colors"
              title="Reply"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {repliesCount > 0 && <span className="text-xs">{repliesCount}</span>}
            </button>
          )}

          {isAuthor && onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(post);
              }}
              className="flex items-center hover:text-black dark:hover:text-white transition-colors"
              title="Edit post"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Less prominent Public Stance: Express support / Express objection */}
        <div className="flex items-center gap-2.5 ml-auto">
          <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-400">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleStance("support");
              }}
              className={`transition-colors ${
                effectiveStance === "support"
                  ? "text-emerald-600 dark:text-emerald-400 font-semibold underline underline-offset-2"
                  : "hover:text-neutral-700 dark:hover:text-neutral-200"
              }`}
              title={
                post.supporters && post.supporters.length > 0
                  ? `Publicly supported by: ${post.supporters
                      .map((s) => s.name || pubkeyToFriendlyName(s.pubkey))
                      .join(", ")}`
                  : "Publicly sign support with your key (visible to everyone)"
              }
            >
              express support{supportCount > 0 ? ` (${supportCount})` : ""}
            </button>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleStance("object");
              }}
              className={`transition-colors ${
                effectiveStance === "object"
                  ? "text-rose-600 dark:text-rose-400 font-semibold underline underline-offset-2"
                  : "hover:text-neutral-700 dark:hover:text-neutral-200"
              }`}
              title={
                post.objectors && post.objectors.length > 0
                  ? `Publicly objected by: ${post.objectors
                      .map((s) => s.name || pubkeyToFriendlyName(s.pubkey))
                      .join(", ")}`
                  : "Publicly sign objection with your key (visible to everyone)"
              }
            >
              express objection{objectCount > 0 ? ` (${objectCount})` : ""}
            </button>
          </div>

          {!isThreadView && (
            <Link
              href={`/post/${post.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-black dark:hover:text-white transition-colors p-1"
              title="View thread"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
