import type { EntitlementSnapshot } from "./access";

export interface InactiveMembershipCopy {
  detail: string;
  history: string | null;
}

function productName(product: EntitlementSnapshot["product"]): string | null {
  if (!product) return null;
  return `${product.charAt(0).toUpperCase()}${product.slice(1)} Pro`;
}

function expirationDate(value: string | null, locales?: Intl.LocalesArgument): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat(locales, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function inactiveMembershipCopy(
  entitlement: EntitlementSnapshot,
  locales?: Intl.LocalesArgument,
): InactiveMembershipCopy {
  const plan = productName(entitlement.product);
  if (!plan) {
    return {
      detail: "1 child · 1 sketchpad · 20 artworks",
      history: null,
    };
  }

  if (entitlement.status === "expired") {
    const expiredOn = expirationDate(entitlement.expiresAt, locales);
    return {
      detail: `${plan} expired · Free limits active`,
      history: expiredOn
        ? `Expired ${expiredOn}. Existing content is preserved; Free creation limits now apply.`
        : `${plan} is inactive. Existing content is preserved; Free creation limits now apply.`,
    };
  }

  return {
    detail: `Previous ${plan} · Free limits active`,
    history: "App Store access is not currently verified. Existing content is preserved while Free creation limits apply.",
  };
}
