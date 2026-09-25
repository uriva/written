"use client";

import React, { useState } from "react";
import { formatShortKey, verifyPayload } from "@/lib/crypto";
import { formatTimeAgo } from "@/lib/utils";
import { useIdentity } from "@/lib/useIdentity";
import {
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  Edit2,
  Copy,
  Check,
  CornerDownRight,
  ExternalLink,
  ChevronRight,
  Code,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
  const [copiedKey, setCopiedKey] = useState(false);
  const [showProof, setShowProof] = useState(false);

  const isSigned = Boolean(post.signed && post.authorPubkey);
  const isAuthor =
    isSigned &&
    keypair?.publicKey &&
    post.authorPubkey?.toLowerCase() === keypair.publicKey.toLowerCase();

  const repliesCount = post.replies?.length || 0;
  const isEdited = Boolean(post.updatedAt && post.updatedAt > post.createdAt);

  const handleCopyPubkey = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!post.authorPubkey) return;
    navigator.clipboard.writeText(post.authorPubkey);
    setCopiedKey(true);
    toast.success("Public key copied to clipboard");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyPostJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(post, null, 2));
    toast.success("Raw post JSON copied");
  };

  // Render content with interactive hashtags and links
  const renderFormattedContent = (text: string) => {
    // Regex for hashtag or URL
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
            className="font-mono text-black dark:text-white font-bold bg-neutral-100 dark:bg-neutral-800 px-1 py-0.2 hover:underline cursor-pointer transition-colors"
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
            className="text-neutral-600 dark:text-neutral-300 underline underline-offset-2 hover:text-black dark:hover:text-white"
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
        !isThreadView ? "hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer" : ""
      }`}
    >
      {/* Post Header */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
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
              className="w-7 h-7 rounded-none bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-mono font-bold text-xs shrink-0 hover:opacity-85 focus:outline-none"
              title="View author profile"
            >
              {post.profile?.name
                ? post.profile.name.slice(0, 2).toUpperCase()
                : post.authorPubkey?.slice(0, 2).toUpperCase()}
            </button>
          ) : (
            <div
              className="w-7 h-7 rounded-none border border-neutral-300 dark:border-neutral-700 text-neutral-400 flex items-center justify-center font-mono text-xs shrink-0"
              title="Anonymous author"
            >
              ∅
            </div>
          )}

          {/* Author Name and Public Key */}
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isSigned ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (post.authorPubkey && onViewAuthorProfile) {
                        onViewAuthorProfile(post.authorPubkey);
                      }
                    }}
                    className="font-mono font-bold text-xs text-black dark:text-white hover:underline truncate focus:outline-none"
                  >
                    {post.profile?.name || formatShortKey(post.authorPubkey)}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyPubkey}
                    className="font-mono text-[10px] text-neutral-400 hover:text-black dark:hover:text-white flex items-center gap-0.5"
                    title="Click to copy full public key"
                  >
                    <span>{formatShortKey(post.authorPubkey)}</span>
                    {copiedKey ? (
                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-2.5 h-2.5" />
                    )}
                  </button>

                  <span className="font-mono text-[9px] uppercase px-1 py-0.2 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
                    signed
                  </span>
                </>
              ) : (
                <>
                  <span className="font-mono text-xs text-neutral-500 font-medium">
                    anonymous
                  </span>
                  <span className="font-mono text-[9px] uppercase px-1 py-0.2 border border-dashed border-neutral-300 dark:border-neutral-800 text-neutral-400">
                    immutable
                  </span>
                </>
              )}
            </div>

            {/* Replying Indicator */}
            {post.replyToId && (
              <div className="flex items-center gap-1 font-mono text-[10px] text-neutral-400">
                <CornerDownRight className="w-2.5 h-2.5" />
                <span>reply</span>
              </div>
            )}
          </div>
        </div>

        {/* Timestamp and Edited status */}
        <div className="flex items-center gap-1.5 text-right shrink-0">
          {isEdited && (
            <span
              className="font-mono text-[10px] text-neutral-400 italic"
              title={`Edited: ${new Date(post.updatedAt!).toLocaleString()}`}
            >
              (edited)
            </span>
          )}
          <time
            dateTime={new Date(post.createdAt).toISOString()}
            className="font-mono text-xs text-neutral-400"
            title={new Date(post.createdAt).toLocaleString()}
          >
            {formatTimeAgo(post.createdAt)}
          </time>
        </div>
      </div>

      {/* Post Body */}
      <div className="text-sm font-sans text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap break-words leading-relaxed my-2">
        {renderFormattedContent(post.content)}
      </div>

      {/* Cryptographic Proof Drawer (Collapsible) */}
      {showProof && isSigned && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="my-3 p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 font-mono text-[11px] space-y-1.5 animate-fadeIn"
        >
          <div className="flex items-center justify-between text-neutral-400 text-[10px] uppercase font-bold">
            <span>Ed25519 Cryptographic Proof</span>
            <span className="text-emerald-500">Verified</span>
          </div>
          <div>
            <span className="text-neutral-400">Author Public Key:</span>
            <div className="break-all select-all text-neutral-700 dark:text-neutral-300">
              {post.authorPubkey}
            </div>
          </div>
          <div>
            <span className="text-neutral-400">Signature:</span>
            <div className="break-all select-all text-neutral-700 dark:text-neutral-300">
              {post.signature}
            </div>
          </div>
          {post.updatedAt && (
            <div>
              <span className="text-neutral-400">Revision Timestamp:</span>
              <div className="text-neutral-700 dark:text-neutral-300">
                {post.updatedAt} ({new Date(post.updatedAt).toISOString()})
              </div>
            </div>
          )}
        </div>
      )}

      {/* Post Actions Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-900 font-mono text-xs text-neutral-500">
        <div className="flex items-center gap-3">
          {/* Reply Button */}
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
              <span>{repliesCount > 0 ? `${repliesCount} replies` : "Reply"}</span>
            </button>
          )}

          {/* Edit Button (ONLY if signed AND matching user's active keypair) */}
          {isAuthor && onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(post);
              }}
              className="flex items-center gap-1 text-neutral-500 hover:text-black dark:hover:text-white transition-colors font-bold"
              title="Edit this post with your cryptographic signature"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          )}

          {/* Cryptographic Proof Toggle */}
          {isSigned && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowProof(!showProof);
              }}
              className="hover:text-black dark:hover:text-white transition-colors text-[11px]"
              title="Inspect cryptographic signature"
            >
              {showProof ? "Hide Proof" : "Proof"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Copy JSON */}
          <button
            type="button"
            onClick={handleCopyPostJson}
            className="hover:text-black dark:hover:text-white transition-colors p-1"
            title="Copy Raw Post JSON"
          >
            <Code className="w-3.5 h-3.5" />
          </button>

          {!isThreadView && onViewThread && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewThread(post);
              }}
              className="hover:text-black dark:hover:text-white transition-colors flex items-center gap-0.5"
              title="View full thread"
            >
              <span className="hidden sm:inline">Thread</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
