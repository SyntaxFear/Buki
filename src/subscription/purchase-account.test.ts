let mockAuthUserId: string | null = null;
let mockMembershipOwnerId: string | null = null;

jest.mock("@/store/auth", () => ({
  useAuth: {
    getState: () => ({ user: mockAuthUserId ? { id: mockAuthUserId } : null }),
  },
}));

jest.mock("@/store/membership", () => ({
  useMembership: {
    getState: () => ({ ownerId: mockMembershipOwnerId }),
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
  });

  it("requires both authentication and the matching RevenueCat owner", () => {
    expect(matchingPurchaseAccountId(null, null)).toBeNull();
    expect(matchingPurchaseAccountId("adult-a", null)).toBeNull();
    expect(matchingPurchaseAccountId("adult-a", "adult-b")).toBeNull();
    expect(matchingPurchaseAccountId("adult-a", "adult-a")).toBe("adult-a");
  });

  it("reads fresh store state at the moment of the purchase action", () => {
    mockAuthUserId = "adult-a";
    mockMembershipOwnerId = "adult-a";
    expect(currentPurchaseAccountId()).toBe("adult-a");

    mockAuthUserId = null;
    mockMembershipOwnerId = null;
    expect(currentPurchaseAccountId()).toBeNull();
  });
});
