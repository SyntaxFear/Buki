export type AccessTier = "free" | "pro";
export type ProProduct = "monthly" | "yearly" | "lifetime" | null;
export type EntitlementStatus = "active" | "grace" | "expired" | "unknown";

export type ContentResource = "children" | "sketchpads" | "artworks";

export type ProFeature =
  | ContentResource
  | "cloudBackup"
  | "exportData"
  | "advancedOrganization"
  | "premiumVisuals";

export interface Capabilities {
  maxChildren: number;
  maxSketchpads: number;
  maxArtworks: number;
  cloudBackup: boolean;
  exportData: boolean;
  advancedOrganization: boolean;
  premiumVisuals: boolean;
}

export interface EntitlementSnapshot {
  product: ProProduct;
  status: EntitlementStatus;
  expiresAt: string | null;
  willRenew: boolean;
  checkedAt: string | null;
}

export interface ContentCounts {
  children: number;
  sketchpads: number;
  artworks: number;
}

export class ContentLimitReachedError extends Error {
  readonly code = "CONTENT_LIMIT_REACHED";

  constructor(readonly resource: ContentResource) {
    super(`The ${resource} limit has been reached.`);
    this.name = "ContentLimitReachedError";
  }
}

export function isContentLimitReachedError(
  error: unknown,
  resource?: ContentResource,
): error is ContentLimitReachedError {
  return (
    error instanceof ContentLimitReachedError &&
    (resource === undefined || error.resource === resource)
  );
}

export const FREE_LIMITS = {
  children: 1,
  sketchpads: 1,
  artworks: 20,
} as const;

// RevenueCat exposes whether grace is currently active but not the grace-end timestamp.
// Keep a recently verified offline grace state, then require another authoritative refresh.
export const GRACE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const FREE_CAPABILITIES: Capabilities = {
  maxChildren: FREE_LIMITS.children,
  maxSketchpads: FREE_LIMITS.sketchpads,
  maxArtworks: FREE_LIMITS.artworks,
  cloudBackup: false,
  exportData: false,
  advancedOrganization: false,
  premiumVisuals: false,
};

const PRO_CAPABILITIES: Capabilities = {
  maxChildren: Number.POSITIVE_INFINITY,
  maxSketchpads: Number.POSITIVE_INFINITY,
  maxArtworks: Number.POSITIVE_INFINITY,
  cloudBackup: true,
  exportData: true,
  advancedOrganization: true,
  premiumVisuals: true,
};

export const EMPTY_ENTITLEMENT: EntitlementSnapshot = {
  product: null,
  status: "unknown",
  expiresAt: null,
  willRenew: false,
  checkedAt: null,
};

export function tierForEntitlement(status: EntitlementStatus): AccessTier {
  return status === "active" || status === "grace" ? "pro" : "free";
}

export function entitlementAtTime(
  snapshot: EntitlementSnapshot,
  now: number = Date.now(),
): EntitlementSnapshot {
  if (snapshot.status !== "active" && snapshot.status !== "grace") return snapshot;

  const unknown = () => ({ ...snapshot, status: "unknown" as const, willRenew: false });

  if (!snapshot.expiresAt) {
    if (
      snapshot.status === "grace" ||
      snapshot.product === "monthly" ||
      snapshot.product === "yearly"
    ) {
      return unknown();
    }
    return snapshot;
  }

  const expiration = Date.parse(snapshot.expiresAt);
  if (!Number.isFinite(expiration)) return unknown();

  if (snapshot.status === "grace") {
    if (expiration > now) return snapshot;
    const checkedAt = snapshot.checkedAt ? Date.parse(snapshot.checkedAt) : Number.NaN;
    const graceVerifiedAt = Math.max(expiration, checkedAt);
    if (!Number.isFinite(checkedAt) || graceVerifiedAt + GRACE_CACHE_MAX_AGE_MS <= now) {
      return unknown();
    }
    return snapshot;
  }

  if (expiration <= now) {
    return { ...snapshot, status: "expired", willRenew: false };
  }
  return snapshot;
}

export function resolveCapabilities(tier: AccessTier): Capabilities {
  return tier === "pro" ? PRO_CAPABILITIES : FREE_CAPABILITIES;
}

export function limitFor(resource: ContentResource, capabilities: Capabilities): number {
  switch (resource) {
    case "children":
      return capabilities.maxChildren;
    case "sketchpads":
      return capabilities.maxSketchpads;
    case "artworks":
      return capabilities.maxArtworks;
  }
}

export function canCreateContent(
  resource: ContentResource,
  counts: ContentCounts,
  capabilities: Capabilities,
): boolean {
  return counts[resource] < limitFor(resource, capabilities);
}

export function remainingContentAllowance(
  resource: ContentResource,
  counts: ContentCounts,
  capabilities: Capabilities,
): number {
  const limit = limitFor(resource, capabilities);
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
  return Math.max(0, limit - counts[resource]);
}

export function hasFeature(feature: Exclude<ProFeature, ContentResource>, capabilities: Capabilities): boolean {
  return capabilities[feature];
}
