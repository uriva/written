"use client";

import React from "react";
import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils";
import { useIdentity } from "@/lib/useIdentity";
import { pubkeyToFriendlyName, getAuthorInitials } from "@/lib/nameGenerator";
import {
  MessageCircle,
  Pencil,
  CornerDownRight,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

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
  editHistory?: any[];
  profile?: {
    name?: string | null;
    bio?: string | null;
    avatar?: string | null;
  } | null;
  replies?: any[];
  parent?: any;
}

interface PostCardProps {
  post: PostItem;
  onReply?: (post: PostItem) => void;
  onEdit?: (post: PostItem) => void;
  onSelectTag?: (tag: string) => void;
  onViewAuthorProfile?: (pubkey: string) => void;
  onViewThread?: (post: PostItem) => void;
  isThreadView?: boolean;
}

export function PostCard({
  post,
  onReply,
  onEdit,
  onSelectTag,
  onViewAuthorProfile,
  onViewThread,
  isThreadView = false,
}: PostCardProps) {
  const { keypair } = useIdentity();

  const isSigned = Boolean(post.signed && post.authorPubkey);
  const isAuthor =
    isSigned &&
    keypair?.publicKey &&
    post.authorPubkey?.toLowerCase() === keypair.publicKey.toLowerCase();

  const repliesCount = post.replies?.length || 0;
  const isEdited = Boolean(post.updatedAt && post.updatedAt > post.createdAt);

  const displayName = isSigned
    ? post.profile?.name || pubkeyToFriendlyName(post.authorPubkey)
    : "Anonymous";

  const initials = isSigned
    ? getAuthorInitials(displayName)
    : "A";

  // Render content with interactive hashtags and links (including domains like uriv.me)
  const renderFormattedContent = (text: string) => {
    const tokenRegex = /(#[a-zA-Z0-9_\p{L}]+|https?:\/\/[^\s]+|www\.[^\s]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/gu;
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

      if (raw.startsWith("#")) {
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
      <div className="flex items-center justify-between pt-2.5 border-t border-neutral-100 dark:border-neutral-900 text-xs text-neutral-500">
        <div className="flex items-center gap-5">
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
              <MessageCircle className="w-4 h-4" />
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
    </article>
  );
}
