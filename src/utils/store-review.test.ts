const mockHasAction = jest.fn();
const mockStoreUrl = jest.fn();
const mockIsAvailable = jest.fn();
const mockRequestReview = jest.fn();
const mockCanOpenUrl = jest.fn();
const mockOpenUrl = jest.fn();

jest.mock("expo-store-review", () => ({
  hasAction: (...args: unknown[]) => mockHasAction(...args),
  storeUrl: (...args: unknown[]) => mockStoreUrl(...args),
  isAvailableAsync: (...args: unknown[]) => mockIsAvailable(...args),
  requestReview: (...args: unknown[]) => mockRequestReview(...args),
}));

jest.mock("expo-linking", () => ({
  canOpenURL: (...args: unknown[]) => mockCanOpenUrl(...args),
  openURL: (...args: unknown[]) => mockOpenUrl(...args),
}));

import { openBukiStoreReview } from "./store-review";

describe("Buki store review action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAction.mockResolvedValue(true);
    mockStoreUrl.mockReturnValue(
      "https://apps.apple.com/app/id6798754626?action=write-review",
    );
    mockCanOpenUrl.mockResolvedValue(true);
    mockOpenUrl.mockResolvedValue(undefined);
    mockIsAvailable.mockResolvedValue(false);
    mockRequestReview.mockResolvedValue(undefined);
  });

  it("opens the configured App Store review page for an explicit Rate action", async () => {
    await expect(openBukiStoreReview()).resolves.toBe("store");

    expect(mockOpenUrl).toHaveBeenCalledWith(
      "https://apps.apple.com/app/id6798754626?action=write-review",
    );
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("uses the native Expo review request when no store URL is configured", async () => {
    mockStoreUrl.mockReturnValue(null);
    mockIsAvailable.mockResolvedValue(true);

    await expect(openBukiStoreReview()).resolves.toBe("native");

    expect(mockRequestReview).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable when Expo has no review action", async () => {
    mockHasAction.mockResolvedValue(false);

    await expect(openBukiStoreReview()).resolves.toBe("unavailable");

    expect(mockOpenUrl).not.toHaveBeenCalled();
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("reports unavailable when neither the store URL nor native prompt can open", async () => {
    mockCanOpenUrl.mockResolvedValue(false);
    mockIsAvailable.mockResolvedValue(false);

    await expect(openBukiStoreReview()).resolves.toBe("unavailable");
  });
});
