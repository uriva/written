"use client";

import React, { useState, useMemo } from "react";
import { db } from "@/lib/db";
import { Header } from "@/components/Header";
import { HeroManifesto } from "@/components/HeroManifesto";
import { Composer } from "@/components/Composer";
import { PostCard, PostItem } from "@/components/PostCard";
import { EditPostModal } from "@/components/EditPostModal";
import { ThreadModal } from "@/components/ThreadModal";
import { ProfileModal } from "@/components/ProfileModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ApiExplorerModal } from "@/components/ApiExplorerModal";
import { TagsModal } from "@/components/TagsModal";
import { Filter, Sparkles, Hash, ShieldCheck, ShieldAlert, Layers } from "lucide-react";

export default function HomePage() {
  // Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isApiDocsOpen, setIsApiDocsOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [profilePubkey, setProfilePubkey] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [threadPost, setThreadPost] = useState<PostItem | null>(null);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    content: string;
    authorPubkey?: string | null;
    profileName?: string | null;
  } | null>(null);

  // Filter states
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<"all" | "signed" | "unsigned">("all");

  // InstantDB Real-time Query
  const { data, isLoading, error } = db.useQuery({
    posts: {
      $: {
        order: { createdAt: "desc" },
        limit: 100,
      },
      profile: {},
      replies: {},
    },
    tags: {
      $: {
        order: { postCount: "desc" },
        limit: 12,
      },
    },
  });

  const rawPosts = data?.posts || [];
  const popularTags = data?.tags || [];

  // Filter posts
  const filteredPosts = useMemo(() => {
    let list = rawPosts.map((p: any) => ({
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
    }));

    // Filter out replies from top-level feed (unless viewing thread)
    list = list.filter((p) => !p.replyToId);

    // Filter by active hashtag
    if (activeTag) {
      list = list.filter((p) => {
        if (!p.tags || !Array.isArray(p.tags)) return false;
        return p.tags.map((t: string) => t.toLowerCase()).includes(activeTag.toLowerCase());
      });
    }

    // Filter by signed vs unsigned
    if (feedMode === "signed") {
      list = list.filter((p) => p.signed);
    } else if (feedMode === "unsigned") {
      list = list.filter((p) => !p.signed);
    }

    return list;
  }, [rawPosts, activeTag, feedMode]);

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
        {/* Manifesto / Hero */}
        <HeroManifesto />

        {/* Composer */}
        <Composer
          replyToPost={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onPostSuccess={() => {
            setReplyingTo(null);
          }}
        />

        {/* Popular Tags Quick Bar */}
        {popularTags.length > 0 && !activeTag && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-2 mb-4 scrollbar-none text-xs font-mono">
            <span className="text-neutral-400 uppercase text-[10px] shrink-0">
              trending:
            </span>
            {popularTags.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setActiveTag(t.name)}
                className="shrink-0 px-2 py-0.5 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 hover:border-black dark:hover:border-white transition-colors text-neutral-800 dark:text-neutral-200"
              >
                #{t.name}
              </button>
            ))}
          </div>
        )}

        {/* Feed Filter Sub-header */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-4">
          <div className="flex items-center gap-1 font-mono text-xs">
            <button
              onClick={() => setFeedMode("all")}
              className={`px-2 py-1 transition-colors ${
                feedMode === "all"
                  ? "bg-black text-white dark:bg-white dark:text-black font-bold"
                  : "text-neutral-500 hover:text-black dark:hover:text-white"
              }`}
            >
              All ({rawPosts.filter((p: any) => !p.replyToId).length})
            </button>
            <button
              onClick={() => setFeedMode("signed")}
              className={`px-2 py-1 transition-colors flex items-center gap-1 ${
                feedMode === "signed"
                  ? "bg-black text-white dark:bg-white dark:text-black font-bold"
                  : "text-neutral-500 hover:text-black dark:hover:text-white"
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>Signed</span>
            </button>
            <button
              onClick={() => setFeedMode("unsigned")}
              className={`px-2 py-1 transition-colors flex items-center gap-1 ${
                feedMode === "unsigned"
                  ? "bg-black text-white dark:bg-white dark:text-black font-bold"
                  : "text-neutral-500 hover:text-black dark:hover:text-white"
              }`}
            >
              <ShieldAlert className="w-3 h-3 text-neutral-400" />
              <span>Anonymous</span>
            </button>
          </div>

          <div className="font-mono text-[11px] text-neutral-400">
            {activeTag ? (
              <span className="flex items-center gap-1">
                <span>filtering #{activeTag}</span>
                <button
                  onClick={() => setActiveTag(null)}
                  className="hover:underline text-black dark:text-white"
                >
                  (clear)
                </button>
              </span>
            ) : (
              <span>realtime stream</span>
            )}
          </div>
        </div>

        {/* Feed Posts */}
        {isLoading ? (
          <div className="py-16 text-center font-mono text-xs text-neutral-400">
            Connecting to instantdb.uriv.me...
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
                onViewThread={(p) => setThreadPost(p)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-6 mt-12 bg-white dark:bg-black font-mono text-xs text-neutral-500">
        <div className="max-w-2xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-black dark:text-white">written</span>
          </div>

          <div className="flex items-center gap-4">
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
      />

      <ThreadModal
        post={threadPost}
        isOpen={Boolean(threadPost)}
        onClose={() => setThreadPost(null)}
        onEditPost={(p) => setEditingPost(p)}
        onSelectTag={(tag) => setActiveTag(tag)}
        onViewAuthorProfile={(pubkey) => setProfilePubkey(pubkey)}
      />

      <ProfileModal
        pubkey={profilePubkey}
        isOpen={Boolean(profilePubkey)}
        onClose={() => setProfilePubkey(null)}
        onSelectTag={(tag) => setActiveTag(tag)}
        onViewThread={(p) => setThreadPost(p)}
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
