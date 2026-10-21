"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFeed } from "@/lib/useFeed";
import { useIdentity } from "@/lib/useIdentity";
import { Header } from "@/components/Header";
import { Composer } from "@/components/Composer";
import { PostCard, PostItem } from "@/components/PostCard";
import { EditPostModal } from "@/components/EditPostModal";
import { ProfileModal } from "@/components/ProfileModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ApiExplorerModal } from "@/components/ApiExplorerModal";
import { TagsModal } from "@/components/TagsModal";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { keypair } = useIdentity();

  // Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isApiDocsOpen, setIsApiDocsOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [profilePubkey, setProfilePubkey] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    content: string;
    authorPubkey?: string | null;
    profileName?: string | null;
  } | null>(null);

  // Filter states
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<"all" | "signed" | "unsigned">("all");
  const [rankMode, setRankMode] = useState<"for-you" | "latest">("for-you");

  // Read ?tag= from the URL (used by profile/tag links).
  useEffect(() => {
    const tag = new URLSearchParams(window.location.search).get("tag");
    if (tag) setActiveTag(tag.toLowerCase().replace(/^#/, ""));
  }, []);

  // Polling feed backed by PostgreSQL.
  const { posts: rawPosts, isLoading, error, refresh } = useFeed(activeTag, {
    viewer: keypair?.publicKey || null,
    rank: rankMode,
  });

  const filteredPosts = useMemo(() => {
    let list = rawPosts.filter((post) => !post.replyToId);

    if (feedMode === "signed") {
      list = list.filter((post) => post.signed);
    } else if (feedMode === "unsigned") {
      list = list.filter((post) => !post.signed);
    }

    return list;
  }, [rawPosts, feedMode]);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans flex flex-col selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfile={(pubkey) => setProfilePubkey(pubkey || null)}
        onOpenApiDocs={() => setIsApiDocsOpen(true)}
        onOpenTags={() => setIsTagsOpen(true)}
        activeTag={activeTag}
        onClearTag={() => setActiveTag(null)}
      />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6">
        {/* Composer */}
        <Composer
          replyToPost={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onPostSuccess={() => {
            setReplyingTo(null);
            void refresh();
          }}
        />

        {/* Feed Filter Sub-header */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-4">
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setFeedMode("all")}
              className={`px-2.5 py-1 transition-colors ${
                feedMode === "all"
                  ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
                  : "text-neutral-500 hover:text-black dark:hover:text-white"
              }`}
            >
              All ({rawPosts.filter((p) => !p.replyToId).length})
            </button>
            <button
              onClick={() => setFeedMode("signed")}
              className={`px-2.5 py-1 transition-colors flex items-center gap-1 ${
                feedMode === "signed"
                  ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
                  : "text-neutral-500 hover:text-black dark:hover:text-white"
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>Signed</span>
            </button>
            <button
              onClick={() => setFeedMode("unsigned")}
              className={`px-2.5 py-1 transition-colors flex items-center gap-1 ${
                feedMode === "unsigned"
                  ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
                  : "text-neutral-500 hover:text-black dark:hover:text-white"
              }`}
            >
              <ShieldAlert className="w-3 h-3 text-neutral-400" />
              <span>Anonymous</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-neutral-400">
            {activeTag ? (
              <span className="flex items-center gap-1">
                <span>filtering #{activeTag}</span>
                <button
                  onClick={() => setActiveTag(null)}
                  className="hover:underline text-black dark:text-white font-medium"
                >
                  (clear)
                </button>
              </span>
            ) : null}

            <div className="flex items-center gap-1">
              <button
                onClick={() => setRankMode("for-you")}
                className={`px-2 py-0.5 transition-colors ${
                  rankMode === "for-you"
                    ? "text-black dark:text-white font-semibold underline underline-offset-4"
                    : "text-neutral-400 hover:text-black dark:hover:text-white"
                }`}
                title="Ranked by multi-hop pairwise likeness from your votes"
              >
                For you
              </button>
              <span>·</span>
              <button
                onClick={() => setRankMode("latest")}
                className={`px-2 py-0.5 transition-colors ${
                  rankMode === "latest"
                    ? "text-black dark:text-white font-semibold underline underline-offset-4"
                    : "text-neutral-400 hover:text-black dark:hover:text-white"
                }`}
                title="Chronological order"
              >
                Latest
              </button>
            </div>
          </div>
        </div>

        {/* Feed Posts */}
        {isLoading ? (
          <div className="py-16 text-center font-mono text-xs text-neutral-400">
            Loading the feed...
          </div>
        ) : error && rawPosts.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-neutral-200 dark:border-neutral-800 p-8 space-y-2">
            <div className="font-mono font-bold text-sm">Could not load the feed</div>
            <p className="font-mono text-xs text-neutral-400">{error}</p>
            <button
              onClick={() => void refresh()}
              className="font-mono text-xs underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-neutral-200 dark:border-neutral-800 p-8 space-y-2">
            <div className="font-mono font-bold text-sm">No posts yet</div>
            <p className="font-mono text-xs text-neutral-400">
              {activeTag
                ? `No posts found under #${activeTag}. Write the first one above!`
                : "The network is silent. Write something into the protocol."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onReply={(p) => {
                  setReplyingTo({
                    id: p.id,
                    content: p.content,
                    authorPubkey: p.authorPubkey,
                    profileName: p.profile?.name,
                  });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onEdit={(p) => setEditingPost(p)}
                onSelectTag={(tag) => setActiveTag(tag)}
                onViewAuthorProfile={(pubkey) => setProfilePubkey(pubkey)}
                onViewThread={(p) => router.push(`/post/${p.id}`)}
                onVoteChange={() => void refresh()}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-6 mt-12 bg-white dark:bg-black text-xs text-neutral-500">
        <div className="max-w-2xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-black dark:text-white">written</span>
            <span className="text-neutral-400">•</span>
            <span className="text-neutral-400">No accounts. Just write.</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="/privacy"
              className="hover:text-black dark:hover:text-white underline underline-offset-2"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="hover:text-black dark:hover:text-white underline underline-offset-2"
            >
              Terms
            </a>
            <button
              onClick={() => setIsApiDocsOpen(true)}
              className="hover:text-black dark:hover:text-white underline underline-offset-2"
            >
              API
            </button>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noreferrer"
              className="hover:text-black dark:hover:text-white underline underline-offset-2"
            >
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
        onEditedSuccess={() => void refresh()}
      />

      <ProfileModal
        pubkey={profilePubkey}
        isOpen={Boolean(profilePubkey)}
        onClose={() => setProfilePubkey(null)}
        onSelectTag={(tag) => setActiveTag(tag)}
        onViewThread={(p) => router.push(`/post/${p.id}`)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ApiExplorerModal
        isOpen={isApiDocsOpen}
        onClose={() => setIsApiDocsOpen(false)}
      />

      <TagsModal
        isOpen={isTagsOpen}
        onClose={() => setIsTagsOpen(false)}
        onSelectTag={(tag) => setActiveTag(tag)}
        activeTag={activeTag}
      />
    </div>
  );
}
