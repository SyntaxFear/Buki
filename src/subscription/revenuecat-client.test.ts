const mockPurchases = {
  isConfigured: jest.fn(),
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  getAppUserID: jest.fn(),
  logOut: jest.fn(),
  logIn: jest.fn(),
  getCustomerInfo: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  removeCustomerInfoUpdateListener: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  ENTITLEMENT_VERIFICATION_MODE: { INFORMATIONAL: "informational" },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: "cancelled" },
  INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: "eligible" },
};

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    isConfigured: (...args: unknown[]) => mockPurchases.isConfigured(...args),
    configure: (...args: unknown[]) => mockPurchases.configure(...args),
    setLogLevel: (...args: unknown[]) => mockPurchases.setLogLevel(...args),
    getAppUserID: (...args: unknown[]) => mockPurchases.getAppUserID(...args),
    logOut: (...args: unknown[]) => mockPurchases.logOut(...args),
    logIn: (...args: unknown[]) => mockPurchases.logIn(...args),
    getCustomerInfo: (...args: unknown[]) => mockPurchases.getCustomerInfo(...args),
    addCustomerInfoUpdateListener: (...args: unknown[]) =>
      mockPurchases.addCustomerInfoUpdateListener(...args),
    removeCustomerInfoUpdateListener: (...args: unknown[]) =>
      mockPurchases.removeCustomerInfoUpdateListener(...args),
    purchasePackage: (...args: unknown[]) => mockPurchases.purchasePackage(...args),
    restorePurchases: (...args: unknown[]) => mockPurchases.restorePurchases(...args),
    ENTITLEMENT_VERIFICATION_MODE: { INFORMATIONAL: "informational" },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: "cancelled" },
    INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: "eligible" },
  },
  LOG_LEVEL: { DEBUG: "debug", WARN: "warn" },
}));
jest.mock("@/config/env", () => ({
  getPublicAppConfig: () => ({ revenueCatIosApiKey: "public_test_key" }),
}));

import {
  connectRevenueCatUser,
  disconnectRevenueCatUser,
  purchaseRevenueCatPackage,
  refreshRevenueCatCustomerInfo,
  restoreRevenueCatPurchases,
} from "./revenuecat-client";

describe("RevenueCat account identity cleanup", () => {
  beforeEach(() => {
    for (const mock of Object.values(mockPurchases)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    mockPurchases.isConfigured.mockResolvedValue(true);
    mockPurchases.getAppUserID.mockResolvedValue("adult-a");
  });

  it("retries transient logout failures before completing sign-out", async () => {
    mockPurchases.logOut
      .mockRejectedValueOnce(new Error("temporary"))
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({});

    await expect(disconnectRevenueCatUser()).resolves.toBeUndefined();
    expect(mockPurchases.logOut).toHaveBeenCalledTimes(3);
  });

  it("surfaces a persistent logout failure", async () => {
    mockPurchases.logOut.mockRejectedValue(new Error("logout failed"));

    await expect(disconnectRevenueCatUser()).rejects.toThrow("logout failed");
    expect(mockPurchases.logOut).toHaveBeenCalledTimes(3);
  });

  it("does not connect a new adult while the previous identity cannot log out", async () => {
    mockPurchases.logOut.mockRejectedValue(new Error("logout failed"));

    await expect(connectRevenueCatUser("adult-b", jest.fn())).rejects.toThrow("logout failed");
    expect(mockPurchases.logIn).not.toHaveBeenCalled();
    await expect(refreshRevenueCatCustomerInfo()).resolves.toBeNull();
    expect(mockPurchases.getCustomerInfo).not.toHaveBeenCalled();
  });

  it("rejects a connection when the SDK does not confirm the requested identity", async () => {
    mockPurchases.getAppUserID.mockResolvedValue("adult-b");
    mockPurchases.logOut.mockResolvedValue({});
    mockPurchases.logIn.mockResolvedValue({ customerInfo: {} });

    await expect(connectRevenueCatUser("adult-a", jest.fn())).rejects.toThrow(
      "could not verify",
    );
  });

  it("rechecks the SDK identity immediately before and after purchase", async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue({});
    await connectRevenueCatUser("adult-a", jest.fn());
    mockPurchases.purchasePackage.mockResolvedValue({ customerInfo: {} });
    mockPurchases.getAppUserID
      .mockResolvedValueOnce("adult-a")
      .mockResolvedValueOnce("adult-b");

    await expect(purchaseRevenueCatPackage({} as never, "adult-a")).rejects.toThrow(
      "could not verify",
    );
  });

  it("blocks restore when the connected identity is stale", async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue({});
    mockPurchases.getAppUserID.mockResolvedValue("adult-a");
    await connectRevenueCatUser("adult-a", jest.fn());
    mockPurchases.getAppUserID.mockResolvedValue("adult-b");

    await expect(restoreRevenueCatPurchases("adult-a")).rejects.toThrow("could not verify");
    expect(mockPurchases.restorePurchases).not.toHaveBeenCalled();
  });
});
