"use client";

import React, { useState, useEffect } from "react";
import { PostItem } from "./PostCard";
import { useIdentity } from "@/lib/useIdentity";
import { buildEditCanonicalMessage, extractHashtags, signPayload } from "@/lib/crypto";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ShieldCheck, Edit3 } from "lucide-react";

interface EditPostModalProps {
  post: PostItem | null;
  isOpen: boolean;
  onClose: () => void;
  onEditedSuccess?: (updatedPost: any) => void;
}

export function EditPostModal({
  post,
  isOpen,
  onClose,
  onEditedSuccess,
}: EditPostModalProps) {
  const { keypair } = useIdentity();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (post) {
      setContent(post.content);
    }
  }, [post]);

  if (!post) return null;

  const detectedTags = extractHashtags(content);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Content cannot be empty");
      return;
    }
    if (trimmed === post.content) {
      toast.info("No changes made");
      onClose();
      return;
    }

    if (!keypair?.privateKey || !keypair?.publicKey) {
      toast.error("Missing private key to sign edit action");
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedAt = Date.now();
      const canonicalMsg = buildEditCanonicalMessage({
        postId: post.id,
        newContent: trimmed,
        updatedAt,
      });

      const signature = signPayload(canonicalMsg, keypair.privateKey);

      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          authorPubkey: keypair.publicKey,
          signature,
          updatedAt,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to edit post");
      }

      toast.success("Post updated with cryptographic signature");
      if (onEditedSuccess) {
        onEditedSuccess(data.post);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to edit post");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-none p-6 text-black dark:text-white">
        <DialogHeader>
          <DialogTitle className="font-mono text-base font-bold flex items-center gap-2">
            <Edit3 className="w-4 h-4" />
            <span>Edit Signed Post</span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-neutral-500">
            Unsigned posts are immutable. Since this post was signed by your
            public key, you can sign and publish a revised version.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 mt-2">
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Edit your thoughts..."
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 text-sm font-sans focus:outline-none focus:border-black dark:focus:border-white resize-none text-black dark:text-white"
            />
          </div>

          {detectedTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-mono text-[10px] uppercase text-neutral-400">
                tags:
              </span>
              {detectedTags.map((t) => (
                <span
                  key={t}
                  className="font-mono text-xs px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-black dark:text-white"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-xs font-mono space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Ed25519 Re-Signing</span>
            </div>
            <p className="text-neutral-500 text-[11px]">
              A new canonical edit payload will be signed with your private key.
              Previous revisions remain stored in cryptographic history.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-none font-mono text-xs border-neutral-300 dark:border-neutral-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="rounded-none font-mono text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              {isSubmitting ? "Signing & Saving..." : "Sign & Save Revision"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
