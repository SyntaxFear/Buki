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
});
