"use client";

import React, { useState, useRef, useEffect } from "react";
import { useIdentity } from "@/lib/useIdentity";
import {
  buildPostCanonicalMessage,
  extractHashtags,
  formatShortKey,
  signPayload,
} from "@/lib/crypto";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Shield, ShieldAlert, Sparkles, Send, X, CornerDownRight } from "lucide-react";

interface ComposerProps {
  replyToPost?: {
    id: string;
    content: string;
    authorPubkey?: string | null;
    profileName?: string | null;
  } | null;
  onCancelReply?: () => void;
  onPostSuccess?: (postId: string) => void;
  autoFocus?: boolean;
}

export function Composer({
  replyToPost,
  onCancelReply,
  onPostSuccess,
  autoFocus = false,
}: ComposerProps) {
  const { keypair, isSignedMode, setIsSignedMode, profileName } = useIdentity();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const detectedTags = extractHashtags(content);
  const charLimit = 2000;
  const charsRemaining = charLimit - content.length;

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus, replyToPost]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Write something before publishing");
      return;
    }
    if (trimmed.length > charLimit) {
      toast.error(`Exceeded maximum limit of ${charLimit} characters`);
      return;
    }

    setIsSubmitting(true);
    try {
      const createdAt = Date.now();
      const replyToId = replyToPost?.id || null;

      let authorPubkey: string | null = null;
      let signature: string | null = null;

      if (isSignedMode) {
        if (!keypair) {
          throw new Error("No cryptographic keypair found. Please generate or import one.");
        }
        authorPubkey = keypair.publicKey;
        const canonicalMsg = buildPostCanonicalMessage({
          content: trimmed,
          createdAt,
          replyToId,
        });
        signature = signPayload(canonicalMsg, keypair.privateKey);
      }

      // Submit via API endpoint (ensures canonical signature check & tag indexing)
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          authorPubkey,
          signature,
          createdAt,
          replyToId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to publish post");
      }

      setContent("");
      if (replyToPost && onCancelReply) {
        onCancelReply();
      }

      toast.success(
        isSignedMode ? "Published signed post" : "Published anonymous post"
      );

      if (onPostSuccess) {
        onPostSuccess(data.post.id);
      }
    } catch (err: any) {
      toast.error(err.message || "Could not publish");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 mb-6 shadow-xs">
      {/* Reply Banner */}
      {replyToPost && (
        <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-neutral-100 dark:border-neutral-900 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-neutral-500 truncate">
            <CornerDownRight className="w-3.5 h-3.5 shrink-0" />
            <span>Replying to</span>
            <span className="font-bold text-black dark:text-white truncate">
              {replyToPost.profileName ||
                formatShortKey(replyToPost.authorPubkey)}
            </span>
            <span className="text-neutral-400 truncate max-w-[200px]">
              &ldquo;{replyToPost.content.slice(0, 40)}...&rdquo;
            </span>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              className="text-neutral-400 hover:text-black dark:hover:text-white font-mono"
              title="Cancel reply"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Composer Input */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            replyToPost
              ? "Write your reply... (use #hashtags freely)"
              : "What is on your mind? Write freely... (use #hashtags to index)"
          }
          className="w-full bg-transparent border-0 resize-none focus:outline-none text-black dark:text-white placeholder:text-neutral-400 text-base leading-relaxed min-h-[90px]"
          rows={3}
        />
      </div>

      {/* Detected Hashtags Preview */}
      {detectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3 pt-1">
          <span className="font-mono text-[10px] uppercase text-neutral-400">
            tags:
          </span>
          {detectedTags.map((t) => (
            <span
              key={t}
              className="font-mono text-xs px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-900 text-black dark:text-white border border-neutral-200 dark:border-neutral-800"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Composer Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-900">
        {/* Signature Toggle Mode */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSignedMode(!isSignedMode)}
            className={`font-mono text-xs px-2 py-1 flex items-center gap-1.5 border transition-all ${
              isSignedMode
                ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white font-medium"
                : "bg-transparent text-neutral-500 border-neutral-300 dark:border-neutral-800 hover:text-black dark:hover:text-white"
            }`}
          >
            {isSignedMode ? (
              <>
                <Shield className="w-3.5 h-3.5" />
                <span>Signed ({profileName || formatShortKey(keypair?.publicKey)})</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Unsigned (Anonymous)</span>
              </>
            )}
          </button>

          <span className="hidden sm:inline font-mono text-[10px] text-neutral-400">
            {isSignedMode ? "• Editable by you" : "• Immutable forever"}
          </span>
        </div>

        {/* Counter and Submit Button */}
        <div className="flex items-center gap-3">
          <span
            className={`font-mono text-xs ${
              charsRemaining < 50
                ? "text-red-500 font-bold"
                : "text-neutral-400"
            }`}
          >
            {charsRemaining}
          </span>

          <Button
            onClick={() => handleSubmit()}
            disabled={isSubmitting || !content.trim()}
            className="rounded-none font-mono text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 px-4 h-8 transition-all"
          >
            {isSubmitting ? (
              "Publishing..."
            ) : (
              <span className="flex items-center gap-1.5">
                <span>Publish</span>
                <span className="text-[10px] opacity-60 hidden md:inline">⌘↵</span>
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
