import * as Linking from "expo-linking";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

import { getPublicAppConfig } from "@/config/env";
import { useAuth } from "@/store/auth";
import { useMembership, type UpgradeRequest } from "@/store/membership";
import { confirmAdult } from "@/store/parental-gate";
import {
  isRevenueCatIntroEligible,
  isRevenueCatPurchaseCancelled,
  loadRevenueCatOffering,
  purchaseRevenueCatPackage,
} from "@/subscription/revenuecat-client";
import { annualSavingsPercent } from "@/subscription/paywall-model";
import { PRO_ENTITLEMENT_ID } from "@/subscription/customer-info";
import {
  PURCHASE_ACCOUNT_CHANGED,
  currentPurchaseAccountId,
  PURCHASE_SIGN_IN_REQUIRED,
} from "@/subscription/purchase-account";
import { trackAnalyticsEvent } from "@/analytics/client";
import { colors } from "@/theme";

type PlanId = "monthly" | "yearly" | "lifetime";

interface Plan {
  id: PlanId;
  title: string;
  caption: string;
  badge: string | null;
  aPackage: PurchasesPackage;
}

const FEATURES = [
  "Unlimited children, sketchpads, and local artwork",
  "2 GB private cloud backup and restore",
  "Premium themes, borders, and decorations",
  "Search, tags, favorites, filters, and bulk actions",
  "PNG/JPG, share card, PDF, ZIP, and Buki archive exports",
] as const;

function paywallCopy(request: UpgradeRequest): { eyebrow: string; title: string; body: string } {
  switch (request.source) {
    case "first_artwork":
      return {
        eyebrow: "YOUR FIRST MASTERPIECE IS SAFE",
        title: "Keep the whole story with Buki Pro",
        body: "Free includes 20 artworks. Pro adds unlimited local keepsakes, private backup, beautiful styles, and family-ready exports.",
      };
    case "artwork_limit":
      return {
        eyebrow: "20 ARTWORKS SAVED",
        title: "Make room for every masterpiece",
        body: "Nothing already saved will be removed. Upgrade to keep adding artwork without a Buki content limit.",
      };
    case "sketchpad_limit":
    case "account_children":
    case "child_limit":
      return {
        eyebrow: "MORE ROOM TO GROW",
        title: "Create a book for every little artist",
        body: "Buki Pro unlocks unlimited local child profiles and sketchpads, all under one adult account.",
      };
    case "account_export_artwork":
    case "account_export_pdf":
    case "account_export_zip":
    case "account_export_archive":
      return {
        eyebrow: "TAKE YOUR ART WITH YOU",
        title: "Unlock every Buki export",
        body: "Create image files, share cards, sketchpad PDFs, batch ZIPs, and versioned Buki archives.",
      };
    default:
      return {
        eyebrow: "BUKI PRO",
        title: "Protect and organize every masterpiece",
        body: "One Pro membership unlocks the same features whether you choose monthly, yearly, or lifetime access.",
      };
  }
}

function planList(offering: PurchasesOffering, trialEligible: boolean): Plan[] {
  const plans: Plan[] = [];
  if (offering.annual) {
    plans.push({
      id: "yearly",
      title: "Yearly",
      caption: trialEligible ? "Eligible 7-day free trial" : "Lowest subscription price",
      badge: "BEST VALUE",
      aPackage: offering.annual,
    });
  }
  if (offering.monthly) {
    plans.push({
      id: "monthly",
      title: "Monthly",
      caption: "Flexible access",
      badge: null,
      aPackage: offering.monthly,
    });
  }
  if (offering.lifetime) {
    plans.push({
      id: "lifetime",
      title: "Lifetime",
      caption: "Pay once",
      badge: null,
      aPackage: offering.lifetime,
    });
  }
  return plans;
}

function savingsLabel(plans: Plan[]): string | null {
  const monthly = plans.find((plan) => plan.id === "monthly")?.aPackage.product;
  const yearly = plans.find((plan) => plan.id === "yearly")?.aPackage.product;
  if (!monthly || !yearly || monthly.currencyCode !== yearly.currencyCode || monthly.price <= 0) return null;
  const percent = annualSavingsPercent(monthly.price, yearly.price);
  return percent ? `Save ${percent}%` : null;
}

function selectedDisclosure(plan: Plan, trialEligible: boolean): string {
  const price = plan.aPackage.product.priceString;
  if (plan.id === "lifetime") {
    return `${price} one-time purchase. Lifetime unlocks the same Buki Pro features and 2 GB cloud quota.`;
  }
  if (plan.id === "yearly" && trialEligible) {
    return `7 days free, then ${price} per year. Payment is charged to your Apple ID when the trial ends. It renews automatically unless canceled at least 24 hours before the period ends.`;
  }
  return `${price} per ${plan.id === "monthly" ? "month" : "year"}. Payment is charged to your Apple ID at confirmation. It renews automatically unless canceled at least 24 hours before the period ends.`;
}

