import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type MakePurchaseResult,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";

import { getPublicAppConfig } from "@/config/env";

type CustomerInfoHandler = (ownerId: string, customerInfo: CustomerInfo) => void;

let activeOwnerId: string | null = null;
let updateHandler: CustomerInfoHandler | null = null;
let listenerInstalled = false;

const customerInfoListener: CustomerInfoUpdateListener = (customerInfo) => {
  if (!activeOwnerId || !updateHandler) return;
  updateHandler(activeOwnerId, customerInfo);
};

function isAnonymousRevenueCatId(appUserId: string): boolean {
  return appUserId.startsWith("$RCAnonymousID:");
}

async function ensureConfigured(ownerId: string): Promise<CustomerInfo | null> {
  if (Platform.OS !== "ios") return null;

  const configured = await Purchases.isConfigured();
  if (!configured) {
    Purchases.configure({
      apiKey: getPublicAppConfig().revenueCatIosApiKey,
      appUserID: ownerId,
      entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      automaticDeviceIdentifierCollectionEnabled: false,
    });
    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  } else {
    const currentAppUserId = await Purchases.getAppUserID();
    if (currentAppUserId !== ownerId) {
      if (!isAnonymousRevenueCatId(currentAppUserId)) await Purchases.logOut();
      const result = await Purchases.logIn(ownerId);
      return result.customerInfo;
    }
  }

  return Purchases.getCustomerInfo();
}

export async function connectRevenueCatUser(
  ownerId: string,
  handler: CustomerInfoHandler,
): Promise<CustomerInfo | null> {
  activeOwnerId = ownerId;
  updateHandler = handler;
  const customerInfo = await ensureConfigured(ownerId);
  if (Platform.OS === "ios" && !listenerInstalled) {
    Purchases.addCustomerInfoUpdateListener(customerInfoListener);
    listenerInstalled = true;
  }
  return customerInfo;
}

export async function refreshRevenueCatCustomerInfo(): Promise<CustomerInfo | null> {
  if (Platform.OS !== "ios" || !activeOwnerId) return null;
  return Purchases.getCustomerInfo();
}

export async function loadRevenueCatOffering(): Promise<PurchasesOffering> {
  const offerings = await Purchases.getOfferings();
  if (!offerings.current) throw new Error("Buki Pro plans are temporarily unavailable.");
  await Purchases.trackCustomPaywallImpression({ offering: offerings.current }).catch(() => {});
  return offerings.current;
}

export async function isRevenueCatIntroEligible(
  productIdentifier: string,
): Promise<boolean> {
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility([productIdentifier]);
    return (
      result[productIdentifier]?.status ===
      Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
    );
  } catch {
    return false;
  }
}

export function purchaseRevenueCatPackage(aPackage: PurchasesPackage): Promise<MakePurchaseResult> {
  return Purchases.purchasePackage(aPackage);
}

export function isRevenueCatPurchaseCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

export async function disconnectRevenueCatUser(): Promise<void> {
  activeOwnerId = null;
  updateHandler = null;
  if (Platform.OS !== "ios" || !(await Purchases.isConfigured())) return;
  try {
    const currentAppUserId = await Purchases.getAppUserID();
    if (!isAnonymousRevenueCatId(currentAppUserId)) await Purchases.logOut();
  } catch (error) {
    console.warn("Could not disconnect the RevenueCat user", error);
  }
}
