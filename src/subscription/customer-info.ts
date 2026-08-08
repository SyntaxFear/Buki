import type { CustomerInfo, PurchasesEntitlementInfo } from "react-native-purchases";

import type { EntitlementSnapshot, ProProduct } from "./access";

export const PRO_ENTITLEMENT_ID = "pro";

export const PRO_PRODUCT_IDS = {
  monthly: "buki_pro_monthly",
  yearly: "buki_pro_yearly",
  lifetime: "buki_pro_lifetime",
} as const;

export function productFromIdentifier(identifier: string | null | undefined): ProProduct {
  if (!identifier) return null;
  if (identifier === PRO_PRODUCT_IDS.monthly || identifier.endsWith("_monthly")) return "monthly";
  if (identifier === PRO_PRODUCT_IDS.yearly || identifier.endsWith("_yearly")) return "yearly";
  if (identifier === PRO_PRODUCT_IDS.lifetime || identifier.endsWith("_lifetime")) return "lifetime";
  return null;
}

function statusForEntitlement(
  entitlement: PurchasesEntitlementInfo | undefined,
): EntitlementSnapshot["status"] {
  if (!entitlement) return "expired";
  if (!entitlement.isActive) return "expired";
  return entitlement.billingIssueDetectedAt ? "grace" : "active";
}

export function snapshotFromCustomerInfo(customerInfo: CustomerInfo): EntitlementSnapshot {
  const entitlement = customerInfo.entitlements.all[PRO_ENTITLEMENT_ID];
  return {
    product: productFromIdentifier(entitlement?.productIdentifier),
    status: statusForEntitlement(entitlement),
    expiresAt: entitlement?.expirationDate ?? null,
    willRenew: entitlement?.willRenew ?? false,
    checkedAt: customerInfo.requestDate || new Date().toISOString(),
  };
}
