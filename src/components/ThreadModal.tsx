"use client";

import React, { useState, useEffect } from "react";
import { PostCard, PostItem } from "./PostCard";
import { Composer } from "./Composer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, ArrowLeft, RefreshCw } from "lucide-react";

interface ThreadModalProps {
  post: PostItem | null;
  isOpen: boolean;
  onClose: () => void;
  onEditPost: (post: PostItem) => void;
  onSelectTag: (tag: string) => void;
  onViewAuthorProfile: (pubkey: string) => void;
}

export function ThreadModal({
  post,
  isOpen,
  onClose,
  onEditPost,
  onSelectTag,
  onViewAuthorProfile,
}: ThreadModalProps) {
  const [threadData, setThreadData] = useState<PostItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchThread = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/posts/${id}`);
      const data = await res.json();
      if (data.success && data.post) {
        setThreadData(data.post);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (post?.id && isOpen) {
      setThreadData(post);
      fetchThread(post.id);
    }
  }, [post?.id, isOpen]);

  if (!post) return null;

  const current = threadData || post;
  const parent = current.parent;
  const replies = current.replies || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-6 text-black dark:text-white">
        <DialogHeader className="border-b border-neutral-100 dark:border-neutral-900 pb-3 mb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-sm font-bold flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>Thread Conversation</span>
            </DialogTitle>
            <button
              onClick={() => fetchThread(post.id)}
              className="text-neutral-400 hover:text-black dark:hover:text-white p-1"
              title="Refresh thread"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Parent Post if this is a reply */}
          {parent && (
            <div className="relative pl-4 border-l-2 border-neutral-300 dark:border-neutral-700 space-y-1">
              <span className="font-mono text-[10px] uppercase text-neutral-400">
                parent post
              </span>
              <PostCard
                post={parent}
                isThreadView={true}
                onSelectTag={onSelectTag}
                onViewAuthorProfile={onViewAuthorProfile}
              />
            </div>
          )}

          {/* Focal Post */}
          <div>
            <PostCard
              post={current}
              isThreadView={true}
              onEdit={onEditPost}
              onSelectTag={onSelectTag}
              onViewAuthorProfile={onViewAuthorProfile}
            />
          </div>

          {/* Inline Reply Composer */}
          <div className="pt-2">
            <span className="font-mono text-xs text-neutral-500 mb-1.5 block">
              Leave a Reply:
            </span>
            <Composer
              replyToPost={{
                id: current.id,
                content: current.content,
                authorPubkey: current.authorPubkey,
                profileName: current.profile?.name,
              }}
              onPostSuccess={() => {
                fetchThread(current.id);
              }}
            />
          </div>

          {/* Replies Section */}
          <div className="pt-2 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-900 pb-1.5">
              <span className="font-mono text-xs font-bold uppercase text-neutral-500">
                Replies ({replies.length})
              </span>
            </div>

            {replies.length === 0 ? (
              <div className="text-center py-6 text-neutral-400 font-mono text-xs">
                No replies yet. Be the first to answer.
              </div>
            ) : (
              <div className="space-y-3 pl-3 border-l border-neutral-200 dark:border-neutral-800">
                {replies.map((reply: any) => (
                  <PostCard
                    key={reply.id}
                    post={reply}
                    isThreadView={true}
                    onSelectTag={onSelectTag}
                    onViewAuthorProfile={onViewAuthorProfile}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
