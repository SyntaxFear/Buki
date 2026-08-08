import type { CustomerInfo } from "react-native-purchases";
import { create } from "zustand";

import { loadBukiEntitlement, saveBukiEntitlement } from "@/database";
import {
  EMPTY_ENTITLEMENT,
  entitlementAtTime,
  resolveCapabilities,
  tierForEntitlement,
  type AccessTier,
  type Capabilities,
  type EntitlementSnapshot,
  type ProFeature,
} from "@/subscription/access";
import {
  PRO_ENTITLEMENT_ID,
  snapshotFromCustomerInfo,
} from "@/subscription/customer-info";
import {
  connectRevenueCatUser,
  disconnectRevenueCatUser,
  refreshRevenueCatCustomerInfo,
  restoreRevenueCatPurchases,
} from "@/subscription/revenuecat-client";
import {
  verifyServerEntitlement,
  type CloudRetentionStatus,
} from "@/subscription/server-entitlement";
import { trackAnalyticsEvent } from "@/analytics/client";

export interface UpgradeRequest {
  feature: ProFeature;
  source: string;
  requestedAt: number;
}

interface MembershipState {
  hydrated: boolean;
  loading: boolean;
  ownerId: string | null;
  tier: AccessTier;
  entitlement: EntitlementSnapshot;
  capabilities: Capabilities;
  managementUrl: string | null;
  periodType: string | null;
  hadPro: boolean;
  retentionStatus: CloudRetentionStatus | null;
  cloudReadOnlySince: string | null;
  cloudDeleteAfter: string | null;
  cloudUploadsEnabled: boolean;
  error: string | null;
  upgradeRequest: UpgradeRequest | null;
  initializeForUser: (ownerId: string) => Promise<void>;
  refreshMembership: () => Promise<void>;
  restorePurchases: (source?: string) => Promise<"restored" | "not_found" | "failed">;
  disconnectUser: () => Promise<void>;
  acceptCustomerInfo: (customerInfo: CustomerInfo) => Promise<void>;
  setEntitlement: (entitlement: EntitlementSnapshot) => void;
  requestUpgrade: (feature: ProFeature, source: string) => void;
  clearUpgradeRequest: () => void;
  markHydrated: () => void;
  resetMembership: () => void;
}

const FREE_CAPABILITIES = resolveCapabilities("free");
const MAX_TIMER_DELAY = 2_000_000_000;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Could not check Buki Pro access.";
}

function resolvedState(entitlement: EntitlementSnapshot) {
  const current = entitlementAtTime(entitlement);
  const tier = tierForEntitlement(current.status);
  return { entitlement: current, tier, capabilities: resolveCapabilities(tier) };
}

