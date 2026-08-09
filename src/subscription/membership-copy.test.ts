import { EMPTY_ENTITLEMENT } from "./access";
import { inactiveMembershipCopy } from "./membership-copy";

describe("inactive membership account copy", () => {
  it("shows the historical product and expiration date", () => {
    expect(
      inactiveMembershipCopy(
        {
          ...EMPTY_ENTITLEMENT,
          product: "yearly",
          status: "expired",
          expiresAt: "2026-08-01T12:00:00.000Z",
        },
        "en-US",
      ),
    ).toEqual({
      detail: "Yearly Pro expired · Free limits active",
      history: "Expired Aug 1, 2026. Existing content is preserved; Free creation limits now apply.",
    });
  });

  it("explains revoked lifetime access without inventing an expiration date", () => {
    expect(
      inactiveMembershipCopy({
        ...EMPTY_ENTITLEMENT,
        product: "lifetime",
        status: "expired",
      }),
    ).toEqual({
      detail: "Lifetime Pro expired · Free limits active",
      history: "Lifetime Pro is inactive. Existing content is preserved; Free creation limits now apply.",
    });
  });

  it("keeps the normal Free limits when there is no purchase history", () => {
    expect(inactiveMembershipCopy(EMPTY_ENTITLEMENT)).toEqual({
      detail: "1 child · 1 sketchpad · 20 artworks",
      history: null,
    });
  });
});
