import * as Linking from "expo-linking";
import * as StoreReview from "expo-store-review";

export type StoreReviewAction = "store" | "native" | "unavailable";

export async function openBukiStoreReview(): Promise<StoreReviewAction> {
  if (!(await StoreReview.hasAction())) return "unavailable";

  const storeUrl = StoreReview.storeUrl();
  if (storeUrl && await Linking.canOpenURL(storeUrl)) {
    await Linking.openURL(storeUrl);
    return "store";
  }

  if (await StoreReview.isAvailableAsync()) {
    await StoreReview.requestReview();
    return "native";
  }

  return "unavailable";
}
