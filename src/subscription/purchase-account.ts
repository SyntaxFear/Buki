import { useAuth } from "@/store/auth";
import { useMembership } from "@/store/membership";

export const PURCHASE_SIGN_IN_REQUIRED =
  "Sign in to your adult Buki account before purchasing or restoring Buki Pro.";

export function matchingPurchaseAccountId(
  authUserId: string | null | undefined,
  membershipOwnerId: string | null | undefined,
): string | null {
  return authUserId && authUserId === membershipOwnerId ? authUserId : null;
}

export function currentPurchaseAccountId(): string | null {
  return matchingPurchaseAccountId(
    useAuth.getState().user?.id,
    useMembership.getState().ownerId,
  );
}
