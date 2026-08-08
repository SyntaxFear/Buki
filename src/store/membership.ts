import { create } from "zustand";

import {
  EMPTY_ENTITLEMENT,
  resolveCapabilities,
  tierForEntitlement,
  type AccessTier,
  type Capabilities,
  type EntitlementSnapshot,
  type ProFeature,
} from "@/subscription/access";

export interface UpgradeRequest {
  feature: ProFeature;
  source: string;
  requestedAt: number;
}

interface MembershipState {
  hydrated: boolean;
  tier: AccessTier;
  entitlement: EntitlementSnapshot;
  capabilities: Capabilities;
  upgradeRequest: UpgradeRequest | null;
  setEntitlement: (entitlement: EntitlementSnapshot) => void;
  requestUpgrade: (feature: ProFeature, source: string) => void;
  clearUpgradeRequest: () => void;
  markHydrated: () => void;
  resetMembership: () => void;
}

const FREE_CAPABILITIES = resolveCapabilities("free");

export const useMembership = create<MembershipState>((set) => ({
  hydrated: false,
  tier: "free",
  entitlement: EMPTY_ENTITLEMENT,
  capabilities: FREE_CAPABILITIES,
  upgradeRequest: null,

  setEntitlement: (entitlement) => {
    const tier = tierForEntitlement(entitlement.status);
    set({ entitlement, tier, capabilities: resolveCapabilities(tier), hydrated: true });
  },

  requestUpgrade: (feature, source) => {
    set({ upgradeRequest: { feature, source, requestedAt: Date.now() } });
  },

  clearUpgradeRequest: () => set({ upgradeRequest: null }),
  markHydrated: () => set({ hydrated: true }),
  resetMembership: () =>
    set({
      hydrated: true,
      tier: "free",
      entitlement: EMPTY_ENTITLEMENT,
      capabilities: FREE_CAPABILITIES,
      upgradeRequest: null,
    }),
}));

export function currentCapabilities(): Capabilities {
  return useMembership.getState().capabilities;
}