function clearExpiryTimer(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

function scheduleExpiryCheck(ownerId: string, entitlement: EntitlementSnapshot): void {
  clearExpiryTimer();
  if (
    (entitlement.status !== "active" && entitlement.status !== "grace") ||
    !entitlement.expiresAt
  ) {
    return;
  }
  const remaining = Date.parse(entitlement.expiresAt) - Date.now();
  if (!Number.isFinite(remaining)) return;
  const delay = Math.max(0, Math.min(remaining + 500, MAX_TIMER_DELAY));
  expiryTimer = setTimeout(() => {
    const state = useMembership.getState();
    if (state.ownerId !== ownerId) return;
    const current = entitlementAtTime(state.entitlement);
    if (current.status === "expired") {
      useMembership.setState({ ...resolvedState(current), periodType: null });
      void saveBukiEntitlement(ownerId, current).catch(() => {});
      void useMembership.getState().refreshMembership();
    } else {
      scheduleExpiryCheck(ownerId, current);
    }
  }, delay);
}

async function applyCustomerInfo(ownerId: string, customerInfo: CustomerInfo): Promise<void> {
  if (useMembership.getState().ownerId !== ownerId) return;
  const entitlement = entitlementAtTime(snapshotFromCustomerInfo(customerInfo));
  const periodType = customerInfo.entitlements.all[PRO_ENTITLEMENT_ID]?.periodType ?? null;
  useMembership.setState({
    ...resolvedState(entitlement),
    hydrated: true,
    loading: false,
    managementUrl: customerInfo.managementURL,
    periodType,
    hadPro: useMembership.getState().hadPro || entitlement.product !== null,
    error: null,
  });
  scheduleExpiryCheck(ownerId, entitlement);
  try {
    await saveBukiEntitlement(ownerId, entitlement);
  } catch (error) {
    console.warn("Could not cache the Buki entitlement", error);
  }
  try {
    const server = await verifyServerEntitlement();
    if (useMembership.getState().ownerId !== ownerId) return;
    useMembership.setState({
      hadPro: useMembership.getState().hadPro || server.hadPro,
      retentionStatus: server.retention.status,
      cloudReadOnlySince: server.retention.readOnlySince,
      cloudDeleteAfter: server.retention.deleteAfter,
      cloudUploadsEnabled: server.retention.uploadsEnabled,
    });
  } catch (error) {
    console.warn("Could not refresh Buki cloud retention", error);
  }
}

function receiveCustomerInfo(ownerId: string, customerInfo: CustomerInfo): void {
  void applyCustomerInfo(ownerId, customerInfo);
}

export const useMembership = create<MembershipState>((set, get) => ({
  hydrated: false,
  loading: false,
  ownerId: null,
  tier: "free",
  entitlement: EMPTY_ENTITLEMENT,
  capabilities: FREE_CAPABILITIES,
  managementUrl: null,
  periodType: null,
  hadPro: false,
  retentionStatus: null,
  cloudReadOnlySince: null,
  cloudDeleteAfter: null,
  cloudUploadsEnabled: true,
  error: null,
  upgradeRequest: null,

  initializeForUser: async (ownerId) => {
    if (get().ownerId === ownerId && (get().hydrated || get().loading)) return;
    clearExpiryTimer();
    set({
      ownerId,
      hydrated: false,
      loading: true,
      tier: "free",
      entitlement: EMPTY_ENTITLEMENT,
      capabilities: FREE_CAPABILITIES,
      managementUrl: null,
      periodType: null,
      hadPro: false,
      retentionStatus: null,
      cloudReadOnlySince: null,
      cloudDeleteAfter: null,
      cloudUploadsEnabled: true,
      error: null,
      upgradeRequest: null,
    });

    let cached: EntitlementSnapshot | null = null;
    try {
      cached = await loadBukiEntitlement(ownerId);
      if (get().ownerId !== ownerId) return;
      const cachedEntitlement = entitlementAtTime(cached ?? EMPTY_ENTITLEMENT);
      set({
        ...resolvedState(cachedEntitlement),
        hydrated: true,
        periodType: null,
        hadPro: cachedEntitlement.product !== null,
      });
      scheduleExpiryCheck(ownerId, cachedEntitlement);
    } catch (error) {
      console.warn("Could not load the cached Buki entitlement", error);
      if (get().ownerId === ownerId) {
        set({ ...resolvedState(EMPTY_ENTITLEMENT), hydrated: true });
      }
    }

    void (async () => {
      try {
        const customerInfo = await connectRevenueCatUser(ownerId, receiveCustomerInfo);
        if (get().ownerId !== ownerId) return;
        if (customerInfo) {
          await applyCustomerInfo(ownerId, customerInfo);
        } else {
          set({
            ...resolvedState(cached ?? EMPTY_ENTITLEMENT),
            hydrated: true,
            loading: false,
          });
        }
      } catch (error) {
        if (get().ownerId !== ownerId) return;
        // Keep a time-valid cached entitlement while offline. Cloud operations still require
        // authoritative server verification, and entitlementAtTime expires this cache locally.
        set({
          ...resolvedState(cached ?? EMPTY_ENTITLEMENT),
          hydrated: true,
          loading: false,
          error: message(error),
        });
      }
    })();
  },

  refreshMembership: async () => {
    const ownerId = get().ownerId;
    if (!ownerId) return;
    set({ loading: true, error: null });
    try {
      const customerInfo = await refreshRevenueCatCustomerInfo();
      if (customerInfo) await applyCustomerInfo(ownerId, customerInfo);
      else set({ loading: false });
    } catch (error) {
      if (get().ownerId === ownerId) set({ loading: false, error: message(error) });
    }
  },

  restorePurchases: async (source = "account_center") => {
    const ownerId = get().ownerId;
    if (!ownerId) return "failed";
    void trackAnalyticsEvent(ownerId, { name: "restore_attempted", source });
    set({ loading: true, error: null });
    try {
      const customerInfo = await restoreRevenueCatPurchases();
      await applyCustomerInfo(ownerId, customerInfo);
      const status = snapshotFromCustomerInfo(customerInfo).status;
      const result = status === "active" || status === "grace" ? "restored" : "not_found";
      void trackAnalyticsEvent(ownerId, {
        name: "restore_completed",
        source,
        result: result === "restored" ? "success" : "not_found",
      });
      return result;
    } catch (error) {
      if (get().ownerId === ownerId) set({ loading: false, error: message(error) });
      void trackAnalyticsEvent(ownerId, {
        name: "restore_completed",
        source,
        result: "failed",
      });
      return "failed";
    }
  },

  disconnectUser: async () => {
    clearExpiryTimer();
    set({
      hydrated: true,
      loading: false,
      ownerId: null,
      tier: "free",
      entitlement: EMPTY_ENTITLEMENT,
      capabilities: FREE_CAPABILITIES,
      managementUrl: null,
      periodType: null,
      hadPro: false,
      retentionStatus: null,
      cloudReadOnlySince: null,
      cloudDeleteAfter: null,
      cloudUploadsEnabled: true,
      error: null,
      upgradeRequest: null,
    });
    await disconnectRevenueCatUser();
  },

  acceptCustomerInfo: async (customerInfo) => {
    const ownerId = get().ownerId;
    if (!ownerId) return;
    await applyCustomerInfo(ownerId, customerInfo);
  },

  setEntitlement: (entitlement) => {
    const current = entitlementAtTime(entitlement);
    set((state) => ({
      ...resolvedState(current),
      hydrated: true,
      hadPro: state.hadPro || current.product !== null,
    }));
    const ownerId = get().ownerId;
    if (ownerId) scheduleExpiryCheck(ownerId, current);
  },

  requestUpgrade: (feature, source) => {
    const ownerId = get().ownerId;
    void trackAnalyticsEvent(ownerId, {
      name: "paywall_viewed",
      source,
      feature,
    });
    set({ upgradeRequest: { feature, source, requestedAt: Date.now() } });
  },

  clearUpgradeRequest: () => set({ upgradeRequest: null }),
  markHydrated: () => set({ hydrated: true }),
  resetMembership: () => {
    clearExpiryTimer();
    set({
      hydrated: true,
      loading: false,
      ownerId: null,
      tier: "free",
      entitlement: EMPTY_ENTITLEMENT,
      capabilities: FREE_CAPABILITIES,
      managementUrl: null,
      periodType: null,
      hadPro: false,
      retentionStatus: null,
      cloudReadOnlySince: null,
      cloudDeleteAfter: null,
      cloudUploadsEnabled: true,
      error: null,
      upgradeRequest: null,
    });
  },
}));

export function currentCapabilities(): Capabilities {
  return useMembership.getState().capabilities;
}
