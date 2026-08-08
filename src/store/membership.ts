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
import { snapshotFromCustomerInfo } from "@/subscription/customer-info";
import {
  connectRevenueCatUser,
  disconnectRevenueCatUser,
  refreshRevenueCatCustomerInfo,
} from "@/subscription/revenuecat-client";

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
  error: string | null;
  upgradeRequest: UpgradeRequest | null;
  initializeForUser: (ownerId: string) => Promise<void>;
  refreshMembership: () => Promise<void>;
  disconnectUser: () => Promise<void>;
  setEntitlement: (entitlement: EntitlementSnapshot) => void;
  requestUpgrade: (feature: ProFeature, source: string) => void;
  clearUpgradeRequest: () => void;
  markHydrated: () => void;
  resetMembership: () => void;
}

const FREE_CAPABILITIES = resolveCapabilities("free");

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Could not check Buki Pro access.";
}

function resolvedState(entitlement: EntitlementSnapshot) {
  const current = entitlementAtTime(entitlement);
  const tier = tierForEntitlement(current.status);
  return { entitlement: current, tier, capabilities: resolveCapabilities(tier) };
}

async function applyCustomerInfo(ownerId: string, customerInfo: CustomerInfo): Promise<void> {
  if (useMembership.getState().ownerId !== ownerId) return;
  const entitlement = entitlementAtTime(snapshotFromCustomerInfo(customerInfo));
  useMembership.setState({
    ...resolvedState(entitlement),
    hydrated: true,
    loading: false,
    managementUrl: customerInfo.managementURL,
    error: null,
  });
  try {
    await saveBukiEntitlement(ownerId, entitlement);
  } catch (error) {
    console.warn("Could not cache the Buki entitlement", error);
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
  error: null,
  upgradeRequest: null,

  initializeForUser: async (ownerId) => {
    if (get().ownerId === ownerId && (get().hydrated || get().loading)) return;
    set({
      ownerId,
      hydrated: false,
      loading: true,
      managementUrl: null,
      error: null,
      upgradeRequest: null,
    });

    let cached: EntitlementSnapshot | null = null;
    try {
      cached = await loadBukiEntitlement(ownerId);
      if (get().ownerId !== ownerId) return;
      set({ ...resolvedState(cached ?? EMPTY_ENTITLEMENT), hydrated: true });
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

  disconnectUser: async () => {
    set({
      hydrated: true,
      loading: false,
      ownerId: null,
      tier: "free",
      entitlement: EMPTY_ENTITLEMENT,
      capabilities: FREE_CAPABILITIES,
      managementUrl: null,
      error: null,
      upgradeRequest: null,
    });
    await disconnectRevenueCatUser();
  },

  setEntitlement: (entitlement) => {
    set({ ...resolvedState(entitlement), hydrated: true });
  },

  requestUpgrade: (feature, source) => {
    set({ upgradeRequest: { feature, source, requestedAt: Date.now() } });
  },

  clearUpgradeRequest: () => set({ upgradeRequest: null }),
  markHydrated: () => set({ hydrated: true }),
  resetMembership: () =>
    set({
      hydrated: true,
      loading: false,
      ownerId: null,
      tier: "free",
      entitlement: EMPTY_ENTITLEMENT,
      capabilities: FREE_CAPABILITIES,
      managementUrl: null,
      error: null,
      upgradeRequest: null,
    }),
}));

export function currentCapabilities(): Capabilities {
  return useMembership.getState().capabilities;
}
