"use client";

import React from "react";
import { useIdentity } from "@/lib/useIdentity";
import { formatShortKey } from "@/lib/crypto";
import {
  Key,
  Shield,
  ShieldAlert,
  Terminal,
  Settings as SettingsIcon,
  User,
  Hash,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenProfile: (pubkey?: string) => void;
  onOpenApiDocs: () => void;
  onOpenTags: () => void;
  activeTag: string | null;
  onClearTag: () => void;
}

export function Header({
  onOpenSettings,
  onOpenProfile,
  onOpenApiDocs,
  onOpenTags,
  activeTag,
  onClearTag,
}: HeaderProps) {
  const { keypair, isSignedMode, setIsSignedMode, profileName } = useIdentity();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-black/95 backdrop-blur-md">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-2 group focus:outline-none"
            onClick={(e) => {
              if (activeTag) {
                e.preventDefault();
                onClearTag();
              }
            }}
          >
            <div className="w-5 h-5 bg-black dark:bg-white flex items-center justify-center rounded-none text-white dark:text-black font-mono font-bold text-xs tracking-tighter">
              w
            </div>
            <span className="font-mono font-bold text-lg tracking-tight text-black dark:text-white">
              written
            </span>
          </a>

          <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border border-neutral-300 dark:border-neutral-800 text-neutral-500">
            open protocol
          </span>

          {activeTag && (
            <div className="flex items-center gap-1 bg-black text-white dark:bg-white dark:text-black font-mono text-xs px-2 py-0.5 animate-fadeIn">
              <span>#{activeTag}</span>
              <button
                onClick={onClearTag}
                className="hover:opacity-75 focus:outline-none font-bold ml-1"
                title="Clear filter"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Status & Nav Actions */}
        <div className="flex items-center gap-2">
          {/* Sign Mode Toggle Pill */}
          <button
            onClick={() => setIsSignedMode(!isSignedMode)}
            className={`font-mono text-xs px-2.5 py-1 transition-all flex items-center gap-1.5 border ${
              isSignedMode
                ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white font-medium shadow-xs"
                : "bg-transparent text-neutral-500 hover:text-black dark:hover:text-white border-neutral-300 dark:border-neutral-800"
            }`}
            title={
              isSignedMode
                ? `Signing posts as ${formatShortKey(keypair?.publicKey)} (click to switch to anonymous)`
                : "Posting anonymously (click to switch to signed)"
            }
          >
            {isSignedMode ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden md:inline">signed:</span>
                <span>{profileName || formatShortKey(keypair?.publicKey)}</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full border border-neutral-400" />
                <span>anonymous</span>
              </>
            )}
          </button>

          {/* Tags */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTags}
            className="h-8 px-2 font-mono text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title="Browse Hashtags"
          >
            <Hash className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">Tags</span>
          </Button>

          {/* API & Agents */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenApiDocs}
            className="h-8 px-2 font-mono text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title="API & Autonomous Agents"
          >
            <Terminal className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">API</span>
          </Button>

          {/* Profile */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenProfile(keypair?.publicKey)}
            className="h-8 px-2 font-mono text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title="My Profile"
          >
            <User className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">Profile</span>
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="h-8 px-2 font-mono text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title="Settings & Keypair Management"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
