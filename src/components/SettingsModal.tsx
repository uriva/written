"use client";

import React, { useState } from "react";
import { useIdentity } from "@/lib/useIdentity";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Upload,
  Mail,
  Cloud,
  LogOut,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortKey } from "@/lib/crypto";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    keypair,
    generateNewKey,
    importPrivateKey,
    authUser,
    authLoading,
    sendEmailCode,
    verifyEmailCode,
    signOutEmail,
    saveKeyToAccount,
    hasCloudKey,
    cloudKeyPubkey,
    restoreKeyFromAccount,
  } = useIdentity();

  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copiedPubkey, setCopiedPubkey] = useState(false);
  const [copiedPrivkey, setCopiedPrivkey] = useState(false);

  // Import form state
  const [importKeyHex, setImportKeyHex] = useState("");
  const [showImportForm, setShowImportForm] = useState(false);

  // Email auth state
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const handleCopyPubkey = () => {
    if (!keypair?.publicKey) return;
    navigator.clipboard.writeText(keypair.publicKey);
    setCopiedPubkey(true);
    toast.success("Public key copied");
    setTimeout(() => setCopiedPubkey(false), 2000);
  };

  const handleCopyPrivkey = () => {
    if (!keypair?.privateKey) return;
    navigator.clipboard.writeText(keypair.privateKey);
    setCopiedPrivkey(true);
    toast.success("Private key copied to clipboard. Keep this secret!");
    setTimeout(() => setCopiedPrivkey(false), 2000);
  };

  const handleGenerateNew = () => {
    if (
      confirm(
        "Generate a brand new keypair? Make sure you have exported or backed up your current private key if you want to keep it!"
      )
    ) {
      generateNewKey();
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importKeyHex.trim()) return;
    const ok = importPrivateKey(importKeyHex.trim());
    if (ok) {
      setImportKeyHex("");
      setShowImportForm(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingCode(true);
    try {
      await sendEmailCode(emailInput);
      setCodeSent(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingCode(true);
    try {
      await verifyEmailCode(emailInput, codeInput);
      setCodeSent(false);
      setCodeInput("");
    } catch (err: any) {
      toast.error(err.message || "Invalid verification code");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleSaveToCloud = async () => {
    setIsBackingUp(true);
    try {
      await saveKeyToAccount();
    } catch (err: any) {
      toast.error(err.message || "Backup failed");
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-none p-6 text-black dark:text-white">
        <DialogHeader>
          <DialogTitle className="font-mono text-base font-bold flex items-center gap-2">
            <Key className="w-4 h-4" />
            <span>Identity & Keypair Settings</span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-neutral-500">
            Written is client-side and protocol-native. Your keys live in your
            browser by default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Active Keypair Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-900 pb-1.5">
              <span className="font-mono text-xs font-bold uppercase text-neutral-500">
                Current Ed25519 Keypair
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateNew}
                  className="h-6 px-2 font-mono text-[11px] rounded-none hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  New Key
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImportForm(!showImportForm)}
                  className="h-6 px-2 font-mono text-[11px] rounded-none hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Import
                </Button>
              </div>
            </div>

            {/* Public Key Display */}
            <div className="space-y-1">
              <div className="flex items-center justify-between font-mono text-xs text-neutral-500">
                <span>Public Key (Identity):</span>
                <button
                  onClick={handleCopyPubkey}
                  className="hover:text-black dark:hover:text-white flex items-center gap-1"
                >
                  {copiedPubkey ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Copy</span>
                </button>
              </div>
              <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 font-mono text-xs break-all select-all text-neutral-800 dark:text-neutral-200">
                {keypair?.publicKey || "No keypair generated"}
              </div>
            </div>

            {/* Private Key Display */}
            <div className="space-y-1">
              <div className="flex items-center justify-between font-mono text-xs text-neutral-500">
                <span className="flex items-center gap-1 text-red-500">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Private Key (Secret):</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="hover:text-black dark:hover:text-white flex items-center gap-1"
                  >
                    {showPrivateKey ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    <span>{showPrivateKey ? "Hide" : "Reveal"}</span>
                  </button>
                  <button
                    onClick={handleCopyPrivkey}
                    className="hover:text-black dark:hover:text-white flex items-center gap-1"
                  >
                    {copiedPrivkey ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Copy</span>
                  </button>
                </div>
              </div>
              <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 font-mono text-xs break-all select-all text-neutral-800 dark:text-neutral-200">
                {showPrivateKey
                  ? keypair?.privateKey
                  : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
              </div>
            </div>
          </section>

          {/* Import Private Key Drawer */}
          {showImportForm && (
            <form
              onSubmit={handleImportSubmit}
              className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 space-y-2 animate-fadeIn"
            >
              <div className="font-mono text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Import Existing 64-char Hex Private Key
              </div>
              <input
                type="text"
                value={importKeyHex}
                onChange={(e) => setImportKeyHex(e.target.value)}
                placeholder="Paste 64-character Ed25519 secret key hex..."
                className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 font-mono text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImportForm(false)}
                  className="rounded-none font-mono text-xs h-7"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-none font-mono text-xs h-7 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                >
                  Import Key
                </Button>
              </div>
            </form>
          )}

          {/* Email Key Backup (InstantDB Account Auth) */}
          <section className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-900 pb-1.5">
              <span className="font-mono text-xs font-bold uppercase text-neutral-500 flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                <span>Cloud Key Backup (Optional)</span>
              </span>
              {authUser && (
                <button
                  onClick={signOutEmail}
                  className="font-mono text-[11px] text-neutral-400 hover:text-red-500 flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" />
                  Sign Out
                </button>
              )}
            </div>

            <p className="font-sans text-xs text-neutral-600 dark:text-neutral-400 leading-normal">
              Written does not require an account to post. You can optionally sign
              in with email here to securely backup your private key to your
              InstantDB account so you can restore it on other devices.
            </p>

            {!authUser ? (
              /* Email Sign In Flow */
              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 space-y-3">
                {!codeSent ? (
                  <form onSubmit={handleSendEmail} className="space-y-2">
                    <label className="font-mono text-[11px] text-neutral-500 block">
                      Enter your email for InstantDB magic code:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="you@domain.com"
                        className="flex-1 bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 font-mono text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                        required
                      />
                      <Button
                        type="submit"
                        disabled={isSendingCode}
                        className="rounded-none font-mono text-xs h-8 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 shrink-0"
                      >
                        {isSendingCode ? "Sending..." : "Send Code"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyEmail} className="space-y-2">
                    <label className="font-mono text-[11px] text-neutral-500 block">
                      Enter the 6-digit code sent to {emailInput}:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value)}
                        placeholder="123456"
                        className="flex-1 bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 p-2 font-mono text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white tracking-widest text-center"
                        required
                        maxLength={10}
                      />
                      <Button
                        type="submit"
                        disabled={isVerifyingCode}
                        className="rounded-none font-mono text-xs h-8 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 shrink-0"
                      >
                        {isVerifyingCode ? "Verifying..." : "Verify & Sign In"}
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCodeSent(false)}
                      className="font-mono text-[10px] text-neutral-400 hover:text-black dark:hover:text-white underline"
                    >
                      Use a different email
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* Signed In: Backup & Restore Actions */
              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Connected account:</span>
                  <span className="font-bold text-black dark:text-white">
                    {authUser.email}
                  </span>
                </div>

                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveToCloud}
                    disabled={isBackingUp}
                    className="rounded-none font-mono text-xs h-8 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 flex-1"
                  >
                    <Cloud className="w-3.5 h-3.5 mr-1.5" />
                    {isBackingUp ? "Saving..." : "Save Active Key to Account"}
                  </Button>

                  {hasCloudKey && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={restoreKeyFromAccount}
                      className="rounded-none font-mono text-xs h-8 border-neutral-300 dark:border-neutral-700 flex-1"
                      title={`Restore key ${formatShortKey(cloudKeyPubkey)}`}
                    >
                      Restore Cloud Key ({formatShortKey(cloudKeyPubkey)})
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
