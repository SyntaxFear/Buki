import type { CustomerInfo, PurchasesEntitlementInfo } from "react-native-purchases";

import {
  productFromIdentifier,
  snapshotFromCustomerInfo,
} from "./customer-info";

function customerInfo(entitlement: Partial<PurchasesEntitlementInfo> | null = {}): CustomerInfo {
  const pro = entitlement
    ? ({
        identifier: "pro",
        isActive: true,
        willRenew: true,
        productIdentifier: "buki_pro_yearly",
        expirationDate: "2027-08-08T00:00:00Z",
        billingIssueDetectedAt: null,
        ...entitlement,
      } as PurchasesEntitlementInfo)
    : undefined;
  return {
    requestDate: "2026-08-08T12:00:00Z",
    entitlements: {
      all: pro ? { pro } : {},
      active: pro?.isActive ? { pro } : {},
      verification: "NOT_REQUESTED",
    },
  } as CustomerInfo;
}

describe("RevenueCat customer info mapping", () => {
  it("maps the configured products to the shared Pro access", () => {
    expect(productFromIdentifier("buki_pro_monthly")).toBe("monthly");
    expect(productFromIdentifier("buki_pro_yearly")).toBe("yearly");
    expect(productFromIdentifier("buki_pro_lifetime")).toBe("lifetime");
    expect(productFromIdentifier("another_product")).toBeNull();
  });

  it("maps active and grace-period access", () => {
    expect(snapshotFromCustomerInfo(customerInfo()).status).toBe("active");
    expect(
      snapshotFromCustomerInfo(customerInfo({ billingIssueDetectedAt: "2026-08-08T12:00:00Z" })).status,
    ).toBe("grace");
  });

  it("preserves product history after expiry without granting Pro", () => {
    expect(snapshotFromCustomerInfo(customerInfo({ isActive: false }))).toEqual({
      product: "yearly",
      status: "expired",
      expiresAt: "2027-08-08T00:00:00Z",
      willRenew: true,
      checkedAt: "2026-08-08T12:00:00Z",
    });
  });

  it("keeps canceled subscriptions active until their paid period ends", () => {
    expect(snapshotFromCustomerInfo(customerInfo({ willRenew: false }))).toMatchObject({
      product: "yearly",
      status: "active",
      willRenew: false,
    });
  });

  it("removes Pro after a refund or revocation", () => {
    expect(snapshotFromCustomerInfo(customerInfo({ isActive: false }))).toMatchObject({
      status: "expired",
    });
  });

  it("keeps lifetime access active without an expiration date", () => {
    expect(
      snapshotFromCustomerInfo(
        customerInfo({
          productIdentifier: "buki_pro_lifetime",
          expirationDate: null,
          willRenew: false,
        }),
      ),
    ).toMatchObject({ product: "lifetime", status: "active", expiresAt: null });
  });

  it("treats an account with no Pro purchase as Free", () => {
    expect(snapshotFromCustomerInfo(customerInfo())).toMatchObject({
      product: "yearly",
      status: "active",
    });
    expect(snapshotFromCustomerInfo(customerInfo(null))).toEqual({
      product: null,
      status: "expired",
      expiresAt: null,
      willRenew: false,
      checkedAt: "2026-08-08T12:00:00Z",
    });
  });
});
