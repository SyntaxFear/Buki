import * as Application from "expo-application";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as StoreReview from "expo-store-review";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getPublicAppConfig } from "@/config/env";
import { BukiText as Text } from "@/components/buki-wordmark";
import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { NativeDoneHeader } from "@/components/native-navigation-header";
import { NativeToolbarButton } from "@/components/native-toolbar-button";
import { loadBukiUsage } from "@/database";
import { removeBukiCloudCopies } from "@/privacy/account-data";
import { useAuth } from "@/store/auth";
import { useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { confirmAdult } from "@/store/parental-gate";
import { usePreferences } from "@/store/preferences";
import { useProfiles, type ChildProfile } from "@/store/profiles";
import { useCloudSync } from "@/store/sync";
import { canCreateContent, type ProFeature } from "@/subscription/access";
import { inactiveMembershipCopy } from "@/subscription/membership-copy";
import {
  currentPurchaseAccountId,
  PURCHASE_ACCOUNT_CHANGED,
  PURCHASE_SIGN_IN_REQUIRED,
} from "@/subscription/purchase-account";
import { colors } from "@/theme";
import {
  dismissKeyboard,
  keyboardDismissMode,
  keyboardInputBottomOffset,
} from "@/utils/keyboard";

const ADULT_AVATARS = ["🌻", "🦊", "🐻", "🌈", "⭐️"] as const;
const CHILD_COLORS = ["#FFD65A", "#70D0BD", "#86B8EA", "#FFA7B9", "#A98BE6"] as const;
const ADULT_AVATAR_LABELS: Record<(typeof ADULT_AVATARS)[number], string> = {
  "🌻": "Sunflower",
  "🦊": "Fox",
  "🐻": "Bear",
  "🌈": "Rainbow",
  "⭐️": "Star",
};
const CHILD_COLOR_LABELS: Record<(typeof CHILD_COLORS)[number], string> = {
  "#FFD65A": "Yellow",
  "#70D0BD": "Teal",
  "#86B8EA": "Blue",
  "#FFA7B9": "Pink",
  "#A98BE6": "Purple",
};

type ChildDraft = {
  id: string | null;
  name: string;
  avatarColor: string;
  birthMonth: string;
  birthYear: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatSyncTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function adultAvatar(uri: string | null | undefined, name: string): { emoji: string; image: string | null } {
  if (uri?.startsWith("emoji:")) return { emoji: uri.slice("emoji:".length), image: null };
  if (uri) return { emoji: "", image: uri };
  return { emoji: name.trim().charAt(0).toUpperCase() || "P", image: null };
}

export function AccountCenter() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const config = getPublicAppConfig();
  const user = useAuth((state) => state.user);
  const profile = useAuth((state) => state.profile);
  const authBusy = useAuth((state) => state.busy);
  const authError = useAuth((state) => state.error);
  const updateProfile = useAuth((state) => state.updateProfile);
  const clearLocalData = useAuth((state) => state.clearLocalData);
  const deleteAccount = useAuth((state) => state.deleteAccount);
  const signOut = useAuth((state) => state.signOut);
  const children = useProfiles((state) => state.children);
  const activeChildId = useProfiles((state) => state.activeChildId);
  const profileBusy = useProfiles((state) => state.busy);
  const profileError = useProfiles((state) => state.error);
  const createChild = useProfiles((state) => state.createChild);
  const updateChild = useProfiles((state) => state.updateChild);
  const setActiveChild = useProfiles((state) => state.setActiveChild);
  const moveChild = useProfiles((state) => state.moveChild);
  const deleteChild = useProfiles((state) => state.deleteChild);
  const replayOnboarding = useProfiles((state) => state.replayOnboarding);
  const pads = useDrawings((state) => state.pads);
  const activePadId = useDrawings((state) => state.activePadId);
  const drawingsByPad = useDrawings((state) => state.drawingsByPad);
  const setActivePad = useDrawings((state) => state.setActivePad);
  const tier = useMembership((state) => state.tier);
  const entitlement = useMembership((state) => state.entitlement);
  const capabilities = useMembership((state) => state.capabilities);
  const membershipLoading = useMembership((state) => state.loading);
  const membershipError = useMembership((state) => state.error);
  const managementUrl = useMembership((state) => state.managementUrl);
  const periodType = useMembership((state) => state.periodType);
  const hadPro = useMembership((state) => state.hadPro);
  const retentionStatus = useMembership((state) => state.retentionStatus);
  const cloudDeleteAfter = useMembership((state) => state.cloudDeleteAfter);
  const cloudUploadsEnabled = useMembership((state) => state.cloudUploadsEnabled);
  const refreshMembership = useMembership((state) => state.refreshMembership);
  const restorePurchases = useMembership((state) => state.restorePurchases);
  const requestUpgrade = useMembership((state) => state.requestUpgrade);
  const hapticsEnabled = usePreferences((state) => state.hapticsEnabled);
  const setHapticsEnabled = usePreferences((state) => state.setHapticsEnabled);
  const automaticBackup = useCloudSync((state) => state.automaticBackup);
  const syncStatus = useCloudSync((state) => state.status);
  const pendingSyncCount = useCloudSync((state) => state.pendingCount);
  const lastSyncedAt = useCloudSync((state) => state.lastSyncedAt);
  const lastRestore = useCloudSync((state) => state.lastRestore);
  const syncError = useCloudSync((state) => state.error);
  const setAutomaticBackup = useCloudSync((state) => state.setAutomaticBackup);
  const syncNow = useCloudSync((state) => state.syncNow);
  const restoreNow = useCloudSync((state) => state.restoreNow);
  const pauseForPrivacyAction = useCloudSync((state) => state.pauseForPrivacyAction);
  const refreshSyncState = useCloudSync((state) => state.refreshSyncState);
  const [usage, setUsage] = useState({
    localBytes: 0,
    cloudBytes: 0,
    cloudLimit: 2 * 1024 * 1024 * 1024,
  });
  const [adultEditorOpen, setAdultEditorOpen] = useState(false);
  const [childDraft, setChildDraft] = useState<ChildDraft | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  const artworkCount = useMemo(
    () => Object.values(drawingsByPad).reduce((sum, drawings) => sum + drawings.length, 0),
    [drawingsByPad],
  );
  const visiblePads = useMemo(
    () => pads.filter((pad) => pad.childId === activeChildId),
    [activeChildId, pads],
  );
  const providers = useMemo(() => {
    const names = user?.identities?.map((identity) => identity.provider) ?? [];
    return [...new Set(names)].map((provider) =>
      provider === "email" ? "Email" : provider.charAt(0).toUpperCase() + provider.slice(1),
    );
  }, [user?.identities]);
  const renewalDate = formatDate(entitlement.expiresAt);
  const inactiveMembership = inactiveMembershipCopy(entitlement);
  const retentionDeleteDate = formatDate(cloudDeleteAfter);
  const avatar = adultAvatar(profile?.avatarUri, profile?.displayName ?? "Parent");
  const cloudProgress = Math.min(1, usage.cloudBytes / Math.max(1, usage.cloudLimit));
  const cloudQuotaReached = usage.cloudBytes >= usage.cloudLimit;
  const cloudRetentionReadOnly = retentionStatus === "read_only" || retentionStatus === "pending_deletion";
  const cloudRestoreAvailable = (capabilities.cloudBackup && cloudUploadsEnabled)
    || cloudRetentionReadOnly
    || (retentionStatus === null && (hadPro || entitlement.product !== null));
  const syncDetail = cloudRetentionReadOnly
    ? retentionStatus === "pending_deletion"
      ? "Cloud deletion verification is pending"
      : `Read-only${retentionDeleteDate ? ` until ${retentionDeleteDate}` : " during the 90-day retention period"}`
    : !cloudUploadsEnabled
      ? "Cloud copies removed · turn on to create a new backup"
      : !capabilities.cloudBackup
        ? "Buki Pro required"
        : !automaticBackup
          ? "Paused on this device"
          : syncStatus === "syncing"
            ? `Backing up ${pendingSyncCount || "recent"} change${pendingSyncCount === 1 ? "" : "s"}…`
            : syncStatus === "offline"
              ? `Waiting for internet${pendingSyncCount ? ` · ${pendingSyncCount} pending` : ""}`
              : syncStatus === "error"
                ? syncError ?? "Backup will retry automatically"
                : syncStatus === "paused"
                  ? syncError ?? "Cloud uploads are paused"
                  : pendingSyncCount
                    ? `${pendingSyncCount} change${pendingSyncCount === 1 ? "" : "s"} waiting to upload`
                    : lastSyncedAt
                      ? `Last backup ${formatSyncTime(lastSyncedAt) ?? "recently"}`
                      : "Ready to back up this library";

  useEffect(() => {
    void loadBukiUsage().then(setUsage).catch(() => {});
  }, [artworkCount, lastRestore, lastSyncedAt, pads.length, pendingSyncCount, syncError, syncStatus]);

  const openExternal = async (url: string, reason: string) => {
    if (!(await confirmAdult(reason))) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open this link", "Please try again in a moment.");
    }
  };

  const introducePro = async (feature: ProFeature, source: string) => {
    requestUpgrade(feature, source);
  };

  const changeAutomaticBackup = async (enabled: boolean) => {
    if (!enabled) {
      await setAutomaticBackup(false);
      return;
    }
    if (!(await confirmAdult(
      "Turning on cloud backup uploads this account’s child profiles, artwork details, and images to Buki’s private cloud storage.",
    ))) return;
    await setAutomaticBackup(true);
  };

  const beginCreateChild = () => {
    if (
      !canCreateContent(
        "children",
        { children: children.length, sketchpads: pads.length, artworks: artworkCount },
        capabilities,
      )
    ) {
      void introducePro("children", "account_children");
      return;
    }
    setChildDraft({ id: null, name: "", avatarColor: CHILD_COLORS[0], birthMonth: "", birthYear: "" });
  };

  const beginEditChild = (child: ChildProfile) => {
    setChildDraft({
      id: child.id,
      name: child.name,
      avatarColor: child.avatarColor,
      birthMonth: child.birthMonth?.toString() ?? "",
      birthYear: child.birthYear?.toString() ?? "",
    });
  };

  const confirmDeleteChild = async (child: ChildProfile) => {
    if (!(await confirmAdult("Removing a child also removes that child’s local sketchpads and artwork."))) return;
    Alert.alert(
      `Remove ${child.name}?`,
      "This permanently removes this child profile and its local artwork. Buki always keeps at least one child profile.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void deleteChild(child.id) },
      ],
    );
  };

  const confirmSignOut = () => {
    Alert.alert(
      "Sign out of Buki?",
      "Local content stays locked to this account and will not appear for another account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            void signOut().then(() => {
              if (useAuth.getState().status === "signedOut") router.dismissTo("/");
            });
          },
        },
      ],
    );
  };

  const confirmRestorePurchases = async () => {
    const accountId = currentPurchaseAccountId();
    if (!accountId) {
      Alert.alert("Sign in required", PURCHASE_SIGN_IN_REQUIRED);
      return;
    }
    if (!(await confirmAdult("Restoring a purchase can move store membership to this Buki account."))) return;
    if (currentPurchaseAccountId() !== accountId) {
      Alert.alert("Buki account changed", PURCHASE_ACCOUNT_CHANGED);
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
              Alert.alert("Buki account changed", PURCHASE_ACCOUNT_CHANGED);
              return;
            }
            void (async () => {
              const result = await restorePurchases("account_center");
              if (result === "restored") {
                Alert.alert("Buki Pro restored", "Pro is now available on this Buki account.");
              } else if (result === "not_found") {
                Alert.alert("No purchase found", "Apple did not return an active Buki Pro purchase for this store account.");
              } else {
                Alert.alert("Restore unavailable", "Buki could not restore purchases. Check your connection and try again.");
              }
            })();
          },
        },
      ],
    );
  };

  const confirmCloudRestore = async () => {
    if (!cloudRestoreAvailable) {
      void introducePro("cloudBackup", "account_restore");
      return;
    }
    if (!(await confirmAdult("Cloud restore can replace matching local records with their latest backed-up versions."))) return;
    Alert.alert(
      "Restore this device?",
      "Buki will merge this account’s private cloud library onto this device. Cloud deletions take priority, while local-only artwork is preserved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            void (async () => {
              const restored = await restoreNow();
              const result = useCloudSync.getState().lastRestore;
              if (!restored || !result) {
                Alert.alert("Restore unavailable", useCloudSync.getState().error ?? "Buki could not restore this device.");
                return;
              }
              await useAuth.getState().refreshProfile();
              Alert.alert(
                "Cloud library restored",
                `${result.artworks} artwork${result.artworks === 1 ? "" : "s"} restored${result.failedMediaCount ? ` · ${result.failedMediaCount} image${result.failedMediaCount === 1 ? "" : "s"} need another attempt` : ""}.`,
              );
            })();
          },
        },
      ],
    );
  };

  const confirmClearLocalData = async () => {
    if (!(await confirmAdult("Clearing this device permanently removes its local Buki files."))) return;
    Alert.alert(
      "Clear Buki from this device?",
      "Local artwork and unsynced changes will be permanently removed, then Buki will sign out. Existing cloud copies stay available for a later restore.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear This Device",
          style: "destructive",
          onPress: () => void (async () => {
            setPrivacyBusy(true);
            const cleared = await clearLocalData();
            setPrivacyBusy(false);
            if (cleared) {
              const warning = useAuth.getState().error;
              router.dismissTo("/");
              if (warning) Alert.alert("Device cleared", warning);
            } else Alert.alert("Could not clear this device", useAuth.getState().error ?? "Please try again.");
          })(),
        },
      ],
    );
  };

  const confirmRemoveCloudCopies = async () => {
    if (!user || !(await confirmAdult("Removing cloud copies permanently deletes this account’s remote backup."))) return;
    Alert.alert(
      "Remove all cloud copies?",
      "Every Buki cloud image and synced record for this account will be permanently deleted. Local artwork stays on this device. Automatic backup pauses on all devices until an adult turns it on again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Cloud Copies",
          style: "destructive",
          onPress: () => void (async () => {
            setPrivacyBusy(true);
            try {
              await pauseForPrivacyAction();
              await removeBukiCloudCopies(user.id);
              await Promise.all([refreshSyncState(), refreshMembership()]);
              setUsage(await loadBukiUsage());
              Alert.alert("Cloud copies removed", "Local artwork is still on this device. Turn Automatic backup on whenever you want to create a new private backup.");
            } catch (error) {
              Alert.alert("Could not remove cloud copies", error instanceof Error ? error.message : "Please try again.");
            } finally {
              setPrivacyBusy(false);
            }
          })(),
        },
      ],
    );
  };

  const confirmDeleteAccount = async () => {
    if (!(await confirmAdult("Account deletion permanently removes Buki account data."))) return;
    Alert.alert(
      "Delete Buki account?",
      "This permanently deletes the adult profile, child profiles, sketchpads, artwork, local files, and cloud copies. Deleting Buki does not cancel an App Store subscription; manage or cancel it separately in Apple subscription settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => void (async () => {
            setPrivacyBusy(true);
            const deleted = await deleteAccount();
            setPrivacyBusy(false);
            if (deleted) {
              const warning = useAuth.getState().error;
              router.dismissTo("/");
              if (warning) Alert.alert("Account deleted", warning);
            } else {
              Alert.alert("Could not delete account", useAuth.getState().error ?? "Please try again.");
            }
          })(),
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <NativeDoneHeader
        title="Profile & Settings"
        eyebrow="BUKI ACCOUNT"
        accessibilityLabel="Close account center"
        onPress={() => router.back()}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 44 }]}
      >
        <View style={styles.profileHero}>
          <View style={styles.adultAvatar}>
            {avatar.image ? (
              <Image source={{ uri: avatar.image }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={styles.adultAvatarText}>{avatar.emoji}</Text>
            )}
          </View>
          <View style={styles.profileHeroCopy}>
            <Text brandBuki style={styles.profileName}>{profile?.displayName ?? "Buki Parent"}</Text>
            <Text brandBuki colorizeBuki={false} brandWholeText style={styles.profileEmail}>
              {profile?.email ?? user?.email ?? "Signed in adult"}
            </Text>
            <Text brandBuki colorizeBuki={false} brandWholeText style={styles.profileProviders}>
              {providers.length ? `Linked: ${providers.join(", ")}` : "Secure Buki account"}
            </Text>
          </View>
          <NativeGlassEditButton
            accessibilityLabel="Edit adult profile"
            onPress={() => setAdultEditorOpen(true)}
          />
        </View>

        {(authError || profileError) ? (
          <Text selectable accessibilityRole="alert" style={styles.errorText}>{authError ?? profileError}</Text>
        ) : null}

        <Section title="Children" caption="Child profiles belong to the adult account—children never sign in.">
          {children.map((child, index) => (
            <View key={child.id} style={styles.childRow}>
              <Pressable
                haptic={child.id === activeChildId ? false : "selection"}
                onPress={() => {
                  void setActiveChild(child.id);
                }}
                accessibilityRole="radio"
                accessibilityLabel={`${child.name}${child.id === activeChildId ? ", current child" : ", make current child"}`}
                accessibilityState={{ selected: child.id === activeChildId }}
                style={[styles.childIdentity, child.id === activeChildId && styles.childIdentityActive]}
              >
                <View style={[styles.childAvatar, { backgroundColor: child.avatarColor }]}>
                  <Text style={styles.childInitial}>{child.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{child.name}</Text>
                  <Text style={styles.rowDetail}>
                    {child.id === activeChildId ? "Current child" : "Tap to make current"}
                    {child.birthYear ? ` · ${child.birthMonth ? `${child.birthMonth}/` : ""}${child.birthYear}` : ""}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.compactActions}>
                <ChildArrowAction
                  direction="up"
                  label={`Move ${child.name} up`}
                  disabled={index === 0}
                  onPress={() => void moveChild(child.id, -1)}
                />
                <ChildArrowAction
                  direction="down"
                  label={`Move ${child.name} down`}
                  disabled={index === children.length - 1}
                  onPress={() => void moveChild(child.id, 1)}
                />
                <ChildTextAction
                  title="Edit"
                  label={`Edit ${child.name}`}
                  onPress={() => beginEditChild(child)}
                />
                <ChildTextAction
                  title="Remove"
                  label={`Remove ${child.name}`}
                  destructive
                  disabled={children.length === 1}
                  onPress={() => void confirmDeleteChild(child)}
                />
              </View>
            </View>
          ))}
          <ActionButton title="Add child profile" onPress={beginCreateChild} />
        </Section>

        <Section title="Membership">
          <View style={styles.membershipCard}>
            <View style={styles.membershipHeader}>
              <View style={styles.membershipCopy}>
                <Text
                  brandBuki
                  brandWeight="700"
                  minimumBrandFontSize={27}
                  style={styles.membershipName}
                >
                  {tier === "pro" ? "Buki Pro" : "Buki Free"}
                </Text>
                <Text style={styles.membershipDetail}>
                  {membershipLoading
                    ? "Checking App Store access…"
                    : tier === "pro"
                    ? `${entitlement.product ? entitlement.product.charAt(0).toUpperCase() + entitlement.product.slice(1) : "Pro"} access`
                    : inactiveMembership.detail}
                </Text>
              </View>
              <View style={[styles.badge, tier === "pro" && styles.proBadge]}>
                <Text style={[styles.badgeText, tier === "pro" && styles.proBadgeText]}>{tier.toUpperCase()}</Text>
              </View>
            </View>
            {tier === "pro" ? (
              <Text brandBuki={false} style={styles.membershipFootnote}>
                {entitlement.status === "grace"
                  ? "Billing grace period · your existing library remains available"
                  : renewalDate
                    ? `${periodType === "TRIAL" ? "Trial ends" : entitlement.willRenew ? "Renews" : "Access through"} ${renewalDate}`
                    : "Active on this Buki account"}
              </Text>
            ) : (
              <>
                {inactiveMembership.history ? (
                  <Text brandBuki={false} style={styles.membershipFootnote}>{inactiveMembership.history}</Text>
                ) : null}
                <ActionButton title="Discover Buki Pro" prominent onPress={() => void introducePro("cloudBackup", "account_membership")} />
                {cloudRetentionReadOnly ? (
                  <Text brandBuki={false} style={styles.membershipFootnote}>
                    {retentionStatus === "pending_deletion"
                      ? "Cloud deletion is being rechecked against RevenueCat. Renewing before deletion resumes synchronization."
                      : `Cloud restore remains available${retentionDeleteDate ? ` until ${retentionDeleteDate}` : " for 90 days"}. Renew to resume backup or export.`}
                  </Text>
                ) : null}
              </>
            )}
          </View>
          <SettingRow
            title="Manage subscription"
            detail="Open Apple subscription settings"
            onPress={() => void openExternal(managementUrl ?? "https://apps.apple.com/account/subscriptions", "Subscription management opens Apple’s settings.")}
          />
          <SettingRow
            title="Refresh membership status"
            detail={membershipError ?? (entitlement.checkedAt ? `Last checked ${formatDate(entitlement.checkedAt) ?? "recently"}` : "Check this Buki account now")}
            right={membershipLoading ? <ActivityIndicator color={colors.titleTeal} /> : undefined}
            onPress={() => void refreshMembership()}
          />
          <SettingRow
            title="Restore purchases"
            detail="Transfer an eligible Apple purchase to this signed-in Buki account"
            onPress={() => void confirmRestorePurchases()}
          />
        </Section>

        <Section title="Usage">
          <View style={styles.metricsGrid}>
            <Metric value={children.length.toString()} label="Children" />
            <Metric value={pads.length.toString()} label="Sketchpads" />
            <Metric value={artworkCount.toString()} label="Artworks" />
            <Metric value={formatBytes(usage.localBytes)} label="Local media" />
          </View>
          <View style={styles.cloudMeter}>
            <View style={styles.meterHeader}>
              <Text style={styles.rowTitle}>Cloud storage</Text>
              <Text style={styles.rowDetail}>{formatBytes(usage.cloudBytes)} of {formatBytes(usage.cloudLimit)}</Text>
            </View>
            <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${cloudProgress * 100}%` }]} /></View>
            {cloudQuotaReached ? <Text style={styles.errorText}>Cloud uploads pause at the 2 GB limit; local artwork remains available.</Text> : null}
          </View>
        </Section>

        <Section title="Cloud Backup" caption="Pro keeps this account’s library available for restore and future devices.">
          <SettingRow
            title="Automatic backup"
            detail={syncDetail}
            right={
              <Switch
                value={automaticBackup && capabilities.cloudBackup && cloudUploadsEnabled}
                accessibilityLabel="Automatic backup"
                accessibilityHint={
                  capabilities.cloudBackup
                    ? "Turns automatic cloud backup on or off"
                    : "Requires Buki Pro"
                }
                onValueChange={(value) => {
                  if (capabilities.cloudBackup) void changeAutomaticBackup(value);
                  else void introducePro("cloudBackup", "account_backup_toggle");
                }}
              />
            }
          />
          <SettingRow
            title="Sync now"
            detail={pendingSyncCount ? `${pendingSyncCount} pending change${pendingSyncCount === 1 ? "" : "s"}` : "Back up recent changes now"}
            right={syncStatus === "syncing" ? <ActivityIndicator color={colors.titleTeal} /> : undefined}
            onPress={() => {
              if (capabilities.cloudBackup) void syncNow();
              else void introducePro("cloudBackup", "account_sync_now");
            }}
          />
          <SettingRow
            title="Restore this device"
            detail={lastRestore
              ? `Last restored ${formatSyncTime(lastRestore.restoredAt) ?? "recently"} · ${lastRestore.artworks} artwork${lastRestore.artworks === 1 ? "" : "s"}`
              : cloudRestoreAvailable
                ? "Merge this account’s private cloud library onto this device"
                : "Buki Pro cloud restore"}
            onPress={() => void confirmCloudRestore()}
          />
        </Section>

        <Section title="Data & Export" caption="Exports remain on this adult-controlled screen.">
          <SettingRow
            title="Art library & organization"
            detail={capabilities.advancedOrganization ? "Search, tags, favorites, filters, and bulk actions" : "Browse all artwork; Pro unlocks advanced organization"}
            onPress={() => router.push("/library")}
          />
          <SettingRow
            title="Single artwork or share card"
            detail={capabilities.exportData ? "Open an artwork to export PNG, JPG, or a decorated card" : "PNG, JPG, decorated card · Buki Pro"}
            onPress={() => {
              if (capabilities.exportData) router.push("/library");
              else void introducePro("exportData", "account_export_artwork");
            }}
          />
          <SettingRow
            title="Sketchpad PDF"
            detail={capabilities.exportData ? "Create a print-ready book in the selected layout" : "Preserve the selected layout · Buki Pro"}
            onPress={() => {
              if (capabilities.exportData) router.push("/exports");
              else void introducePro("exportData", "account_export_pdf");
            }}
          />
          <SettingRow
            title="Batch ZIP"
            detail={capabilities.exportData ? "Images, originals, JSON, and CSV metadata" : "Images with JSON/CSV metadata · Buki Pro"}
            onPress={() => {
              if (capabilities.exportData) router.push("/exports");
              else void introducePro("exportData", "account_export_zip");
            }}
          />
          <SettingRow
            title="Buki archive"
            detail={capabilities.exportData ? "Versioned full-library backup and duplicate-safe import" : "Versioned backup and import · Buki Pro"}
            onPress={() => {
              if (capabilities.exportData) router.push("/exports");
              else void introducePro("exportData", "account_export_archive");
            }}
          />
        </Section>

        <Section title="Preferences">
          <SettingRow
            title="Haptics"
            detail="Feedback for buttons, selections, capture, and page turns"
            right={<Switch value={hapticsEnabled} onValueChange={(value) => void setHapticsEnabled(value)} />}
          />
          <SettingRow
            title="Replay onboarding"
            detail="Review privacy and profile setup"
            onPress={() => {
              Alert.alert("Replay onboarding?", "Your existing profiles and artwork stay in place.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Replay",
                  onPress: () => {
                    router.dismissTo("/");
                    InteractionManager.runAfterInteractions(() => {
                      void replayOnboarding();
                    });
                  },
                },
              ]);
            }}
          />
          <View style={styles.preferenceBlock}>
            <Text style={styles.rowTitle}>Default child</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRailContent}
              style={styles.chipRail}
            >
              {children.map((child) => (
                <Chip key={child.id} label={child.name} selected={child.id === activeChildId} onPress={() => void setActiveChild(child.id)} />
              ))}
            </ScrollView>
          </View>
          <View style={styles.preferenceBlock}>
            <Text style={styles.rowTitle}>Default sketchpad</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRailContent}
              style={styles.chipRail}
            >
              {visiblePads.map((pad) => (
                <Chip key={pad.id} label={pad.name} selected={pad.id === activePadId} onPress={() => setActivePad(pad.id)} />
              ))}
            </ScrollView>
          </View>
        </Section>

        <Section title="Support">
          <SettingRow title="Help & contact" detail="Buki support" onPress={() => void openExternal(config.supportUrl, "Support opens Buki’s website.")} />
          <SettingRow title="Rate Buki" detail="Share feedback on the App Store" onPress={() => void (async () => {
            if (!(await confirmAdult("Rating Buki opens an Apple-controlled prompt."))) return;
            if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
            else Alert.alert("Ratings unavailable", "The App Store rating prompt is not available on this build.");
          })()} />
          <SettingRow title="Privacy Policy" onPress={() => void openExternal(config.privacyUrl, "The Privacy Policy opens Buki’s website.")} />
          <SettingRow title="Terms of Use" onPress={() => void openExternal(config.termsUrl, "The Terms of Use open Buki’s website.")} />
        </Section>

        <Section title="About">
          <SettingRow title="Version" detail={`${Application.nativeApplicationVersion ?? "1.0.0"} (${Application.nativeBuildVersion ?? "development"})`} />
          <SettingRow title="What’s New" detail="Buki Pro, backup, and protected exports" onPress={() => Alert.alert("What’s New", "Buki Free and Pro now include adult accounts, child profiles, iOS purchases, premium visuals, advanced organization, private cloud backup and restore, plus protected artwork and library exports.")} />
        </Section>

        <Section title="Danger Zone" danger>
          <DangerButton title="Clear local data" busy={privacyBusy} onPress={() => void confirmClearLocalData()} />
          <DangerButton title="Remove cloud copies" busy={privacyBusy} onPress={() => void confirmRemoveCloudCopies()} />
          <DangerButton title="Delete Buki account" busy={privacyBusy} onPress={() => void confirmDeleteAccount()} />
        </Section>

        <ActionButton title="Sign out" standalone destructive busy={authBusy} onPress={confirmSignOut} />
      </ScrollView>

      <AdultEditor
        visible={adultEditorOpen}
        busy={authBusy}
        profileName={profile?.displayName ?? ""}
        profileAvatar={profile?.avatarUri ?? null}
        onCancel={() => setAdultEditorOpen(false)}
        onSave={async (displayName, avatarUri) => {
          if (await updateProfile({ displayName, avatarUri })) setAdultEditorOpen(false);
        }}
      />
      <ChildEditor
        draft={childDraft}
        busy={profileBusy}
        onCancel={() => setChildDraft(null)}
        onSave={async (draft) => {
          const birthMonth = draft.birthMonth ? Number(draft.birthMonth) : null;
          const birthYear = draft.birthYear ? Number(draft.birthYear) : null;
          if (birthMonth !== null && (birthMonth < 1 || birthMonth > 12)) {
            Alert.alert("Check birth month", "Use a number from 1 to 12, or leave it blank.");
            return;
          }
          if (birthYear !== null && (birthYear < 1900 || birthYear > new Date().getFullYear())) {
            Alert.alert("Check birth year", "Use a four-digit year, or leave it blank.");
            return;
          }
          const succeeded = draft.id
            ? await updateChild(draft.id, { name: draft.name, avatarColor: draft.avatarColor, birthMonth, birthYear })
            : Boolean(await createChild({ name: draft.name, avatarColor: draft.avatarColor, birthMonth, birthYear }));
          if (succeeded) setChildDraft(null);
        }}
      />
    </View>
  );
}

function Section({ title, caption, danger, children }: { title: string; caption?: string; danger?: boolean; children: ReactNode }) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={[styles.sectionTitle, danger && styles.dangerText]}>{title}</Text>
      {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      <View style={[styles.sectionCard, danger && styles.dangerCard]}>{children}</View>
    </View>
  );
}

function SettingRow({ title, detail, right, onPress }: { title: string; detail?: string; right?: ReactNode; onPress?: () => void }) {
  const content = (
    <>
      <View style={styles.rowCopy}>
        <Text brandBuki={false} style={styles.rowTitle}>{title}</Text>
        {detail ? <Text brandBuki={false} style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.chevron}>›</Text> : null)}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  ) : <View style={styles.settingRow}>{content}</View>;
}

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function ActionButton({ title, onPress, prominent, destructive, standalone, modalAction, busy, disabled }: { title: string; onPress: () => void; prominent?: boolean; destructive?: boolean; standalone?: boolean; modalAction?: boolean; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable haptic={destructive ? "warning" : prominent ? "medium" : "light"} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: Boolean(busy || disabled), busy: Boolean(busy) }} disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, standalone && styles.actionButtonStandalone, modalAction && styles.actionButtonModal, prominent && styles.actionProminent, destructive && styles.actionDestructive, disabled && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={destructive ? "#B43C3C" : prominent ? "#FFFFFF" : colors.titleTeal} /> : <Text brandBuki={false} style={[styles.actionLabel, prominent && styles.actionProminentLabel, destructive && styles.dangerText]}>{title}</Text>}
    </Pressable>
  );
}

function ChildArrowAction({
  direction,
  label,
  onPress,
  disabled,
}: {
  direction: "up" | "down";
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <NativeToolbarButton
      label={label}
      icon={direction === "up" ? "arrow.up" : "arrow.down"}
      onPress={onPress}
      size="regular"
      disabled={disabled}
      tintColor={colors.titleTeal}
      foregroundColor={colors.titleTeal}
      style={styles.childArrowAction}
    />
  );
}

function ChildTextAction({
  title,
  label,
  onPress,
  disabled,
  destructive = false,
}: {
  title: "Edit" | "Remove";
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const actionColor = destructive ? "#B43C3C" : colors.titleTeal;
  return (
    <NativeToolbarButton
      label={label}
      title={title}
      onPress={onPress}
      size="regular"
      disabled={disabled}
      variant={destructive ? "destructive" : "prominent"}
      tintColor={actionColor}
      foregroundColor="#FFFFFF"
      style={styles.childTextAction}
    />
  );
}

function NativeGlassEditButton({
  accessibilityLabel,
  onPress,
  compact = false,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <NativeToolbarButton
      label={accessibilityLabel}
      title="Edit"
      onPress={onPress}
      variant="prominent"
      size="compact"
      tintColor={colors.titleTeal}
      foregroundColor="#FFFFFF"
      style={compact ? styles.compactGlassEdit : styles.profileGlassEdit}
    />
  );
}

function DangerButton({ title, onPress, busy }: { title: string; onPress: () => void; busy?: boolean }) {
  return <Pressable haptic="warning" accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: Boolean(busy), busy: Boolean(busy) }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.dangerButton, busy && styles.disabled, pressed && styles.rowPressed]}><Text brandBuki={false} style={styles.dangerText}>{title}</Text>{busy ? <ActivityIndicator color="#B43C3C" /> : <Text style={styles.dangerChevron}>›</Text>}</Pressable>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable haptic={selected ? false : "selection"} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text></Pressable>;
}

function AdultEditor({ visible, busy, profileName, profileAvatar, onCancel, onSave }: { visible: boolean; busy: boolean; profileName: string; profileAvatar: string | null; onCancel: () => void; onSave: (name: string, avatarUri: string | null) => Promise<void> }) {
  const [name, setName] = useState(profileName);
  const current = profileAvatar?.startsWith("emoji:") ? profileAvatar.slice("emoji:".length) : ADULT_AVATARS[0];
  const [avatar, setAvatar] = useState<string>(current);
  useEffect(() => { if (visible) { setName(profileName); setAvatar(current); } }, [current, profileName, visible]);
  return (
    <EditorShell visible={visible} title="Edit adult profile" busy={busy} canSave={Boolean(name.trim())} onCancel={onCancel} onSave={() => onSave(name, `emoji:${avatar}`)}>
      <TextInput accessibilityLabel="Adult display name" value={name} onChangeText={setName} placeholder="Display name" autoCapitalize="words" returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={dismissKeyboard} style={styles.editorInput} />
      <View accessibilityRole="radiogroup" style={styles.avatarChoices}>{ADULT_AVATARS.map((item) => <Pressable key={item} haptic={avatar === item ? false : "selection"} accessibilityRole="radio" accessibilityLabel={`${ADULT_AVATAR_LABELS[item]} adult avatar`} accessibilityState={{ selected: avatar === item }} onPress={() => setAvatar(item)} style={[styles.avatarChoice, avatar === item && styles.avatarChoiceSelected]}><Text style={styles.avatarChoiceText}>{item}</Text></Pressable>)}</View>
    </EditorShell>
  );
}

function ChildEditor({ draft, busy, onCancel, onSave }: { draft: ChildDraft | null; busy: boolean; onCancel: () => void; onSave: (draft: ChildDraft) => Promise<void> }) {
  const [value, setValue] = useState<ChildDraft | null>(draft);
  const monthInputRef = useRef<TextInput>(null);
  const yearInputRef = useRef<TextInput>(null);
  useEffect(() => setValue(draft), [draft]);
  if (!value) return null;
  return (
    <EditorShell visible title={value.id ? "Edit child profile" : "Add child profile"} busy={busy} canSave={Boolean(value.name.trim())} onCancel={onCancel} onSave={() => onSave(value)}>
      <TextInput accessibilityLabel="Child nickname or first name" value={value.name} onChangeText={(name) => setValue({ ...value, name })} placeholder="Nickname or first name" autoCapitalize="words" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => monthInputRef.current?.focus()} style={styles.editorInput} />
      <Text style={styles.editorLabel}>Profile color</Text>
      <View accessibilityRole="radiogroup" style={styles.avatarChoices}>{CHILD_COLORS.map((color) => <Pressable key={color} haptic={value.avatarColor === color ? false : "selection"} accessibilityRole="radio" accessibilityLabel={`${CHILD_COLOR_LABELS[color]} profile color`} accessibilityState={{ selected: value.avatarColor === color }} onPress={() => setValue({ ...value, avatarColor: color })} style={[styles.colorChoice, { backgroundColor: color }, value.avatarColor === color && styles.colorChoiceSelected]} />)}</View>
      <Text style={styles.editorLabel}>Birth month and year (optional)</Text>
      <View style={styles.birthRow}>
        <TextInput ref={monthInputRef} accessibilityLabel="Birth month" value={value.birthMonth} onChangeText={(birthMonth) => setValue({ ...value, birthMonth })} placeholder="Month" keyboardType="number-pad" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => yearInputRef.current?.focus()} maxLength={2} style={[styles.editorInput, styles.birthInput]} />
        <TextInput ref={yearInputRef} accessibilityLabel="Birth year" value={value.birthYear} onChangeText={(birthYear) => setValue({ ...value, birthYear })} placeholder="Year" keyboardType="number-pad" returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={dismissKeyboard} maxLength={4} style={[styles.editorInput, styles.birthInput]} />
      </View>
    </EditorShell>
  );
}

function EditorShell({ visible, title, busy, canSave, onCancel, onSave, children }: { visible: boolean; title: string; busy: boolean; canSave: boolean; onCancel: () => void; onSave: () => void; children: ReactNode }) {
  const cancel = () => {
    dismissKeyboard();
    onCancel();
  };
  const save = () => {
    dismissKeyboard();
    onSave();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.editorModalRoot}>
        <KeyboardAwareScrollView
          style={styles.editorScroll}
          contentContainerStyle={styles.editorBackdropContent}
          bottomOffset={keyboardInputBottomOffset}
          keyboardDismissMode={keyboardDismissMode}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.editorCard}>
            <Text style={styles.editorTitle}>{title}</Text>
            {children}
            <View style={styles.editorActions}>
              <ActionButton modalAction title="Cancel" onPress={cancel} />
              <ActionButton modalAction title="Save" prominent busy={busy} disabled={!canSave} onPress={save} />
            </View>
            {!canSave ? <Text style={styles.editorHint}>A name is required.</Text> : null}
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundDeep },
  content: { padding: 16, gap: 20 },
  profileHero: { flexDirection: "row", alignItems: "center", gap: 13, padding: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 24, borderCurve: "continuous" },
  adultAvatar: { width: 58, height: 58, borderRadius: 20, borderCurve: "continuous", backgroundColor: "#E5F4F1", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  adultAvatarText: { fontSize: 28, fontWeight: "900", color: colors.titleTeal },
  avatarImage: { width: "100%", height: "100%" },
  profileHeroCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 20, fontWeight: "900", color: colors.ink },
  profileEmail: { fontSize: 13, color: colors.mutedText, marginTop: 2 },
  profileProviders: { fontSize: 12, color: colors.titleTeal, marginTop: 4, fontWeight: "700" },
  profileGlassEdit: { flexShrink: 0 },
  compactGlassEdit: { flexShrink: 0 },
  errorText: { color: "#A93232", fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  sectionWrap: { gap: 7 },
  sectionTitle: { marginLeft: 4, fontSize: 13, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase", color: colors.titleTeal },
  sectionCaption: { marginHorizontal: 4, fontSize: 12, lineHeight: 17, color: colors.mutedText },
  sectionCard: { overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, borderCurve: "continuous" },
  dangerCard: { borderColor: "rgba(180,60,60,0.22)" },
  settingRow: { minHeight: 58, paddingHorizontal: 16, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  rowDetail: { fontSize: 12, lineHeight: 17, color: colors.mutedText, marginTop: 2 },
  chevron: { fontSize: 25, lineHeight: 25, color: "#AA9F91" },
  childRow: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 4 },
  childIdentity: { minHeight: 48, borderRadius: 14, padding: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  childIdentityActive: { backgroundColor: "rgba(72,198,183,0.12)" },
  childAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  childInitial: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  compactActions: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" },
  childArrowAction: { width: 44, height: 44, flexShrink: 0 },
  childTextAction: { minHeight: 44, flexShrink: 0 },
  disabled: { opacity: 0.35 },
  membershipCard: { padding: 16, gap: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  membershipHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  membershipCopy: { flex: 1, minWidth: 0 },
  membershipName: { fontSize: 27, lineHeight: 32, fontWeight: "900", letterSpacing: 0.1, color: colors.ink },
  membershipDetail: { fontSize: 13, color: colors.mutedText, marginTop: 1 },
  membershipFootnote: { fontSize: 12, color: colors.titleTeal, fontWeight: "700" },
  badge: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  proBadge: { backgroundColor: colors.bloomYellow },
  badgeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.7, color: colors.mutedText },
  proBadgeText: { color: colors.ink },
  metricsGrid: { padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", minHeight: 76, padding: 12, borderRadius: 15, borderCurve: "continuous", backgroundColor: colors.surfaceAlt },
  metricValue: { fontSize: 20, fontWeight: "900", color: colors.ink },
  metricLabel: { fontSize: 12, color: colors.mutedText, marginTop: 4 },
  cloudMeter: { padding: 16, paddingTop: 6, gap: 9 },
  meterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 4, backgroundColor: colors.titleTeal },
  preferenceBlock: { padding: 16, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chipRail: { marginHorizontal: -16 },
  chipRailContent: { paddingHorizontal: 16, gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  chipSelected: { backgroundColor: colors.titleTeal },
  chipLabel: { fontSize: 13, fontWeight: "800", color: colors.ink },
  chipLabelSelected: { color: "#FFFFFF" },
  actionButton: { minHeight: 46, margin: 12, paddingHorizontal: 15, borderRadius: 15, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  actionButtonStandalone: { margin: 0 },
  actionButtonModal: { width: 108, minHeight: 48, margin: 0, paddingHorizontal: 18 },
  actionProminent: { backgroundColor: colors.titleTeal, borderColor: colors.titleTeal },
  actionDestructive: { backgroundColor: "#FFF1F0", borderColor: "rgba(180,60,60,0.18)" },
  actionLabel: { fontSize: 15, fontWeight: "900", color: colors.titleTeal },
  actionProminentLabel: { color: "#FFFFFF" },
  dangerButton: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(180,60,60,0.14)" },
  dangerText: { color: "#B43C3C", fontWeight: "800" },
  dangerChevron: { fontSize: 25, color: "#C98D8D" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  editorModalRoot: { flex: 1 },
  editorScroll: { flex: 1, backgroundColor: "rgba(28,38,43,0.48)" },
  editorBackdropContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  editorCard: { width: "100%", maxWidth: 430, padding: 20, gap: 13, backgroundColor: colors.surface, borderRadius: 25, borderCurve: "continuous" },
  editorTitle: { fontSize: 22, fontWeight: "900", color: colors.ink },
  editorInput: { minHeight: 50, borderRadius: 14, borderCurve: "continuous", borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, backgroundColor: colors.page, fontSize: 16, color: colors.ink },
  editorLabel: { fontSize: 13, fontWeight: "800", color: colors.mutedText },
  avatarChoices: { flexDirection: "row", gap: 9, flexWrap: "wrap" },
  avatarChoice: { width: 48, height: 48, borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  avatarChoiceSelected: { borderWidth: 3, borderColor: colors.titleTeal },
  avatarChoiceText: { fontSize: 24 },
  colorChoice: { width: 44, height: 44, borderRadius: 15 },
  colorChoiceSelected: { borderWidth: 3, borderColor: colors.ink },
  birthRow: { flexDirection: "row", gap: 10 },
  birthInput: { flex: 1 },
  editorActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 10, paddingTop: 4 },
  editorHint: { textAlign: "center", color: colors.mutedText, fontSize: 12 },
});
