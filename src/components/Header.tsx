"use client";

import React from "react";
import { useIdentity } from "@/lib/useIdentity";
import { useTheme } from "@/lib/useTheme";
import {
  Sun,
  Moon,
  Settings as SettingsIcon,
  User,
  Hash,
  Terminal,
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
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-black/95 backdrop-blur-md">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
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
            <div className="w-5 h-5 bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-mono font-bold text-xs">
              w
            </div>
            <span className="font-mono font-bold text-lg tracking-tight text-black dark:text-white">
              written
            </span>
          </a>

          <span className="hidden md:inline text-xs text-neutral-400">
            No accounts. Just write.
          </span>

          {activeTag && (
            <div className="flex items-center gap-1 bg-black text-white dark:bg-white dark:text-black font-mono text-xs px-2 py-0.5">
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

        {/* Status & Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Sign Mode Toggle */}
          <button
            onClick={() => setIsSignedMode(!isSignedMode)}
            className={`text-xs px-2.5 py-1 transition-all flex items-center gap-1.5 border rounded-none ${
              isSignedMode
                ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white font-medium"
                : "bg-transparent text-neutral-500 border-neutral-300 dark:border-neutral-800 hover:text-black dark:hover:text-white"
            }`}
            title={isSignedMode ? "Posting as signed (click to switch to anonymous)" : "Posting as anonymous (click to switch to signed)"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSignedMode ? "bg-emerald-400" : "bg-neutral-400"
              }`}
            />
            <span className="text-xs">
              {isSignedMode ? profileName || "Signed" : "Anonymous"}
            </span>
          </button>

          {/* Tags */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTags}
            className="h-8 px-2 text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title="Browse Hashtags"
          >
            <Hash className="w-3.5 h-3.5" />
            <span className="hidden sm:inline ml-1 font-medium">Tags</span>
          </Button>

          {/* Profile */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenProfile(keypair?.publicKey)}
            className="h-8 px-2 text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title="My Profile"
          >
            <User className="w-3.5 h-3.5" />
            <span className="hidden sm:inline ml-1 font-medium">Profile</span>
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="h-8 px-2 text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title="Settings & Key Backup"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </Button>

          {/* Light / Dark Mode Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="h-8 px-2 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-none"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-neutral-300 hover:text-white" />
            ) : (
              <Moon className="w-4 h-4 text-neutral-700 hover:text-black" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
