const mockAddChild = jest.fn();
const mockLoadProfiles = jest.fn();
const mockRequestUpgrade = jest.fn();
const mockReloadDrawings = jest.fn();
const mockReplayOnboarding = jest.fn();
let mockUuid = 0;
let mockCapabilities: import("@/subscription/access").Capabilities;

jest.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${(mockUuid += 1)}`,
}));

jest.mock("@/auth/supabase", () => ({
  getSupabaseClient: () => ({ auth: { updateUser: jest.fn(async () => ({ error: null })) } }),
}));

jest.mock("@/database", () => ({
  addBukiChild: (...args: unknown[]) => mockAddChild(...args),
  editBukiChild: jest.fn(),
  finishBukiOnboarding: jest.fn(),
  loadBukiProfiles: (...args: unknown[]) => mockLoadProfiles(...args),
  removeBukiChild: jest.fn(),
  reorderBukiChildren: jest.fn(),
  replayBukiOnboarding: (...args: unknown[]) => mockReplayOnboarding(...args),
  selectBukiChild: jest.fn(),
}));

jest.mock("@/store/drawings", () => ({
  useDrawings: {
    getState: () => ({
      pads: [],
      reloadForAccount: mockReloadDrawings,
      removeChildContent: jest.fn(),
      setActiveChild: jest.fn(),
    }),
  },
}));

jest.mock("@/store/membership", () => ({
  currentCapabilities: () => mockCapabilities,
  useMembership: { getState: () => ({ requestUpgrade: mockRequestUpgrade }) },
}));

import { ContentLimitReachedError, resolveCapabilities } from "@/subscription/access";
import type { ChildProfile } from "./profiles";
import { useProfiles } from "./profiles";

describe("child profile limits", () => {
  let persistedChildren: ChildProfile[];

  beforeEach(() => {
    persistedChildren = [];
    mockUuid = 0;
    mockCapabilities = resolveCapabilities("free");
    mockRequestUpgrade.mockReset();
    mockReloadDrawings.mockReset().mockResolvedValue(undefined);
    mockReplayOnboarding.mockReset().mockResolvedValue(undefined);
    mockLoadProfiles.mockImplementation(async () => ({
      ownerId: "adult-a",
      children: [...persistedChildren],
      activeChildId: persistedChildren[0]?.id ?? null,
      onboardingComplete: true,
    }));
    mockAddChild.mockReset().mockImplementation(async (child, _defaultPadId, limits) => {
      await Promise.resolve();
      if (limits && persistedChildren.length >= limits.maxChildren) {
        throw new ContentLimitReachedError("children");
      }
      persistedChildren.push({
        ...child,
        ownerId: "adult-a",
        sortOrder: persistedChildren.length,
        createdAt: Date.now(),
      });
    });
    useProfiles.setState({
      hydrated: true,
      busy: false,
      ownerId: "adult-a",
      children: [],
      activeChildId: null,
      onboardingComplete: true,
      error: null,
    });
  });

  it("atomically blocks concurrent creation beyond the Free child limit", async () => {
    const results = await Promise.all([
      useProfiles.getState().createChild({ name: "First", avatarColor: "#111111" }),
      useProfiles.getState().createChild({ name: "Second", avatarColor: "#222222" }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(persistedChildren).toHaveLength(1);
    expect(useProfiles.getState().children).toHaveLength(1);
    expect(mockRequestUpgrade).toHaveBeenCalledWith("children", "child_limit");
  });

  it("allows Pro to create multiple child profiles", async () => {
    mockCapabilities = resolveCapabilities("pro");

    const results = await Promise.all([
      useProfiles.getState().createChild({ name: "First", avatarColor: "#111111" }),
      useProfiles.getState().createChild({ name: "Second", avatarColor: "#222222" }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(2);
    expect(persistedChildren).toHaveLength(2);
    expect(mockRequestUpgrade).not.toHaveBeenCalled();
  });

  it("keeps onboarding complete and surfaces an error when replay persistence fails", async () => {
    mockReplayOnboarding.mockRejectedValueOnce(new Error("Replay failed"));

    await useProfiles.getState().replayOnboarding();

    expect(useProfiles.getState()).toMatchObject({
      busy: false,
      onboardingComplete: true,
      error: "Replay failed",
    });
  });
});
