"use client";

import React, { useState, use } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { Header } from "@/components/Header";
import { Composer } from "@/components/Composer";
import { PostCard, PostItem } from "@/components/PostCard";
import { EditPostModal } from "@/components/EditPostModal";
import { ProfileModal } from "@/components/ProfileModal";
import { SettingsModal } from "@/components/SettingsModal";
import { TagsModal } from "@/components/TagsModal";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { pubkeyToFriendlyName } from "@/lib/nameGenerator";

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [profilePubkey, setProfilePubkey] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);

  // In-page reply target (defaults to focal post, but can be set to any child reply)
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    content: string;
    authorPubkey?: string | null;
    profileName?: string | null;
  } | null>(null);

  // InstantDB query for this post, its parent chain, and all replies
  const { data, isLoading } = db.useQuery({
    posts: {
      $: { where: { id } },
      profile: {},
      parent: {
        profile: {},
        parent: {
          profile: {},
        },
      },
      replies: {
        $: { order: { createdAt: "asc" } },
        profile: {},
        replies: {},
      },
    },
  });

  const focalPostRaw = data?.posts?.[0];

  const formatPostItem = (p: any): PostItem => {
    return {
      id: p.id,
      content: p.content,
      authorPubkey: p.authorPubkey || null,
      signed: Boolean(p.signed),
      signature: p.signature || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt || null,
      replyToId: p.replyToId || null,
      rootId: p.rootId || p.id,
      tags: p.tags ? (typeof p.tags === "string" ? JSON.parse(p.tags) : p.tags) : [],
      profile: p.profile
        ? {
            name: p.profile.name,
            bio: p.profile.bio,
            avatar: p.profile.avatar,
          }
        : null,
      replies: p.replies || [],
      parent: p.parent,
    };
  };

  const focalPost = focalPostRaw ? formatPostItem(focalPostRaw) : null;
  const parentPost = focalPostRaw?.parent ? formatPostItem(focalPostRaw.parent) : null;
  const grandParentPost = focalPostRaw?.parent?.parent
    ? formatPostItem(focalPostRaw.parent.parent)
    : null;

  const replies = (focalPostRaw?.replies || []).map(formatPostItem);

  // Active reply target: if user clicked reply on a specific reply, use that; otherwise focal post
  const effectiveReplyTarget =
    replyTarget ||
    (focalPost
      ? {
          id: focalPost.id,
          content: focalPost.content,
          authorPubkey: focalPost.authorPubkey,
          profileName:
            focalPost.profile?.name ||
            pubkeyToFriendlyName(focalPost.authorPubkey),
        }
      : null);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans flex flex-col selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfile={(pubkey) => setProfilePubkey(pubkey || null)}
        onOpenApiDocs={() => {}}
        onOpenTags={() => setIsTagsOpen(true)}
        activeTag={null}
        onClearTag={() => {}}
      />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6">
        {/* Navigation Bar */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full transition-colors flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
            title="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-lg text-black dark:text-white">
            Post
          </span>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-neutral-400 text-sm">
            Loading post...
          </div>
        ) : !focalPost ? (
          <div className="py-20 text-center border border-dashed border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
            <div className="font-semibold text-base">Post not found</div>
            <p className="text-neutral-400 text-sm">
              This post may have been removed or does not exist.
            </p>
            <button
              onClick={() => router.push("/")}
              className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
            >
              Return to home
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Parent conversation chain if replying */}
            {grandParentPost && (
              <div className="relative pl-3 border-l-2 border-neutral-300 dark:border-neutral-700">
                <PostCard
                  post={grandParentPost}
                  isThreadView={false}
                  onViewThread={(p) => router.push(`/post/${p.id}`)}
                  onViewAuthorProfile={(pubkey) => setProfilePubkey(pubkey)}
                />
              </div>
            )}

            {parentPost && (
              <div className="relative pl-3 border-l-2 border-neutral-300 dark:border-neutral-700">
                <PostCard
                  post={parentPost}
                  isThreadView={false}
                  onViewThread={(p) => router.push(`/post/${p.id}`)}
                  onViewAuthorProfile={(pubkey) => setProfilePubkey(pubkey)}
                />
              </div>
            )}

            {/* Focal Post (Featured) */}
            <div className="ring-1 ring-neutral-300 dark:ring-neutral-700">
              <PostCard
                post={focalPost}
                isThreadView={true}
                onReply={() =>
                  setReplyTarget({
                    id: focalPost.id,
                    content: focalPost.content,
                    authorPubkey: focalPost.authorPubkey,
                    profileName:
                      focalPost.profile?.name ||
                      pubkeyToFriendlyName(focalPost.authorPubkey),
                  })
                }
                onEdit={(p) => setEditingPost(p)}
                onViewAuthorProfile={(pubkey) => setProfilePubkey(pubkey)}
              />
            </div>

            {/* In-thread Reply Composer */}
            <div className="pt-2">
              <Composer
                replyToPost={effectiveReplyTarget}
                onCancelReply={() => setReplyTarget(null)}
                onPostSuccess={() => {
                  setReplyTarget(null);
                }}
                autoFocus={false}
              />
            </div>

            {/* Replies List (supports reply-on-reply) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <span className="text-xs font-semibold uppercase text-neutral-500 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Replies ({replies.length})</span>
                </span>
              </div>

              {replies.length === 0 ? (
                <div className="py-10 text-center text-neutral-400 text-sm">
                  No replies yet. Be the first to reply!
                </div>
              ) : (
                <div className="space-y-3 pl-3 border-l border-neutral-200 dark:border-neutral-800">
                  {replies.map((reply: PostItem) => (
                    <PostCard
                      key={reply.id}
                      post={reply}
                      isThreadView={false}
                      onReply={(target) => {
                        setReplyTarget({
                          id: target.id,
                          content: target.content,
                          authorPubkey: target.authorPubkey,
                          profileName:
                            target.profile?.name ||
                            pubkeyToFriendlyName(target.authorPubkey),
                        });
                        window.scrollTo({ top: 300, behavior: "smooth" });
                      }}
                      onEdit={(p) => setEditingPost(p)}
                      onViewThread={(p) => router.push(`/post/${p.id}`)}
                      onViewAuthorProfile={(pubkey) => setProfilePubkey(pubkey)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-6 mt-12 bg-white dark:bg-black text-xs text-neutral-500">
        <div className="max-w-2xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-black dark:text-white">written</span>
          </div>

          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-black dark:hover:text-white underline underline-offset-2">
              Privacy
            </a>
            <a href="/terms" className="hover:text-black dark:hover:text-white underline underline-offset-2">
              Terms
            </a>
            <a href="/llms.txt" target="_blank" rel="noreferrer" className="hover:text-black dark:hover:text-white underline underline-offset-2">
              llms.txt
            </a>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="hover:text-black dark:hover:text-white underline underline-offset-2"
            >
              Settings
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EditPostModal
        post={editingPost}
        isOpen={Boolean(editingPost)}
        onClose={() => setEditingPost(null)}
      />

      <ProfileModal
        pubkey={profilePubkey}
        isOpen={Boolean(profilePubkey)}
        onClose={() => setProfilePubkey(null)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <TagsModal
        isOpen={isTagsOpen}
        onClose={() => setIsTagsOpen(false)}
        onSelectTag={(tag) => router.push(`/?tag=${tag}`)}
        activeTag={null}
      />
    </div>
  );
}