function purchaseButtonLabel(plan: Plan, trialEligible: boolean): string {
  if (plan.id === "yearly" && trialEligible) return "Start 7-Day Free Trial";
  if (plan.id === "lifetime") return "Unlock Pro for Life";
  return "Continue with Pro";
}

export function ProPaywallHost() {
  const insets = useSafeAreaInsets();
  const request = useMembership((state) => state.upgradeRequest);
  const tier = useMembership((state) => state.tier);
  const clearRequest = useMembership((state) => state.clearUpgradeRequest);
  const acceptCustomerInfo = useMembership((state) => state.acceptCustomerInfo);
  const restorePurchases = useMembership((state) => state.restorePurchases);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PlanId>("yearly");
  const [trialEligible, setTrialEligible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    let active = true;
    setSelected("yearly");
    setOffering(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const nextOffering = await loadRevenueCatOffering();
        if (!nextOffering.annual && !nextOffering.monthly && !nextOffering.lifetime) {
          throw new Error("The Buki Pro offering has no available App Store plans.");
        }
        const eligible = nextOffering.annual
          ? await isRevenueCatIntroEligible(nextOffering.annual.product.identifier)
          : false;
        if (!active) return;
        setOffering(nextOffering);
        setTrialEligible(eligible);
        if (!nextOffering.annual) {
          setSelected(nextOffering.monthly ? "monthly" : "lifetime");
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Buki Pro plans could not load.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    if (request && tier === "pro") clearRequest();
  }, [clearRequest, request, tier]);

  const plans = useMemo(
    () => (offering ? planList(offering, trialEligible) : []),
    [offering, trialEligible],
  );
  const selectedPlan = plans.find((plan) => plan.id === selected) ?? plans[0];
  const savings = savingsLabel(plans);
  const copy = request ? paywallCopy(request) : null;

  const openExternal = async (url: string, label: string) => {
    if (!(await confirmAdult(`${label} opens outside Buki.`))) return;
    await Linking.openURL(url).catch(() => {
      Alert.alert("Could not open this link", "Please try again in a moment.");
    });
  };

  const requirePurchaseAccount = (): string | null => {
    const accountId = currentPurchaseAccountId();
    if (!accountId) setError(PURCHASE_SIGN_IN_REQUIRED);
    return accountId;
  };

  const purchase = async () => {
    if (!selectedPlan || purchasing) return;
    const accountId = requirePurchaseAccount();
    if (!accountId) return;
    const confirmed = await confirmAdult(
      `This continues to Apple’s purchase confirmation for ${selectedPlan.title} Buki Pro.`,
    );
    if (!confirmed) return;
    if (currentPurchaseAccountId() !== accountId) {
      setError(PURCHASE_ACCOUNT_CHANGED);
      return;
    }
    const analyticsSource = request?.source ?? "paywall";
    void trackAnalyticsEvent(accountId, {
      name: "purchase_started",
      source: analyticsSource,
      feature: request?.feature,
      plan: selectedPlan.id,
    });
    setPurchasing(true);
    setError(null);
    try {
      const result = await purchaseRevenueCatPackage(selectedPlan.aPackage, accountId);
      const applied = await acceptCustomerInfo(result.customerInfo, accountId);
      if (!applied) {
        throw new Error(
          currentPurchaseAccountId() === accountId
            ? "Apple returned the purchase, but Buki could not verify Pro access. Use Restore Purchases and try again."
            : "Your Buki account changed during purchase. Sign back in to that account and use Restore Purchases.",
        );
      }
      void trackAnalyticsEvent(accountId, {
        name: "purchase_completed",
        source: analyticsSource,
        feature: request?.feature,
        plan: selectedPlan.id,
        result: "success",
      });
      if (result.customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]?.periodType === "TRIAL") {
        void trackAnalyticsEvent(accountId, {
          name: "trial_started",
          source: analyticsSource,
          feature: request?.feature,
          plan: selectedPlan.id,
          result: "success",
        });
      }
      clearRequest();
      Alert.alert("Buki Pro is ready", "Every Pro feature is now unlocked for this Buki account.");
    } catch (purchaseError) {
      if (isRevenueCatPurchaseCancelled(purchaseError)) {
        void trackAnalyticsEvent(accountId, {
          name: "purchase_cancelled",
          source: analyticsSource,
          feature: request?.feature,
          plan: selectedPlan.id,
          result: "cancelled",
        });
      } else {
        void trackAnalyticsEvent(accountId, {
          name: "purchase_failed",
          source: analyticsSource,
          feature: request?.feature,
          plan: selectedPlan.id,
          result: "failed",
        });
        setError(
          purchaseError instanceof Error
            ? purchaseError.message
            : "The purchase could not be completed. Please try again.",
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const confirmRestore = async () => {
    const accountId = requirePurchaseAccount();
    if (!accountId) return;
    if (!(await confirmAdult("Restoring can move Apple purchase access to this Buki account."))) return;
    if (currentPurchaseAccountId() !== accountId) {
      setError(PURCHASE_ACCOUNT_CHANGED);
      return;
    }
    const auth = useAuth.getState();
    const accountLabel =
      auth.profile?.email ?? auth.user?.email ?? auth.profile?.displayName ?? "this account";
    Alert.alert(
      "Restore to this Buki account?",
      `Buki Pro will move to ${accountLabel} if Apple finds an eligible purchase. Artwork from another Buki account does not move.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            if (currentPurchaseAccountId() !== accountId) {
              setError(PURCHASE_ACCOUNT_CHANGED);
              return;
            }
            setRestoring(true);
            setError(null);
            void restorePurchases(request?.source ?? "paywall").then((result) => {
              setRestoring(false);
              if (result === "restored") {
                clearRequest();
                Alert.alert("Buki Pro restored", "Pro is now available on this Buki account.");
              } else if (result === "not_found") {
                Alert.alert("No purchase found", "Apple did not return an active Buki Pro purchase for this store account.");
              } else {
                setError("Buki could not restore purchases. Check your connection and try again.");
              }
            });
          },
        },
      ],
    );
  };

  const config = getPublicAppConfig();
  if (!request) return null;

  const content = (
    <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={clearRequest}
            accessibilityRole="button"
            accessibilityLabel="Close Buki Pro"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeLabel}>×</Text>
          </Pressable>
          <Text style={styles.topTitle}>Buki Pro</Text>
          <View style={styles.closeSpacer} />
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}
        >
          <View style={styles.hero}>
            <View style={styles.crown}><Text style={styles.crownText}>★</Text></View>
            <Text style={styles.eyebrow}>{copy?.eyebrow}</Text>
            <Text style={styles.title}>{copy?.title}</Text>
            <Text style={styles.body}>{copy?.body}</Text>
          </View>

          <View style={styles.featureCard}>
            {FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.titleTeal} />
              <Text style={styles.loadingText}>Loading localized App Store prices…</Text>
            </View>
          ) : null}

          {error && !plans.length ? (
            <View style={styles.errorCard}>
              <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
              <Pressable
                onPress={() => useMembership.getState().requestUpgrade(request?.feature ?? "cloudBackup", `${request?.source ?? "paywall"}_retry`)}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {plans.length ? (
            <View style={styles.plans} accessibilityRole="radiogroup">
              {plans.map((plan) => (
                <Pressable
                  key={plan.id}
                  onPress={() => setSelected(plan.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selected === plan.id }}
                  style={({ pressed }) => [
                    styles.plan,
                    selected === plan.id && styles.planSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.radio, selected === plan.id && styles.radioSelected]}>
                    {selected === plan.id ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.planCopy}>
                    <View style={styles.planTitleRow}>
                      <Text style={styles.planTitle}>{plan.title}</Text>
                      {plan.badge ? <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>{plan.badge}</Text></View> : null}
                      {plan.id === "yearly" && savings ? <Text style={styles.savings}>{savings}</Text> : null}
                    </View>
                    <Text style={styles.planCaption}>{plan.caption}</Text>
                    {plan.id === "yearly" && plan.aPackage.product.pricePerMonthString ? (
                      <Text style={styles.planMonthly}>{plan.aPackage.product.pricePerMonthString} per month</Text>
                    ) : null}
                  </View>
                  <View style={styles.priceCopy}>
                    <Text style={styles.price}>{plan.aPackage.product.priceString}</Text>
                    <Text style={styles.pricePeriod}>
                      {plan.id === "monthly" ? "/ month" : plan.id === "yearly" ? "/ year" : "once"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {selectedPlan ? (
            <>
              <Pressable
                onPress={() => void purchase()}
                disabled={purchasing}
                accessibilityRole="button"
                accessibilityLabel={purchaseButtonLabel(selectedPlan, trialEligible)}
                style={({ pressed }) => [styles.purchaseButton, pressed && styles.purchasePressed, purchasing && styles.disabled]}
              >
                {purchasing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.purchaseLabel}>
                    {purchaseButtonLabel(selectedPlan, trialEligible)}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.disclosure}>{selectedDisclosure(selectedPlan, trialEligible)}</Text>
            </>
          ) : null}

          {error && plans.length ? <Text accessibilityRole="alert" style={styles.purchaseError}>{error}</Text> : null}

          <Pressable
            onPress={() => void confirmRestore()}
            disabled={purchasing || restoring}
            accessibilityRole="button"
            accessibilityLabel="Restore Purchases"
            style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed]}
          >
            {restoring ? <ActivityIndicator color={colors.titleTeal} /> : <Text style={styles.restoreLabel}>Restore Purchases</Text>}
          </Pressable>

          <View style={styles.legalLinks}>
            <Pressable onPress={() => void openExternal(config.termsUrl, "Terms of Use")}><Text style={styles.legalLink}>Terms</Text></Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable onPress={() => void openExternal(config.privacyUrl, "Privacy Policy")}><Text style={styles.legalLink}>Privacy</Text></Pressable>
          </View>
          <Text style={styles.safetyNote}>Existing artwork is never deleted if Pro expires.</Text>
        </ScrollView>
    </View>
  );

  if (Platform.OS === "ios") {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        {content}
      </FullWindowOverlay>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={clearRequest}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: { minHeight: 64, paddingHorizontal: 18, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topTitle: { fontSize: 17, fontWeight: "900", color: colors.ink },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  closeLabel: { fontSize: 29, lineHeight: 31, color: colors.ink, marginTop: -2 },
  closeSpacer: { width: 42 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", padding: 18, gap: 16 },
  hero: { alignItems: "center", paddingTop: 8, paddingHorizontal: 10, gap: 8 },
  crown: { width: 62, height: 62, borderRadius: 22, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.bloomYellow, transform: [{ rotate: "-4deg" }] },
  crownText: { fontSize: 30, color: colors.titleCoral },
  eyebrow: { marginTop: 5, fontSize: 11, fontWeight: "900", letterSpacing: 1.15, color: colors.titleCoral, textAlign: "center" },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "900", color: colors.ink, textAlign: "center" },
  body: { maxWidth: 470, fontSize: 15, lineHeight: 22, color: colors.mutedText, textAlign: "center" },
  featureCard: { padding: 16, gap: 12, borderRadius: 22, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  check: { width: 25, height: 25, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(72,198,183,0.18)" },
  checkText: { fontSize: 15, fontWeight: "900", color: colors.titleTeal },
  featureText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: "700", color: colors.ink },
  loadingCard: { minHeight: 82, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: colors.surface },
  loadingText: { color: colors.mutedText, fontSize: 13 },
  errorCard: { padding: 18, gap: 12, borderRadius: 20, backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "rgba(180,60,60,0.2)" },
  errorText: { color: "#A93232", fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  retryLabel: { fontWeight: "900", color: colors.titleTeal },
  plans: { gap: 10 },
  plan: { minHeight: 86, padding: 14, borderRadius: 19, borderCurve: "continuous", borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 11 },
  planSelected: { borderColor: colors.titleTeal, backgroundColor: "#F3FBF8" },
  radio: { width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: "#B7ACA0", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.titleTeal },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.titleTeal },
  planCopy: { flex: 1, minWidth: 0, gap: 2 },
  planTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  planTitle: { fontSize: 17, fontWeight: "900", color: colors.ink },
  bestBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.bloomYellow },
  bestBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.4, color: colors.ink },
  savings: { fontSize: 11, fontWeight: "900", color: colors.titleCoral },
  planCaption: { fontSize: 12, color: colors.mutedText },
  planMonthly: { fontSize: 11, color: colors.titleTeal, fontWeight: "700" },
  priceCopy: { alignItems: "flex-end" },
  price: { fontSize: 17, fontWeight: "900", color: colors.ink },
  pricePeriod: { fontSize: 11, color: colors.mutedText },
  purchaseButton: { minHeight: 58, borderRadius: 19, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.titleTeal, shadowColor: "#0F6569", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.22, shadowRadius: 12 },
  purchasePressed: { backgroundColor: "#106B70", transform: [{ scale: 0.99 }] },
  purchaseLabel: { fontSize: 17, fontWeight: "900", color: "#FFFFFF" },
  disclosure: { paddingHorizontal: 8, fontSize: 11, lineHeight: 16, color: colors.mutedText, textAlign: "center" },
  purchaseError: { color: "#A93232", fontSize: 13, lineHeight: 18, textAlign: "center" },
  restoreButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  restoreLabel: { color: colors.titleTeal, fontSize: 14, fontWeight: "900" },
  legalLinks: { flexDirection: "row", justifyContent: "center", gap: 10, paddingTop: 2 },
  legalLink: { color: colors.titleTeal, fontSize: 13, fontWeight: "800", textDecorationLine: "underline" },
  legalDot: { color: colors.mutedText },
  safetyNote: { color: colors.mutedText, fontSize: 11, textAlign: "center" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.58 },
});
