"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  generateKeyPair,
  getPublicKeyFromPrivateKey,
  isValidPrivateKey,
  KeyPair,
} from "./crypto";
import { db, id } from "./db";
import { toast } from "sonner";

interface IdentityContextType {
  keypair: KeyPair | null;
  isSignedMode: boolean;
  setIsSignedMode: (val: boolean) => void;
  profileName: string;
  profileBio: string;
  profileAvatar: string;
  isInitialized: boolean;
  generateNewKey: () => KeyPair;
  importPrivateKey: (hex: string) => boolean;
  clearKey: () => void;
  updateLocalProfile: (name: string, bio: string, avatar: string) => void;
  // InstantDB account auth for email backup in settings
  authUser: any;
  authLoading: boolean;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signOutEmail: () => Promise<void>;
  saveKeyToAccount: () => Promise<void>;
  hasCloudKey: boolean;
  cloudKeyPubkey: string | null;
  restoreKeyFromAccount: () => Promise<void>;
}

const STORAGE_KEY_PAIR = "written_keypair_v1";
const STORAGE_SIGNED_MODE = "written_signed_mode_v1";
const STORAGE_PROFILE = "written_profile_v1";

const IdentityContext = createContext<IdentityContextType | null>(null);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [keypair, setKeypair] = useState<KeyPair | null>(null);
  const [isSignedMode, setIsSignedModeState] = useState<boolean>(true);
  const [profileName, setProfileName] = useState<string>("");
  const [profileBio, setProfileBio] = useState<string>("");
  const [profileAvatar, setProfileAvatar] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // InstantDB auth for optional email backup in Settings
  const { user: authUser, isLoading: authLoading } = db.useAuth();

  // Query userKeys if authUser is present
  const userKeysQuery = db.useQuery(
    authUser
      ? {
          userKeys: {
            $: {
              where: { "user.id": authUser.id },
            },
          },
        }
      : {}
  );

  const cloudUserKey = userKeysQuery.data?.userKeys?.[0];
  const hasCloudKey = Boolean(cloudUserKey);
  const cloudKeyPubkey = cloudUserKey?.pubkey || null;

  // Initialize from localStorage or generate automatically on first load
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PAIR);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.privateKey && parsed.publicKey) {
          setKeypair(parsed);
        } else {
          const fresh = generateKeyPair();
          localStorage.setItem(STORAGE_KEY_PAIR, JSON.stringify(fresh));
          setKeypair(fresh);
        }
      } else {
        const fresh = generateKeyPair();
        localStorage.setItem(STORAGE_KEY_PAIR, JSON.stringify(fresh));
        setKeypair(fresh);
      }

      const storedMode = localStorage.getItem(STORAGE_SIGNED_MODE);
      if (storedMode !== null) {
        setIsSignedModeState(storedMode === "true");
      }

      const storedProfile = localStorage.getItem(STORAGE_PROFILE);
      if (storedProfile) {
        try {
          const p = JSON.parse(storedProfile);
          if (p.name) setProfileName(p.name);
          if (p.bio) setProfileBio(p.bio);
          if (p.avatar) setProfileAvatar(p.avatar);
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.error("Failed to load identity from localStorage:", e);
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const setIsSignedMode = useCallback((val: boolean) => {
    setIsSignedModeState(val);
    try {
      localStorage.setItem(STORAGE_SIGNED_MODE, String(val));
    } catch {
      // ignore
    }
  }, []);

  const generateNewKey = useCallback((): KeyPair => {
    const fresh = generateKeyPair();
    try {
      localStorage.setItem(STORAGE_KEY_PAIR, JSON.stringify(fresh));
    } catch {
      // ignore
    }
    setKeypair(fresh);
    toast.success("Generated new cryptographic keypair");
    return fresh;
  }, []);

  const importPrivateKey = useCallback((hex: string): boolean => {
    const clean = hex.trim().replace(/^0x/, "");
    if (!isValidPrivateKey(clean)) {
      toast.error("Invalid Ed25519 private key. Must be a 64-character hex string.");
      return false;
    }
    try {
      const pubkey = getPublicKeyFromPrivateKey(clean);
      const kp: KeyPair = {
        privateKey: clean,
        publicKey: pubkey,
      };
      localStorage.setItem(STORAGE_KEY_PAIR, JSON.stringify(kp));
      setKeypair(kp);
      toast.success("Imported private key successfully");
      return true;
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`);
      return false;
    }
  }, []);

  const clearKey = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_PAIR);
    } catch {
      // ignore
    }
    setKeypair(null);
  }, []);

  const updateLocalProfile = useCallback(
    (name: string, bio: string, avatar: string) => {
      setProfileName(name);
      setProfileBio(bio);
      setProfileAvatar(avatar);
      try {
        localStorage.setItem(
          STORAGE_PROFILE,
          JSON.stringify({ name, bio, avatar })
        );
      } catch {
        // ignore
      }
    },
    []
  );

  // Email auth methods
  const sendEmailCode = useCallback(async (email: string) => {
    if (!email || !email.includes("@")) {
      throw new Error("Valid email is required");
    }
    await db.auth.sendMagicCode({ email: email.trim().toLowerCase() });
    toast.success("Verification code sent to your email");
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    if (!email || !code) {
      throw new Error("Email and code are required");
    }
    await db.auth.signInWithMagicCode({
      email: email.trim().toLowerCase(),
      code: code.trim(),
    });
    toast.success("Signed in with email");
  }, []);

  const signOutEmail = useCallback(async () => {
    await db.auth.signOut();
    toast.info("Signed out from email backup account");
  }, []);

  const saveKeyToAccount = useCallback(async () => {
    if (!authUser) {
      throw new Error("Please sign in with email first");
    }
    if (!keypair) {
      throw new Error("No local keypair to backup");
    }

    const keyId = cloudUserKey?.id || id();
    const now = Date.now();

    await db.transact([
      db.tx.userKeys[keyId]
        .update({
          pubkey: keypair.publicKey,
          privateKey: keypair.privateKey,
          updatedAt: now,
          createdAt: cloudUserKey?.createdAt || now,
        })
        .link({ user: authUser.id }),
    ]);

    toast.success("Private key backed up to your account");
  }, [authUser, keypair, cloudUserKey]);

  const restoreKeyFromAccount = useCallback(async () => {
    if (!cloudUserKey?.privateKey || !cloudUserKey?.pubkey) {
      throw new Error("No backed up key found on this account");
    }
    const kp: KeyPair = {
      privateKey: cloudUserKey.privateKey,
      publicKey: cloudUserKey.pubkey,
    };
    localStorage.setItem(STORAGE_KEY_PAIR, JSON.stringify(kp));
    setKeypair(kp);
    toast.success("Restored private key from your account");
  }, [cloudUserKey]);

  return (
    <IdentityContext.Provider
      value={{
        keypair,
        isSignedMode,
        setIsSignedMode,
        profileName,
        profileBio,
        profileAvatar,
        isInitialized,
        generateNewKey,
        importPrivateKey,
        clearKey,
        updateLocalProfile,
        authUser,
        authLoading,
        sendEmailCode,
        verifyEmailCode,
        signOutEmail,
        saveKeyToAccount,
        hasCloudKey,
        cloudKeyPubkey,
        restoreKeyFromAccount,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return ctx;
}
