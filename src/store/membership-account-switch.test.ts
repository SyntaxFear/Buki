const mockLoadEntitlement = jest.fn();
const mockConnectRevenueCat = jest.fn();
const mockDisconnectRevenueCat = jest.fn();

jest.mock("@/database", () => ({
  loadBukiEntitlement: (...args: unknown[]) => mockLoadEntitlement(...args),
  saveBukiEntitlement: jest.fn(),
}));

jest.mock("@/subscription/revenuecat-client", () => ({
  connectRevenueCatUser: (...args: unknown[]) => mockConnectRevenueCat(...args),
  disconnectRevenueCatUser: (...args: unknown[]) => mockDisconnectRevenueCat(...args),
  refreshRevenueCatCustomerInfo: jest.fn(),
  restoreRevenueCatPurchases: jest.fn(),
}));

jest.mock("@/subscription/server-entitlement", () => ({ verifyServerEntitlement: jest.fn() }));
jest.mock("@/analytics/client", () => ({ trackAnalyticsEvent: jest.fn() }));

import { EMPTY_ENTITLEMENT, resolveCapabilities } from "@/subscription/access";
import { useMembership } from "./membership";

describe("membership account switching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMembership.getState().resetMembership();
    mockConnectRevenueCat.mockResolvedValue(null);
    mockDisconnectRevenueCat.mockResolvedValue(undefined);
  });

  afterEach(() => {
    useMembership.getState().resetMembership();
  });

  it("drops the previous Pro tier before loading the next adult account", async () => {
    let resolveLoad: (value: null) => void = () => {};
    mockLoadEntitlement.mockReturnValue(
      new Promise<null>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    useMembership.setState({
      ownerId: "adult-a",
      hydrated: true,
      tier: "pro",
      entitlement: { ...EMPTY_ENTITLEMENT, status: "active", product: "yearly" },
      capabilities: resolveCapabilities("pro"),
    });

    const initialization = useMembership.getState().initializeForUser("adult-b");

    expect(useMembership.getState()).toMatchObject({
      ownerId: "adult-b",
      hydrated: false,
      loading: true,
      tier: "free",
      entitlement: EMPTY_ENTITLEMENT,
    });
    resolveLoad(null);
    await initialization;
  });

  it("resets local access before surfacing a RevenueCat disconnect failure", async () => {
    mockDisconnectRevenueCat.mockRejectedValue(new Error("logout failed"));
    useMembership.setState({
      ownerId: "adult-a",
      hydrated: true,
      tier: "pro",
      entitlement: { ...EMPTY_ENTITLEMENT, status: "active", product: "monthly" },
      capabilities: resolveCapabilities("pro"),
    });

    const disconnection = useMembership.getState().disconnectUser();

    expect(useMembership.getState()).toMatchObject({ ownerId: null, tier: "free" });
    await expect(disconnection).rejects.toThrow("logout failed");
  });

  it("keeps a time-valid cached entitlement while the device is temporarily offline", async () => {
    mockLoadEntitlement.mockResolvedValue({
      product: "yearly",
      status: "active",
      expiresAt: "2099-08-08T00:00:00.000Z",
      willRenew: true,
      checkedAt: "2026-08-08T00:00:00.000Z",
    });
    mockConnectRevenueCat.mockRejectedValue(new Error("subscription unavailable"));

    await useMembership.getState().initializeForUser("adult-a");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(useMembership.getState()).toMatchObject({
      ownerId: "adult-a",
      tier: "pro",
      error: "subscription unavailable",
    });
  });

  it("does not apply purchase customer info after the adult account changes", async () => {
    useMembership.setState({ ownerId: "adult-b" });

    await expect(
      useMembership.getState().acceptCustomerInfo({} as never, "adult-a"),
    ).resolves.toBe(false);

    expect(useMembership.getState().ownerId).toBe("adult-b");
  });
});
