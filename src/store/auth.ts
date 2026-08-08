import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { create } from "zustand";
import type { EmailOtpType, Session, User } from "@supabase/supabase-js";

import {
  activateBukiAccount,
  clearBukiAccount,
  deleteBukiLocalAccount,
  editAdultProfile,
  flushLibraryWrites,
  loadAdultProfile,
} from "@/database";
import { getSupabaseClient } from "@/auth/supabase";
import { parseOAuthCallback } from "@/auth/oauth";
import { useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { useProfiles } from "@/store/profiles";
import { usePreferences } from "@/store/preferences";
import { useCloudSync } from "@/store/sync";
import { requestBukiAccountDeletion } from "@/privacy/account-data";
import { disconnectAnalytics, initializeAnalytics } from "@/analytics/client";

WebBrowser.maybeCompleteAuthSession();

export interface AdultProfile {
  id: string;
  displayName: string;
  email: string | null;
  avatarUri: string | null;
}

type AuthStatus = "initializing" | "signedOut" | "signedIn";

interface AuthState {
  hydrated: boolean;
  busy: boolean;
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: AdultProfile | null;
  otpEmail: string | null;
  error: string | null;
  initialize: () => Promise<void>;
  sendEmailOtp: (email: string) => Promise<boolean>;
  verifyEmailOtp: (email: string, token: string) => Promise<boolean>;
  resetEmailOtp: () => void;
  completeAuthCallback: (url: string) => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: { displayName: string; avatarUri: string | null }) => Promise<boolean>;
  clearLocalData: () => Promise<boolean>;
  deleteAccount: () => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const redirectTo = makeRedirectUri({ scheme: "buki", path: "auth/callback" });
let initialization: Promise<void> | null = null;
let initializationSucceeded = false;
let listenerInstalled = false;
let lastAppliedUserId: string | null | undefined;
let sessionApplication: Promise<void> = Promise.resolve();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function resetAccountState(hydrateSignedOut: boolean): Promise<unknown> {
  disconnectAnalytics();
  useCloudSync.getState().disconnectUser();
  let membershipError: unknown = null;
  try {
    await useMembership.getState().disconnectUser();
  } catch (error) {
    membershipError = error;
    useMembership.getState().resetMembership();
  }
  await clearBukiAccount();
  useDrawings.getState().resetForAccountSwitch();
  useProfiles.getState().resetForAccountSwitch();
  usePreferences.getState().resetForAccountSwitch();
  if (hydrateSignedOut) {
    await Promise.all([
      useDrawings.getState().hydrate(),
      useProfiles.getState().hydrate(),
      usePreferences.getState().hydrate(),
    ]);
  }
  return membershipError;
}

async function applySessionNow(session: Session | null): Promise<void> {
  if (!session?.user) {
    const membershipError = await resetAccountState(true);
    useAuth.setState({
      hydrated: true,
      status: "signedOut",
      session: null,
      user: null,
      profile: null,
      otpEmail: null,
    });
    if (membershipError) {
      throw new Error(
        "Buki signed out locally, but could not clear the previous purchase identity. Try again before signing in to another account.",
      );
    }
    return;
  }

  const previousUserId = useAuth.getState().user?.id ?? lastAppliedUserId ?? null;
  if (previousUserId && previousUserId !== session.user.id) {
    await flushLibraryWrites();
    await resetAccountState(false);
  }
  await activateBukiAccount(session.user);
  const profile = await loadAdultProfile(session.user.id);
  useAuth.setState({
    hydrated: true,
    status: "signedIn",
    session,
    user: session.user,
    profile,
    otpEmail: null,
    error: null,
  });
  initializeAnalytics(session.user.id);
  await useMembership.getState().initializeForUser(session.user.id);
  await useDrawings.getState().reloadForAccount();
  await useProfiles.getState().reloadForAccount();
  usePreferences.getState().resetForAccountSwitch();
  await usePreferences.getState().hydrate();
  await useCloudSync.getState().initializeForUser(session.user.id);
}

async function applySession(session: Session | null): Promise<void> {
  const nextUserId = session?.user.id ?? null;
  const run = sessionApplication.catch(() => {}).then(async () => {
    if (lastAppliedUserId === nextUserId && useAuth.getState().hydrated) {
      if (session?.user) {
        useAuth.setState({
          status: "signedIn",
          session,
          user: session.user,
          otpEmail: null,
          error: null,
        });
      } else {
        useAuth.setState({
          status: "signedOut",
          session: null,
          user: null,
          profile: null,
          otpEmail: null,
        });
      }
      return;
    }
    await applySessionNow(session);
    lastAppliedUserId = nextUserId;
  });
  sessionApplication = run;
  await run;
}

async function completeOAuth(url: string): Promise<Session | null> {
  const client = getSupabaseClient();
  const callback = parseOAuthCallback(url);
  if (callback.error) throw new Error(callback.error);
  if (callback.code) {
    const { data, error } = await client.auth.exchangeCodeForSession(callback.code);
    if (error) throw error;
    return data.session;
  }
  if (callback.tokenHash && callback.type) {
    const { data, error } = await client.auth.verifyOtp({
      token_hash: callback.tokenHash,
      type: callback.type as EmailOtpType,
    });
    if (error) throw error;
    return data.session;
  }
  if (callback.accessToken && callback.refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw error;
    return data.session;
  }
  throw new Error("Authentication did not return a usable session.");
}

export const useAuth = create<AuthState>((set, get) => ({
  hydrated: false,
  busy: false,
  status: "initializing",
  session: null,
  user: null,
  profile: null,
  otpEmail: null,
  error: null,

  initialize: async () => {
    if (get().hydrated && initializationSucceeded) return;
    if (!initialization) {
      const attempt = (async () => {
        try {
          const client = getSupabaseClient();
          if (!listenerInstalled) {
            client.auth.onAuthStateChange((_event, nextSession) => {
              void applySession(nextSession)
                .then(() => {
                  initializationSucceeded = true;
                })
                .catch((listenerError) => {
                  useAuth.setState({ error: errorMessage(listenerError) });
                });
            });
            listenerInstalled = true;
          }
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          await applySession(data.session);
          initializationSucceeded = true;
        } catch (error) {
          initializationSucceeded = false;
          useMembership.getState().resetMembership();
          set({
            hydrated: true,
            status: "signedOut",
            error: errorMessage(error),
          });
        }
      })();
      initialization = attempt;
    }
    const currentInitialization = initialization;
    try {
      await currentInitialization;
    } finally {
      if (initialization === currentInitialization) initialization = null;
    }
  },

  sendEmailOtp: async (email) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    set({ busy: true, error: null });
    try {
      const { error } = await getSupabaseClient().auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      set({ otpEmail: normalized });
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  verifyEmailOtp: async (email, token) => {
    set({ busy: true, error: null });
    try {
      const { data, error } = await getSupabaseClient().auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: token.trim(),
        type: "email",
      });
      if (error) throw error;
      await applySession(data.session);
      set({ otpEmail: null });
      return Boolean(data.session);
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  resetEmailOtp: () => set({ otpEmail: null, error: null }),

  completeAuthCallback: async (url) => {
    set({ busy: true, error: null });
    try {
      const session = await completeOAuth(url);
      await applySession(session);
      return Boolean(session);
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  signInWithApple: async () => {
    set({ busy: true, error: null });
    try {
      if (!(await AppleAuthentication.isAvailableAsync())) {
        throw new Error("Sign in with Apple is unavailable on this device.");
      }
      const rawNonce = Crypto.randomUUID();
      const requestState = Crypto.randomUUID();
      const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
        state: requestState,
      });
      if (credential.state !== requestState) {
        throw new Error("Apple sign-in response could not be verified.");
      }
      if (!credential.identityToken) throw new Error("Apple did not return an identity token.");
      const { data, error } = await getSupabaseClient().auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;
      const appleName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ");
      if (appleName && data.user) {
        await getSupabaseClient().auth.updateUser({ data: { full_name: appleName } });
      }
      await applySession(data.session);
      return Boolean(data.session);
    } catch (error) {
      if ((error as { code?: string }).code !== "ERR_REQUEST_CANCELED") {
        set({ error: errorMessage(error) });
      }
      return false;
    } finally {
      set({ busy: false });
    }
  },

  signInWithGoogle: async () => {
    set({ busy: true, error: null });
    try {
      const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Google sign-in URL was not created.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") return false;
      const session = await completeOAuth(result.url);
      await applySession(session);
      return Boolean(session);
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user) return;
    const profile = await loadAdultProfile(user.id);
    set({ profile });
  },

  updateProfile: async (updates) => {
    const user = get().user;
    const displayName = updates.displayName.trim();
    if (!user || !displayName) return false;
    set({ busy: true, error: null });
    try {
      const { error } = await getSupabaseClient().auth.updateUser({
        data: { full_name: displayName, avatar_url: updates.avatarUri },
      });
      if (error) throw error;
      await editAdultProfile(user.id, { displayName, avatarUri: updates.avatarUri });
      const profile = await loadAdultProfile(user.id);
      set({ profile });
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  clearLocalData: async () => {
    const user = get().user;
    if (!user) return false;
    set({ busy: true, error: null });
    try {
      await useCloudSync.getState().pauseForPrivacyAction();
      await flushLibraryWrites();
      const cleanup = await deleteBukiLocalAccount(user.id);
      await getSupabaseClient().auth.signOut({ scope: "local" }).catch(() => {});
      lastAppliedUserId = undefined;
      await applySession(null);
      if (cleanup.failedFileCount > 0) {
        set({
          error: `Buki was cleared, but ${cleanup.failedFileCount} local file${cleanup.failedFileCount === 1 ? "" : "s"} could not be removed. Delete the app before giving this device to someone else.`,
        });
      }
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  deleteAccount: async () => {
    const user = get().user;
    if (!user) return false;
    let remoteDeleted = false;
    set({ busy: true, error: null });
    try {
      await useCloudSync.getState().pauseForPrivacyAction();
      await requestBukiAccountDeletion();
      remoteDeleted = true;
      await flushLibraryWrites();
      const cleanup = await deleteBukiLocalAccount(user.id);
      await getSupabaseClient().auth.signOut({ scope: "local" }).catch(() => {});
      lastAppliedUserId = undefined;
      await applySession(null);
      if (cleanup.failedFileCount > 0) {
        set({
          error: `Your Buki account was deleted, but ${cleanup.failedFileCount} local file${cleanup.failedFileCount === 1 ? "" : "s"} could not be removed. Delete Buki from this device before giving it to someone else.`,
        });
      }
      return true;
    } catch (error) {
      if (remoteDeleted) {
        await getSupabaseClient().auth.signOut({ scope: "local" }).catch(() => {});
        lastAppliedUserId = undefined;
        await applySession(null).catch(() => {});
        set({
          error: "Your Buki account was deleted, but some local files could not be removed. Delete Buki from this device before giving it to someone else.",
        });
        return true;
      }
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  signOut: async () => {
    set({ busy: true, error: null });
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      await applySession(null);
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  clearError: () => set({ error: null }),
}));

export function resetAuthStateForTests(): void {
  initialization = null;
  initializationSucceeded = false;
  listenerInstalled = false;
  lastAppliedUserId = undefined;
  sessionApplication = Promise.resolve();
  useAuth.setState({
    hydrated: false,
    busy: false,
    status: "initializing",
    session: null,
    user: null,
    profile: null,
    otpEmail: null,
    error: null,
  });
}
