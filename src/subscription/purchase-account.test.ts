let mockAuthUserId: string | null = null;
let mockMembershipOwnerId: string | null = null;
let mockPurchaseIdentityReady = false;

jest.mock("@/store/auth", () => ({
  useAuth: {
    getState: () => ({ user: mockAuthUserId ? { id: mockAuthUserId } : null }),
  },
}));

jest.mock("@/store/membership", () => ({
  useMembership: {
    getState: () => ({
      ownerId: mockMembershipOwnerId,
      purchaseIdentityReady: mockPurchaseIdentityReady,
    }),
  },
}));

import {
  currentPurchaseAccountId,
  matchingPurchaseAccountId,
} from "./purchase-account";

describe("RevenueCat purchase account prerequisite", () => {
  beforeEach(() => {
    mockAuthUserId = null;
    mockMembershipOwnerId = null;
    mockPurchaseIdentityReady = false;
  });

  it("requires both authentication and the matching RevenueCat owner", () => {
    expect(matchingPurchaseAccountId(null, null, false)).toBeNull();
    expect(matchingPurchaseAccountId("adult-a", null, true)).toBeNull();
    expect(matchingPurchaseAccountId("adult-a", "adult-b", true)).toBeNull();
    expect(matchingPurchaseAccountId("adult-a", "adult-a", false)).toBeNull();
    expect(matchingPurchaseAccountId("adult-a", "adult-a", true)).toBe("adult-a");
  });

  it("reads fresh store state at the moment of the purchase action", () => {
    mockAuthUserId = "adult-a";
    mockMembershipOwnerId = "adult-a";
    mockPurchaseIdentityReady = true;
    expect(currentPurchaseAccountId()).toBe("adult-a");

    mockAuthUserId = null;
    mockMembershipOwnerId = null;
    expect(currentPurchaseAccountId()).toBeNull();
  });
});
