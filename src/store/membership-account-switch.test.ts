const mockLoadEntitlement = jest.fn();
const mockConnectRevenueCat = jest.fn();
const mockDisconnectRevenueCat = jest.fn();
const mockRestoreRevenueCat = jest.fn();
const mockVerifyServerEntitlement = jest.fn();

jest.mock("@/database", () => ({
  loadBukiEntitlement: (...args: unknown[]) => mockLoadEntitlement(...args),
  saveBukiEntitlement: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/subscription/revenuecat-client", () => ({
  connectRevenueCatUser: (...args: unknown[]) => mockConnectRevenueCat(...args),
  disconnectRevenueCatUser: (...args: unknown[]) => mockDisconnectRevenueCat(...args),
  refreshRevenueCatCustomerInfo: jest.fn(),
  restoreRevenueCatPurchases: (...args: unknown[]) => mockRestoreRevenueCat(...args),
}));

jest.mock("@/subscription/server-entitlement", () => ({
  verifyServerEntitlement: (...args: unknown[]) => mockVerifyServerEntitlement(...args),
}));
jest.mock("@/analytics/client", () => ({ trackAnalyticsEvent: jest.fn() }));

import {
  EMPTY_ENTITLEMENT,
  GRACE_CACHE_MAX_AGE_MS,
  resolveCapabilities,
} from "@/subscription/access";
import { useMembership } from "./membership";

function customerInfo(verification: "VERIFIED" | "FAILED" = "VERIFIED") {
  const entitlement = {
    isActive: true,
    productIdentifier: "buki_pro_monthly",
    expirationDate: "2099-08-08T00:00:00.000Z",
    willRenew: true,
    billingIssueDetectedAt: null,
    periodType: "NORMAL",
    verification,
  };
  return {
    requestDate: "2026-08-09T00:00:00.000Z",
    managementURL: null,
    entitlements: {
      verification,
      active: { pro: entitlement },
      all: { pro: entitlement },
    },
  } as never;
}

describe("membership account switching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMembership.getState().resetMembership();
    mockConnectRevenueCat.mockResolvedValue(null);
    mockDisconnectRevenueCat.mockResolvedValue(undefined);
    mockRestoreRevenueCat.mockReset();
    mockVerifyServerEntitlement.mockReset().mockResolvedValue({
      hadPro: false,
      retention: {
        status: "none",
        readOnlySince: null,
        deleteAfter: null,
        uploadsEnabled: true,
      },
    });
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

  it("does not report a verification-failed purchase as applied", async () => {
    useMembership.setState({ ownerId: "adult-a" });
    useMembership.setState({ purchaseIdentityReady: true });

    await expect(
      useMembership.getState().acceptCustomerInfo(customerInfo("FAILED"), "adult-a"),
    ).resolves.toBe(false);

    expect(useMembership.getState()).toMatchObject({ ownerId: "adult-a", tier: "free" });
  });

  it("does not finish a restore after the adult account changes", async () => {
    let resolveRestore: (value: ReturnType<typeof customerInfo>) => void = () => {};
    mockRestoreRevenueCat.mockReturnValue(new Promise((resolve) => {
      resolveRestore = resolve;
    }));
    useMembership.setState({ ownerId: "adult-a" });

    const restore = useMembership.getState().restorePurchases("account_center");
    useMembership.setState({ ownerId: "adult-b" });
    resolveRestore(customerInfo());

    await expect(restore).resolves.toBe("failed");
    expect(useMembership.getState().ownerId).toBe("adult-b");
  });

  it("keeps fresh grace access but expires a stale offline grace cache", async () => {
    jest.useFakeTimers();
    try {
      const now = Date.parse("2026-08-09T12:00:00.000Z");
      jest.setSystemTime(now);
      useMembership.setState({ ownerId: "adult-a" });

      useMembership.getState().setEntitlement({
        product: "monthly",
        status: "grace",
        expiresAt: new Date(now - 1_000).toISOString(),
        willRenew: false,
        checkedAt: new Date(now).toISOString(),
      });
      expect(useMembership.getState().tier).toBe("pro");

      await jest.advanceTimersByTimeAsync(GRACE_CACHE_MAX_AGE_MS + 1_000);
      expect(useMembership.getState()).toMatchObject({
        tier: "free",
        entitlement: { status: "unknown" },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
