const mockAuthListener = jest.fn();
const mockGetSession = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSignInWithOtp = jest.fn();
const mockSignOut = jest.fn();
const mockAppleSignIn = jest.fn();
const mockRandomUUID = jest.fn();

const mockDatabase = {
  activateBukiAccount: jest.fn(),
  clearBukiAccount: jest.fn(),
  deleteBukiLocalAccount: jest.fn(),
  editAdultProfile: jest.fn(),
  flushLibraryWrites: jest.fn(),
  loadAdultProfile: jest.fn(),
};

const mockMembershipState = {
  initializeForUser: jest.fn(),
  disconnectUser: jest.fn(),
  resetMembership: jest.fn(),
};

const mockDrawingsState = {
  resetForAccountSwitch: jest.fn(),
  hydrate: jest.fn(),
  reloadForAccount: jest.fn(),
};

const mockProfilesState = {
  resetForAccountSwitch: jest.fn(),
  hydrate: jest.fn(),
  reloadForAccount: jest.fn(),
};

const mockPreferencesState = {
  resetForAccountSwitch: jest.fn(),
  hydrate: jest.fn(),
};

const mockSyncState = {
  disconnectUser: jest.fn(),
  initializeForUser: jest.fn(),
};

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: (...args: unknown[]) => mockAppleSignIn(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock("expo-auth-session", () => ({ makeRedirectUri: () => "buki://auth/callback" }));

jest.mock("expo-crypto", () => ({
  randomUUID: () => mockRandomUUID(),
  digestStringAsync: jest.fn(async () => "hashed-nonce"),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@/database", () => ({
  activateBukiAccount: (...args: unknown[]) => mockDatabase.activateBukiAccount(...args),
  clearBukiAccount: (...args: unknown[]) => mockDatabase.clearBukiAccount(...args),
  deleteBukiLocalAccount: (...args: unknown[]) => mockDatabase.deleteBukiLocalAccount(...args),
  editAdultProfile: (...args: unknown[]) => mockDatabase.editAdultProfile(...args),
  flushLibraryWrites: (...args: unknown[]) => mockDatabase.flushLibraryWrites(...args),
  loadAdultProfile: (...args: unknown[]) => mockDatabase.loadAdultProfile(...args),
}));
jest.mock("@/store/membership", () => ({
  useMembership: { getState: () => mockMembershipState },
}));
jest.mock("@/store/drawings", () => ({ useDrawings: { getState: () => mockDrawingsState } }));
jest.mock("@/store/profiles", () => ({ useProfiles: { getState: () => mockProfilesState } }));
jest.mock("@/store/preferences", () => ({
  usePreferences: { getState: () => mockPreferencesState },
}));
jest.mock("@/store/sync", () => ({ useCloudSync: { getState: () => mockSyncState } }));
jest.mock("@/privacy/account-data", () => ({ requestBukiAccountDeletion: jest.fn() }));
jest.mock("@/analytics/client", () => ({
  disconnectAnalytics: jest.fn(),
  initializeAnalytics: jest.fn(),
}));

const mockSupabaseClient = {
  auth: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    onAuthStateChange: (...args: unknown[]) => mockAuthListener(...args),
    signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
    verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    updateUser: jest.fn(async () => ({ error: null })),
    signInWithOAuth: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    setSession: jest.fn(),
  },
};

jest.mock("@/auth/supabase", () => ({ getSupabaseClient: () => mockSupabaseClient }));

import type { Session } from "@supabase/supabase-js";
import { resetAuthStateForTests, useAuth } from "./auth";

