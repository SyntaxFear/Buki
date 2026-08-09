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
let installedListener: CustomerInfoUpdateListener | null = null;
let revenueCatOperation: Promise<void> = Promise.resolve();
const REVENUECAT_LOGOUT_ATTEMPTS = 3;

function withRevenueCatLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = revenueCatOperation.then(operation, operation);
  revenueCatOperation = result.then(() => undefined, () => undefined);
  return result;
}

function isAnonymousRevenueCatId(appUserId: string): boolean {
  return appUserId.startsWith("$RCAnonymousID:");
}

async function logOutRevenueCatUser(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < REVENUECAT_LOGOUT_ATTEMPTS; attempt += 1) {
    try {
      await Purchases.logOut();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not disconnect the RevenueCat user.");
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
      if (!isAnonymousRevenueCatId(currentAppUserId)) await logOutRevenueCatUser();
      const result = await Purchases.logIn(ownerId);
      return result.customerInfo;
    }
  }

  return Purchases.getCustomerInfo();
}

async function requireRevenueCatUser(ownerId: string): Promise<void> {
  if (Platform.OS !== "ios" || activeOwnerId !== ownerId) {
    throw new Error("Buki Pro is still connecting to this account. Please try again.");
  }
  const appUserId = await Purchases.getAppUserID();
  if (appUserId !== ownerId) {
    activeOwnerId = null;
    throw new Error("Buki could not verify the Apple purchase account. Sign in again and retry.");
  }
}

export async function connectRevenueCatUser(
  ownerId: string,
  handler: CustomerInfoHandler,
): Promise<CustomerInfo | null> {
  return withRevenueCatLock(async () => {
    activeOwnerId = null;
    if (installedListener) {
      Purchases.removeCustomerInfoUpdateListener(installedListener);
      installedListener = null;
    }
    const customerInfo = await ensureConfigured(ownerId);
    if (Platform.OS === "ios") {
      const appUserId = await Purchases.getAppUserID();
      if (appUserId !== ownerId) {
        throw new Error("Buki could not verify the Apple purchase account.");
      }
    }
    activeOwnerId = ownerId;
    if (Platform.OS === "ios") {
      installedListener = (updatedCustomerInfo) => {
        if (activeOwnerId === ownerId) handler(ownerId, updatedCustomerInfo);
      };
      Purchases.addCustomerInfoUpdateListener(installedListener);
    }
    return customerInfo;
  });
}

export async function refreshRevenueCatCustomerInfo(
  expectedOwnerId: string,
): Promise<CustomerInfo | null> {
  return withRevenueCatLock(async () => {
    if (Platform.OS !== "ios") return null;
    await requireRevenueCatUser(expectedOwnerId);
    const customerInfo = await Purchases.getCustomerInfo();
    await requireRevenueCatUser(expectedOwnerId);
    return customerInfo;
  });
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

export async function purchaseRevenueCatPackage(
  aPackage: PurchasesPackage,
  expectedOwnerId: string,
): Promise<MakePurchaseResult> {
  return withRevenueCatLock(async () => {
    await requireRevenueCatUser(expectedOwnerId);
    const result = await Purchases.purchasePackage(aPackage);
    await requireRevenueCatUser(expectedOwnerId);
    return result;
  });
}

export async function restoreRevenueCatPurchases(expectedOwnerId: string): Promise<CustomerInfo> {
  return withRevenueCatLock(async () => {
    await requireRevenueCatUser(expectedOwnerId);
    const customerInfo = await Purchases.restorePurchases();
    await requireRevenueCatUser(expectedOwnerId);
    return customerInfo;
  });
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
  return withRevenueCatLock(async () => {
    activeOwnerId = null;
    if (installedListener) {
      Purchases.removeCustomerInfoUpdateListener(installedListener);
      installedListener = null;
    }
    if (Platform.OS !== "ios" || !(await Purchases.isConfigured())) return;
    const currentAppUserId = await Purchases.getAppUserID();
    if (!isAnonymousRevenueCatId(currentAppUserId)) await logOutRevenueCatUser();
  });
}
