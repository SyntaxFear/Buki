import { useAuth } from "@/store/auth";
import { useMembership } from "@/store/membership";

export const PURCHASE_SIGN_IN_REQUIRED =
  "Sign in to your adult Buki account before purchasing or restoring Buki Pro.";
export const PURCHASE_ACCOUNT_CHANGED =
  "Your Buki account changed. Start the purchase or restore again from the current account.";

export function matchingPurchaseAccountId(
  authUserId: string | null | undefined,
  membershipOwnerId: string | null | undefined,
  purchaseIdentityReady: boolean,
): string | null {
  return purchaseIdentityReady && authUserId && authUserId === membershipOwnerId
    ? authUserId
    : null;
}

export function currentPurchaseAccountId(): string | null {
  return matchingPurchaseAccountId(
    useAuth.getState().user?.id,
    useMembership.getState().ownerId,
    useMembership.getState().purchaseIdentityReady,
  );
}
