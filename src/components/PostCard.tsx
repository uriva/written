"use client";

import React from "react";
import { formatShortKey } from "@/lib/crypto";
import { formatTimeAgo } from "@/lib/utils";
import { useIdentity } from "@/lib/useIdentity";
import {
  MessageSquare,
  Edit2,
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
    ? post.profile?.name || `@${formatShortKey(post.authorPubkey)}`
    : "Anonymous";

  const initials = isSigned
    ? (post.profile?.name || post.authorPubkey || "U").slice(0, 2).toUpperCase()
    : "∅";

  // Render content with interactive hashtags and links
  const renderFormattedContent = (text: string) => {
    const tokenRegex = /(#[a-zA-Z0-9_\p{L}]+|https?:\/\/[^\s]+)/gu;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      if (matchStart > lastIndex) {
        parts.push(text.slice(lastIndex, matchStart));
      }

      const token = match[0];
      if (token.startsWith("#")) {
        const tagName = token.slice(1).toLowerCase();
        parts.push(
          <button
            key={`tag-${matchStart}`}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectTag) onSelectTag(tagName);
            }}
            className="font-mono text-black dark:text-white font-medium bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 hover:underline cursor-pointer transition-colors"
          >
            {token}
          </button>
        );
      } else if (token.startsWith("http")) {
        parts.push(
          <a
            key={`link-${matchStart}`}
            href={token}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-neutral-600 dark:text-neutral-400 underline underline-offset-2 hover:text-black dark:hover:text-white"
          >
            {token.length > 35 ? `${token.slice(0, 32)}…` : token}
          </a>
        );
      }

      lastIndex = matchEnd;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return (
    <article
      onClick={() => {
        if (!isThreadView && onViewThread) {
          onViewThread(post);
        }
      }}
      className={`border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 transition-all ${
        !isThreadView
          ? "hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer"
          : ""
      }`}
    >
      {/* Post Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
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
              className="w-7 h-7 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 flex items-center justify-center font-mono font-bold text-xs shrink-0 hover:opacity-80 transition-opacity"
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
              className="w-7 h-7 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-400 flex items-center justify-center font-mono text-xs shrink-0"
              title="Anonymous"
            >
              ∅
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
                className="font-medium text-sm text-black dark:text-white hover:underline truncate focus:outline-none flex items-center gap-1"
              >
                <span>{displayName}</span>
                <CheckCircle2
                  className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0"
                  aria-label="Signed author"
                />
              </button>
            ) : (
              <span className="text-sm text-neutral-500 font-medium">
                Anonymous
              </span>
            )}

            {/* Replying context */}
            {post.replyToId && (
              <span className="flex items-center gap-0.5 text-xs text-neutral-400">
                <CornerDownRight className="w-3 h-3" />
                <span>reply</span>
              </span>
            )}
          </div>
        </div>

        {/* Timestamp & Edited status */}
        <div className="flex items-center gap-1 text-xs text-neutral-400 shrink-0 font-mono">
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

      {/* Post Body */}
      <div className="text-sm font-sans text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap break-words leading-relaxed my-2">
        {renderFormattedContent(post.content)}
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-900 text-xs text-neutral-500">
        <div className="flex items-center gap-4">
          {onReply && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReply(post);
              }}
              className="flex items-center gap-1.5 hover:text-black dark:hover:text-white transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{repliesCount > 0 ? repliesCount : "Reply"}</span>
            </button>
          )}

          {isAuthor && onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(post);
              }}
              className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          )}
        </div>

        {!isThreadView && onViewThread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewThread(post);
            }}
            className="hover:text-black dark:hover:text-white transition-colors flex items-center gap-0.5"
          >
            <span>Thread</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
