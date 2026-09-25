"use client";

import React, { useState, useEffect } from "react";
import { useIdentity } from "@/lib/useIdentity";
import { formatShortKey, buildProfileCanonicalMessage, signPayload } from "@/lib/crypto";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, Copy, Check, Edit2 } from "lucide-react";
import { PostCard, PostItem } from "./PostCard";

interface ProfileModalProps {
  pubkey: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectTag?: (tag: string) => void;
  onViewThread?: (post: PostItem) => void;
}

export function ProfileModal({
  pubkey,
  isOpen,
  onClose,
  onSelectTag,
  onViewThread,
}: ProfileModalProps) {
  const { keypair, updateLocalProfile } = useIdentity();
  const [profileData, setProfileData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Form states for editing
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isOwner =
    keypair?.publicKey &&
    pubkey &&
    keypair.publicKey.toLowerCase() === pubkey.toLowerCase();

  const fetchProfile = async (targetPubkey: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/profiles/${targetPubkey}`);
      const data = await res.json();
      if (data.success) {
        setProfileData(data);
        if (data.profile) {
          setName(data.profile.name || "");
          setBio(data.profile.bio || "");
          setAvatar(data.profile.avatar || "");
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (pubkey && isOpen) {
      setIsEditing(false);
      fetchProfile(pubkey);
    }
  }, [pubkey, isOpen]);

  if (!pubkey) return null;

  const handleCopyPubkey = () => {
    navigator.clipboard.writeText(pubkey);
    setCopiedKey(true);
    toast.success("Identifier copied");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!keypair?.privateKey) {
      toast.error("Missing key to update profile");
      return;
    }

    setIsSaving(true);
    try {
      const updatedAt = Date.now();
      const canonicalMsg = buildProfileCanonicalMessage({
        pubkey: keypair.publicKey,
        name: name.trim(),
        bio: bio.trim(),
        avatar: avatar.trim(),
        updatedAt,
      });

      const signature = signPayload(canonicalMsg, keypair.privateKey);

      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: keypair.publicKey,
          name: name.trim(),
          bio: bio.trim() || null,
          avatar: avatar.trim() || null,
          signature,
          updatedAt,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update profile");
      }

      updateLocalProfile(name.trim(), bio.trim(), avatar.trim());
      toast.success("Profile saved");
      setIsEditing(false);
      fetchProfile(keypair.publicKey);
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const recentPosts = profileData?.recentPosts || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-none p-6 text-black dark:text-white">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-sm font-bold flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>Profile</span>
            </DialogTitle>
            {isOwner && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-7 px-2 text-xs rounded-none border-neutral-300 dark:border-neutral-700"
              >
                <Edit2 className="w-3 h-3 mr-1" />
                Edit Profile
              </Button>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 uppercase font-mono">
                Display Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2 text-sm font-sans focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-500 uppercase font-mono">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short bio..."
                rows={3}
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2 text-sm font-sans focus:outline-none focus:border-black dark:focus:border-white resize-none text-black dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-500 uppercase font-mono">
                Avatar URL (optional)
              </label>
              <input
                type="url"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://..."
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2 text-sm font-sans focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
                className="rounded-none text-xs border-neutral-300 dark:border-neutral-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="rounded-none text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              >
                {isSaving ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5 pt-2">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 flex items-center justify-center font-bold text-base shrink-0 overflow-hidden">
                {profileData?.profile?.avatar ? (
                  <img
                    src={profileData.profile.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (profileData?.profile?.name || pubkey).slice(0, 2).toUpperCase()
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-black dark:text-white truncate">
                    {profileData?.profile?.name || `@${formatShortKey(pubkey)}`}
                  </h3>
                  {isOwner && (
                    <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500">
                      you
                    </span>
                  )}
                </div>

                {profileData?.profile?.bio && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-1 whitespace-pre-wrap leading-relaxed">
                    {profileData.profile.bio}
                  </p>
                )}

                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
                  <span>@{formatShortKey(pubkey)}</span>
                  <button
                    onClick={handleCopyPubkey}
                    className="hover:text-black dark:hover:text-white p-0.5"
                    title="Copy identifier"
                  >
                    {copiedKey ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-neutral-100 dark:border-neutral-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-neutral-400 uppercase">
                  Posts ({profileData?.postCount || recentPosts.length})
                </span>
              </div>

              {recentPosts.length === 0 ? (
                <div className="text-center py-6 text-neutral-400 text-xs font-mono">
                  No posts yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentPosts.map((post: any) => (
                    <PostCard
                      key={post.id}
                      post={{
                        ...post,
                        authorPubkey: pubkey,
                        profile: profileData?.profile,
                      }}
                      onSelectTag={onSelectTag}
                      onViewThread={onViewThread}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
