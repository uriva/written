"use client";

import React, { useState, useEffect, useRef } from "react";
import { useIdentity } from "@/lib/useIdentity";
import { buildProfileCanonicalMessage, signPayload } from "@/lib/crypto";
import { pubkeyToFriendlyName, getAuthorInitials } from "@/lib/nameGenerator";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, Copy, Check, Edit2, Upload, Trash2, Camera } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Image upload & compression handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setAvatar(dataUrl);
          toast.success("Avatar image selected");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
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

  // Helper to hyperlinkify URLs in bio text (supports https://, http://, www., and domain.tld like uriv.me)
  const renderBioWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/gu;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      const matchStart = match.index;
      let raw = match[0];
      let trailing = "";
      const trailMatch = raw.match(/[.,;:!?)]+$/);
      if (trailMatch) {
        trailing = trailMatch[0];
        raw = raw.slice(0, -trailing.length);
      }

      if (matchStart > lastIndex) {
        parts.push(text.slice(lastIndex, matchStart));
      }

      let href = raw;
      if (!href.startsWith("http://") && !href.startsWith("https://")) {
        href = "https://" + href;
      }

      const displayUrl = raw
        .replace(/^https?:\/\/(www\.)?/, "")
        .replace(/\/$/, "");

      parts.push(
        <a
          key={`bio-link-${matchStart}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline underline-offset-2 font-medium text-black dark:text-white hover:opacity-75"
        >
          {displayUrl}
        </a>
      );

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
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Avatar Upload Section */}
            <div className="flex items-center gap-4 p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-16 h-16 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center overflow-hidden cursor-pointer group shrink-0 border border-neutral-300 dark:border-neutral-700"
                title="Click to choose image"
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-7 h-7 text-neutral-400" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Camera className="w-5 h-5" />
                </div>
              </div>

              <div className="flex-1 space-y-1">
                <span className="text-xs font-medium block text-neutral-800 dark:text-neutral-200">
                  Profile Picture
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-xs rounded-none border-neutral-300 dark:border-neutral-700"
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Upload Image
                  </Button>
                  {avatar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAvatar("")}
                      className="h-7 text-xs text-red-500 hover:text-red-600 rounded-none px-2"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

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
                Bio (URLs will be clickable)
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell the network about yourself... (add https://your-site.com)"
                rows={3}
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2 text-sm font-sans focus:outline-none focus:border-black dark:focus:border-white resize-none text-black dark:text-white"
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
              <div className="w-14 h-14 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 flex items-center justify-center font-bold text-base shrink-0 overflow-hidden border border-neutral-200 dark:border-neutral-800">
                {profileData?.profile?.avatar ? (
                  <img
                    src={profileData.profile.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getAuthorInitials(profileData?.profile?.name || pubkeyToFriendlyName(pubkey))
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-black dark:text-white truncate">
                    {profileData?.profile?.name || pubkeyToFriendlyName(pubkey)}
                  </h3>
                  {isOwner && (
                    <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500">
                      you
                    </span>
                  )}
                </div>

                {/* Hyperlinked Bio */}
                {profileData?.profile?.bio && (
                  <p className="text-[14px] text-neutral-700 dark:text-neutral-300 mt-1 whitespace-pre-wrap leading-relaxed">
                    {renderBioWithLinks(profileData.profile.bio)}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleCopyPubkey}
                    className="text-xs text-neutral-500 hover:text-black dark:hover:text-white flex items-center gap-1 border border-neutral-200 dark:border-neutral-800 px-2 py-0.5 transition-colors"
                    title="Copy identifier"
                  >
                    {copiedKey ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedKey ? "Key Copied" : "Copy Key"}</span>
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
