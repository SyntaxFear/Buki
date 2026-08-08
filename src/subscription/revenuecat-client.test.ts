const mockPurchases = {
  isConfigured: jest.fn(),
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  getAppUserID: jest.fn(),
  logOut: jest.fn(),
  logIn: jest.fn(),
  getCustomerInfo: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
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
  refreshRevenueCatCustomerInfo,
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
});