function session(userId: string, accessToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${accessToken}`,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: userId,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-08-08T00:00:00.000Z",
      email: `${userId}@example.com`,
    },
  } as Session;
}

async function flushAuthApplications() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("authentication state boundaries", () => {
  beforeEach(() => {
    for (const mock of [
      mockAuthListener,
      mockGetSession,
      mockSignInWithIdToken,
      mockVerifyOtp,
      mockSignInWithOtp,
      mockSignOut,
      mockAppleSignIn,
      mockRandomUUID,
      ...Object.values(mockDatabase),
      ...Object.values(mockMembershipState),
      ...Object.values(mockDrawingsState),
      ...Object.values(mockProfilesState),
      ...Object.values(mockPreferencesState),
      ...Object.values(mockSyncState),
    ]) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    resetAuthStateForTests();
    mockDatabase.activateBukiAccount.mockResolvedValue(undefined);
    mockDatabase.clearBukiAccount.mockResolvedValue(undefined);
    mockDatabase.flushLibraryWrites.mockResolvedValue(undefined);
    mockDatabase.loadAdultProfile.mockImplementation(async (id: string) => ({
      id,
      displayName: id,
      email: `${id}@example.com`,
      avatarUri: null,
    }));
    mockMembershipState.initializeForUser.mockResolvedValue(undefined);
    mockMembershipState.disconnectUser.mockResolvedValue(undefined);
    mockDrawingsState.hydrate.mockResolvedValue(undefined);
    mockDrawingsState.reloadForAccount.mockResolvedValue(undefined);
    mockProfilesState.hydrate.mockResolvedValue(undefined);
    mockProfilesState.reloadForAccount.mockResolvedValue(undefined);
    mockPreferencesState.hydrate.mockResolvedValue(undefined);
    mockSyncState.disconnectUser.mockResolvedValue(undefined);
    mockSyncState.initializeForUser.mockResolvedValue(undefined);
    mockAuthListener.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("installs the listener and retries after a transient getSession failure", async () => {
    const next = session("adult-a", "token-a");
    mockGetSession
      .mockResolvedValueOnce({ data: { session: null }, error: new Error("offline") })
      .mockResolvedValueOnce({ data: { session: next }, error: null });

    await useAuth.getState().initialize();
    expect(useAuth.getState()).toMatchObject({ hydrated: true, status: "signedOut" });
    expect(mockAuthListener).toHaveBeenCalledTimes(1);

    await useAuth.getState().initialize();
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", session: next });
  });

  it("fails closed and clears account-scoped state when session initialization fails", async () => {
    const previous = session("adult-a", "token-a");
    useAuth.setState({
      hydrated: false,
      status: "signedIn",
      session: previous,
      user: previous.user,
      profile: {
        id: previous.user.id,
        displayName: "Adult A",
        email: previous.user.email ?? null,
        avatarUri: null,
      },
      otpEmail: "adult-a@example.com",
    });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: new Error("offline") });

    await useAuth.getState().initialize();

    expect(mockSyncState.disconnectUser).toHaveBeenCalledTimes(1);
    expect(mockMembershipState.disconnectUser).toHaveBeenCalledTimes(1);
    expect(mockMembershipState.resetMembership).toHaveBeenCalledTimes(1);
    expect(mockDatabase.clearBukiAccount).toHaveBeenCalledTimes(1);
    expect(mockDrawingsState.resetForAccountSwitch).toHaveBeenCalledTimes(1);
    expect(mockProfilesState.resetForAccountSwitch).toHaveBeenCalledTimes(1);
    expect(mockPreferencesState.resetForAccountSwitch).toHaveBeenCalledTimes(1);
    expect(mockDrawingsState.hydrate).toHaveBeenCalledTimes(1);
    expect(mockProfilesState.hydrate).toHaveBeenCalledTimes(1);
    expect(mockPreferencesState.hydrate).toHaveBeenCalledTimes(1);
    expect(useAuth.getState()).toMatchObject({
      hydrated: true,
      busy: false,
      status: "signedOut",
      session: null,
      user: null,
      profile: null,
      otpEmail: null,
      error: "offline",
    });
  });

  it("does not rehydrate a previous account if clearing its local owner fails", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: new Error("offline") });
    mockDatabase.clearBukiAccount.mockRejectedValue(new Error("database unavailable"));

    await useAuth.getState().initialize();

    expect(mockDrawingsState.resetForAccountSwitch).toHaveBeenCalledTimes(1);
    expect(mockProfilesState.resetForAccountSwitch).toHaveBeenCalledTimes(1);
    expect(mockPreferencesState.resetForAccountSwitch).toHaveBeenCalledTimes(1);
    expect(mockDrawingsState.hydrate).not.toHaveBeenCalled();
    expect(mockProfilesState.hydrate).not.toHaveBeenCalled();
    expect(mockPreferencesState.hydrate).not.toHaveBeenCalled();
    expect(useAuth.getState()).toMatchObject({
      status: "signedOut",
      session: null,
      user: null,
      profile: null,
    });
    expect(useAuth.getState().error).toContain("could not fully clear");
  });

  it("retries listener registration when the first registration throws", async () => {
    mockAuthListener
      .mockImplementationOnce(() => {
        throw new Error("listener unavailable");
      })
      .mockReturnValueOnce({ data: { subscription: { unsubscribe: jest.fn() } } });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await useAuth.getState().initialize();
    expect(useAuth.getState()).toMatchObject({ hydrated: true, status: "signedOut" });

    await useAuth.getState().initialize();
    expect(mockAuthListener).toHaveBeenCalledTimes(2);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("accepts a refreshed token for the same user without reloading account data", async () => {
    const initial = session("adult-a", "token-a");
    const refreshed = session("adult-a", "token-b");
    mockGetSession.mockResolvedValue({ data: { session: initial }, error: null });
    await useAuth.getState().initialize();
    const listener = mockAuthListener.mock.calls[0][0] as (
      event: string,
      next: Session | null,
    ) => void;
    mockDatabase.activateBukiAccount.mockClear();

    listener("TOKEN_REFRESHED", refreshed);
    await flushAuthApplications();
    expect(useAuth.getState().session?.access_token).toBe("token-b");
    expect(mockDatabase.activateBukiAccount).not.toHaveBeenCalled();
  });

  it("tears down account-scoped state before applying a different adult session", async () => {
    const adultA = session("adult-a", "token-a");
    const adultB = session("adult-b", "token-b");
    mockGetSession.mockResolvedValue({ data: { session: adultA }, error: null });
    await useAuth.getState().initialize();
    const listener = mockAuthListener.mock.calls[0][0] as (
      event: string,
      next: Session | null,
    ) => void;
    jest.clearAllMocks();
    mockDatabase.activateBukiAccount.mockResolvedValue(undefined);
    mockDatabase.clearBukiAccount.mockResolvedValue(undefined);
    mockDatabase.flushLibraryWrites.mockResolvedValue(undefined);
    mockDatabase.loadAdultProfile.mockResolvedValue({
      id: "adult-b",
      displayName: "adult-b",
      email: "adult-b@example.com",
      avatarUri: null,
    });
    mockMembershipState.disconnectUser.mockResolvedValue(undefined);
    mockMembershipState.initializeForUser.mockResolvedValue(undefined);
    mockDrawingsState.reloadForAccount.mockResolvedValue(undefined);
    mockProfilesState.reloadForAccount.mockResolvedValue(undefined);
    mockPreferencesState.hydrate.mockResolvedValue(undefined);
    mockSyncState.initializeForUser.mockResolvedValue(undefined);

    listener("SIGNED_IN", adultB);
    await flushAuthApplications();

    expect(mockDatabase.flushLibraryWrites).toHaveBeenCalledTimes(1);
    expect(mockMembershipState.disconnectUser).toHaveBeenCalledTimes(1);
    expect(mockDrawingsState.resetForAccountSwitch).toHaveBeenCalledTimes(1);
    expect(mockDatabase.activateBukiAccount).toHaveBeenCalledWith(adultB.user);
    expect(mockMembershipState.initializeForUser).toHaveBeenCalledWith("adult-b");
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", user: adultB.user });
  });

  it("requires Apple to return the request state before accepting its token", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRandomUUID.mockReturnValueOnce("raw-nonce").mockReturnValueOnce("request-state");
    mockAppleSignIn.mockResolvedValue({
      state: "wrong-state",
      identityToken: "apple-token",
      fullName: null,
    });

    const completed = await useAuth.getState().signInWithApple();

    expect(completed).toBe(false);
    expect(mockAppleSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: "hashed-nonce", state: "request-state" }),
    );
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    expect(useAuth.getState().error).toContain("could not be verified");
  });

  it("clears the OTP context on sign-out", async () => {
    useAuth.setState({ otpEmail: "parent@example.com" });
    await useAuth.getState().signOut();
    expect(mockSyncState.disconnectUser).toHaveBeenCalledTimes(2);
    expect(useAuth.getState().otpEmail).toBeNull();
  });

  it("waits for cloud synchronization to disconnect before signing out remotely", async () => {
    let finishDisconnect!: () => void;
    mockSyncState.disconnectUser.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishDisconnect = resolve;
    }));

    const signingOut = useAuth.getState().signOut();
    await Promise.resolve();

    expect(mockSignOut).not.toHaveBeenCalled();
    finishDisconnect();
    await signingOut;

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("reconnects cloud synchronization when remote sign-out fails", async () => {
    const current = session("adult-a", "token-a");
    useAuth.setState({
      hydrated: true,
      status: "signedIn",
      session: current,
      user: current.user,
    });
    mockSignOut.mockResolvedValueOnce({ error: new Error("offline") });

    await useAuth.getState().signOut();

    expect(mockSyncState.initializeForUser).toHaveBeenCalledWith("adult-a");
    expect(useAuth.getState().error).toBe("offline");
  });
});
