import * as Application from "expo-application";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as StoreReview from "expo-store-review";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getPublicAppConfig } from "@/config/env";
import { loadBukiUsage } from "@/database";
import { useAuth } from "@/store/auth";
import { useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { confirmAdult } from "@/store/parental-gate";
import { usePreferences } from "@/store/preferences";
import { useProfiles, type ChildProfile } from "@/store/profiles";
import type { ProFeature } from "@/subscription/access";
import { colors } from "@/theme";

const ADULT_AVATARS = ["🌻", "🦊", "🐻", "🌈", "⭐️"] as const;
const CHILD_COLORS = ["#FFD65A", "#70D0BD", "#86B8EA", "#FFA7B9", "#A98BE6"] as const;
const CLOUD_LIMIT = 2 * 1024 * 1024 * 1024;

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
  const requestUpgrade = useMembership((state) => state.requestUpgrade);
  const hapticsEnabled = usePreferences((state) => state.hapticsEnabled);
  const setHapticsEnabled = usePreferences((state) => state.setHapticsEnabled);
  const [usage, setUsage] = useState({ localBytes: 0, cloudBytes: 0 });
  const [adultEditorOpen, setAdultEditorOpen] = useState(false);
  const [childDraft, setChildDraft] = useState<ChildDraft | null>(null);

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
  const avatar = adultAvatar(profile?.avatarUri, profile?.displayName ?? "Parent");
  const cloudProgress = Math.min(1, usage.cloudBytes / CLOUD_LIMIT);

  useEffect(() => {
    void loadBukiUsage().then(setUsage).catch(() => {});
  }, [artworkCount, pads.length]);

  const openExternal = async (url: string, reason: string) => {
    if (!(await confirmAdult(reason))) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open this link", "Please try again in a moment.");
    }
  };

  const introducePro = async (feature: ProFeature, source: string) => {
    if (!(await confirmAdult("Buki Pro purchases and subscription controls are for grown-ups."))) return;
    requestUpgrade(feature, source);
    Alert.alert(
      "Buki Pro",
      "The Buki Pro purchase screen is the next setup step. Your current library stays safe while purchases are being connected.",
    );
  };

  const guardedFutureAction = async (title: string, body: string) => {
    if (!(await confirmAdult(`${title} changes account data or opens a protected tool.`))) return;
    Alert.alert(title, body);
  };

  const beginCreateChild = () => {
    if (!capabilities.maxChildren || children.length >= capabilities.maxChildren) {
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

  return (
    <View style={styles.root}>
      <View style={[styles.navigation, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.navigationEyebrow}>BUKI ACCOUNT</Text>
          <Text style={styles.navigationTitle}>Profile & Settings</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close account center"
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="never"
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
            <Text style={styles.profileName}>{profile?.displayName ?? "Buki Parent"}</Text>
            <Text style={styles.profileEmail}>{profile?.email ?? user?.email ?? "Signed in adult"}</Text>
            <Text style={styles.profileProviders}>
              {providers.length ? `Linked: ${providers.join(", ")}` : "Secure Buki account"}
            </Text>
          </View>
          <Pressable onPress={() => setAdultEditorOpen(true)} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
            <Text style={styles.smallButtonLabel}>Edit</Text>
          </Pressable>
        </View>

        {(authError || profileError) ? (
          <Text selectable accessibilityRole="alert" style={styles.errorText}>{authError ?? profileError}</Text>
        ) : null}

        <Section title="Children" caption="Child profiles belong to the adult account—children never sign in.">
          {children.map((child, index) => (
            <View key={child.id} style={styles.childRow}>
              <Pressable
                onPress={() => void setActiveChild(child.id)}
                accessibilityRole="radio"
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
                <MiniAction label="↑" disabled={index === 0} onPress={() => void moveChild(child.id, -1)} />
                <MiniAction label="↓" disabled={index === children.length - 1} onPress={() => void moveChild(child.id, 1)} />
                <MiniAction label="Edit" onPress={() => beginEditChild(child)} />
                <MiniAction label="Remove" destructive disabled={children.length === 1} onPress={() => void confirmDeleteChild(child)} />
              </View>
            </View>
          ))}
          <ActionButton title="Add child profile" onPress={beginCreateChild} />
        </Section>

        <Section title="Membership">
          <View style={styles.membershipCard}>
            <View style={styles.membershipHeader}>
              <View>
                <Text style={styles.membershipName}>{tier === "pro" ? "Buki Pro" : "Buki Free"}</Text>
                <Text style={styles.membershipDetail}>
                  {tier === "pro"
                    ? `${entitlement.product ? entitlement.product.charAt(0).toUpperCase() + entitlement.product.slice(1) : "Pro"} access`
                    : "1 child · 1 sketchpad · 20 artworks"}
                </Text>
              </View>
              <View style={[styles.badge, tier === "pro" && styles.proBadge]}>
                <Text style={[styles.badgeText, tier === "pro" && styles.proBadgeText]}>{tier.toUpperCase()}</Text>
              </View>
            </View>
            {tier === "pro" ? (
              <Text style={styles.membershipFootnote}>
                {renewalDate
                  ? `${entitlement.willRenew ? "Renews" : "Access through"} ${renewalDate}`
                  : entitlement.status === "grace" ? "Billing grace period" : "Active on this Buki account"}
              </Text>
            ) : (
              <ActionButton title="Discover Buki Pro" prominent onPress={() => void introducePro("cloudBackup", "account_membership")} />
            )}
          </View>
          <SettingRow
            title="Manage subscription"
            detail="Open Apple subscription settings"
            onPress={() => void openExternal("https://apps.apple.com/account/subscriptions", "Subscription management opens Apple’s settings.")}
          />
          <SettingRow
            title="Restore purchases"
            detail="Connects after RevenueCat purchase setup"
            onPress={() => void guardedFutureAction("Restore purchases", "Purchase restoration is enabled in the RevenueCat implementation step.")}
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
              <Text style={styles.rowDetail}>{formatBytes(usage.cloudBytes)} of 2 GB</Text>
            </View>
            <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${cloudProgress * 100}%` }]} /></View>
          </View>
        </Section>

        <Section title="Cloud Backup" caption="Pro keeps this account’s library available for restore and future devices.">
          <SettingRow
            title="Automatic backup"
            detail={capabilities.cloudBackup ? "Cloud connection is the next implementation phase" : "Buki Pro required"}
            right={<Switch value={false} disabled />}
            onPress={() => void introducePro("cloudBackup", "account_backup_toggle")}
          />
          <SettingRow title="Sync now" detail="Not connected yet" onPress={() => void introducePro("cloudBackup", "account_sync_now")} />
          <SettingRow title="Restore this device" detail="No cloud restore has run" onPress={() => void introducePro("cloudBackup", "account_restore")} />
        </Section>

        <Section title="Data & Export" caption="Exports remain on this adult-controlled screen.">
          <SettingRow title="Single artwork or share card" detail="PNG, JPG, decorated card" onPress={() => void introducePro("exportData", "account_export_artwork")} />
          <SettingRow title="Sketchpad PDF" detail="Preserve the selected layout" onPress={() => void introducePro("exportData", "account_export_pdf")} />
          <SettingRow title="Batch ZIP" detail="Images with JSON/CSV metadata" onPress={() => void introducePro("exportData", "account_export_zip")} />
          <SettingRow title="Buki archive" detail="Versioned backup and import" onPress={() => void introducePro("exportData", "account_export_archive")} />
        </Section>

        <Section title="Preferences">
          <SettingRow
            title="Haptics"
            detail="Gentle feedback for page turns and capture"
            right={<Switch value={hapticsEnabled} onValueChange={(value) => void setHapticsEnabled(value)} />}
          />
          <SettingRow
            title="Replay onboarding"
            detail="Review privacy and profile setup"
            onPress={() => {
              Alert.alert("Replay onboarding?", "Your existing profiles and artwork stay in place.", [
                { text: "Cancel", style: "cancel" },
                { text: "Replay", onPress: () => void replayOnboarding().then(() => router.dismissTo("/")) },
              ]);
            }}
          />
          <View style={styles.preferenceBlock}>
            <Text style={styles.rowTitle}>Default child</Text>
            <View style={styles.chipRow}>
              {children.map((child) => (
                <Chip key={child.id} label={child.name} selected={child.id === activeChildId} onPress={() => void setActiveChild(child.id)} />
              ))}
            </View>
          </View>
          <View style={styles.preferenceBlock}>
            <Text style={styles.rowTitle}>Default sketchpad</Text>
            <View style={styles.chipRow}>
              {visiblePads.map((pad) => (
                <Chip key={pad.id} label={pad.name} selected={pad.id === activePadId} onPress={() => setActivePad(pad.id)} />
              ))}
            </View>
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
          <SettingRow title="What’s New" detail="Free and Pro account foundation" onPress={() => Alert.alert("What’s New", "Adult accounts, child profiles, Free limits, and the new Account Center are ready. Purchases, exports, and cloud backup follow in the next implementation phases.")} />
        </Section>

        <Section title="Danger Zone" danger>
          <DangerButton title="Clear local data" onPress={() => void guardedFutureAction("Clear local data", "Cloud-safe local clearing is enabled with backup and account-deletion support.")} />
          <DangerButton title="Remove cloud copies" onPress={() => void guardedFutureAction("Remove cloud copies", "Cloud deletion becomes available after the private Buki storage backend is connected.")} />
          <DangerButton title="Delete Buki account" onPress={() => void (async () => {
            if (!(await confirmAdult("Account deletion permanently removes Buki account data."))) return;
            Alert.alert(
              "Delete Buki account",
              "Deleting Buki does not cancel an App Store subscription. The complete deletion workflow is enabled with the cloud backend so local and server copies can be removed together.",
              [{ text: "OK" }],
            );
          })()} />
        </Section>

        <ActionButton title="Sign out" destructive busy={authBusy} onPress={confirmSignOut} />
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
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.chevron}>›</Text> : null)}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}>{content}</Pressable>
  ) : <View style={styles.settingRow}>{content}</View>;
}

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function ActionButton({ title, onPress, prominent, destructive, busy, disabled }: { title: string; onPress: () => void; prominent?: boolean; destructive?: boolean; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, prominent && styles.actionProminent, destructive && styles.actionDestructive, disabled && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={destructive ? "#B43C3C" : prominent ? "#FFFFFF" : colors.titleTeal} /> : <Text style={[styles.actionLabel, prominent && styles.actionProminentLabel, destructive && styles.dangerText]}>{title}</Text>}
    </Pressable>
  );
}

function MiniAction({ label, onPress, disabled, destructive }: { label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.miniAction, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.miniActionLabel, destructive && styles.dangerText]}>{label}</Text></Pressable>;
}

function DangerButton({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.dangerButton, pressed && styles.rowPressed]}><Text style={styles.dangerText}>{title}</Text><Text style={styles.dangerChevron}>›</Text></Pressable>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text></Pressable>;
}

function AdultEditor({ visible, busy, profileName, profileAvatar, onCancel, onSave }: { visible: boolean; busy: boolean; profileName: string; profileAvatar: string | null; onCancel: () => void; onSave: (name: string, avatarUri: string | null) => Promise<void> }) {
  const [name, setName] = useState(profileName);
  const current = profileAvatar?.startsWith("emoji:") ? profileAvatar.slice("emoji:".length) : ADULT_AVATARS[0];
  const [avatar, setAvatar] = useState<string>(current);
  useEffect(() => { if (visible) { setName(profileName); setAvatar(current); } }, [current, profileName, visible]);
  return (
    <EditorShell visible={visible} title="Edit adult profile" busy={busy} canSave={Boolean(name.trim())} onCancel={onCancel} onSave={() => onSave(name, `emoji:${avatar}`)}>
      <TextInput value={name} onChangeText={setName} placeholder="Display name" autoCapitalize="words" style={styles.editorInput} />
      <View style={styles.avatarChoices}>{ADULT_AVATARS.map((item) => <Pressable key={item} onPress={() => setAvatar(item)} style={[styles.avatarChoice, avatar === item && styles.avatarChoiceSelected]}><Text style={styles.avatarChoiceText}>{item}</Text></Pressable>)}</View>
    </EditorShell>
  );
}

function ChildEditor({ draft, busy, onCancel, onSave }: { draft: ChildDraft | null; busy: boolean; onCancel: () => void; onSave: (draft: ChildDraft) => Promise<void> }) {
  const [value, setValue] = useState<ChildDraft | null>(draft);
  useEffect(() => setValue(draft), [draft]);
  if (!value) return null;
  return (
    <EditorShell visible title={value.id ? "Edit child profile" : "Add child profile"} busy={busy} canSave={Boolean(value.name.trim())} onCancel={onCancel} onSave={() => onSave(value)}>
      <TextInput value={value.name} onChangeText={(name) => setValue({ ...value, name })} placeholder="Nickname or first name" autoCapitalize="words" style={styles.editorInput} />
      <Text style={styles.editorLabel}>Profile color</Text>
      <View style={styles.avatarChoices}>{CHILD_COLORS.map((color) => <Pressable key={color} onPress={() => setValue({ ...value, avatarColor: color })} style={[styles.colorChoice, { backgroundColor: color }, value.avatarColor === color && styles.colorChoiceSelected]} />)}</View>
      <Text style={styles.editorLabel}>Birth month and year (optional)</Text>
      <View style={styles.birthRow}>
        <TextInput value={value.birthMonth} onChangeText={(birthMonth) => setValue({ ...value, birthMonth })} placeholder="Month" keyboardType="number-pad" maxLength={2} style={[styles.editorInput, styles.birthInput]} />
        <TextInput value={value.birthYear} onChangeText={(birthYear) => setValue({ ...value, birthYear })} placeholder="Year" keyboardType="number-pad" maxLength={4} style={[styles.editorInput, styles.birthInput]} />
      </View>
    </EditorShell>
  );
}

function EditorShell({ visible, title, busy, canSave, onCancel, onSave, children }: { visible: boolean; title: string; busy: boolean; canSave: boolean; onCancel: () => void; onSave: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={styles.editorBackdrop}>
        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>{title}</Text>
          {children}
          <View style={styles.editorActions}>
            <ActionButton title="Cancel" onPress={onCancel} />
            <ActionButton title="Save" prominent busy={busy} disabled={!canSave} onPress={onSave} />
          </View>
          {!canSave ? <Text style={styles.editorHint}>A name is required.</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundDeep },
  navigation: { backgroundColor: colors.surface, paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border },
  navigationEyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2, color: colors.titleCoral },
  navigationTitle: { fontSize: 25, lineHeight: 30, fontWeight: "900", color: colors.ink },
  doneButton: { minWidth: 62, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  doneLabel: { fontSize: 16, fontWeight: "800", color: colors.titleTeal },
  content: { padding: 16, gap: 20 },
  profileHero: { flexDirection: "row", alignItems: "center", gap: 13, padding: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 24, borderCurve: "continuous" },
  adultAvatar: { width: 58, height: 58, borderRadius: 20, borderCurve: "continuous", backgroundColor: "#E5F4F1", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  adultAvatarText: { fontSize: 28, fontWeight: "900", color: colors.titleTeal },
  avatarImage: { width: "100%", height: "100%" },
  profileHeroCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 20, fontWeight: "900", color: colors.ink },
  profileEmail: { fontSize: 13, color: colors.mutedText, marginTop: 2 },
  profileProviders: { fontSize: 12, color: colors.titleTeal, marginTop: 4, fontWeight: "700" },
  smallButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: "center", backgroundColor: colors.surfaceAlt },
  smallButtonLabel: { color: colors.titleTeal, fontWeight: "800" },
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
  childRow: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 9 },
  childIdentity: { minHeight: 54, borderRadius: 16, padding: 8, flexDirection: "row", alignItems: "center", gap: 11 },
  childIdentityActive: { backgroundColor: "rgba(72,198,183,0.12)" },
  childAvatar: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  childInitial: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  compactActions: { flexDirection: "row", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" },
  miniAction: { minWidth: 34, minHeight: 31, borderRadius: 11, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  miniActionLabel: { fontSize: 12, fontWeight: "800", color: colors.ink },
  disabled: { opacity: 0.35 },
  membershipCard: { padding: 16, gap: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  membershipHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  membershipName: { fontSize: 21, fontWeight: "900", color: colors.ink },
  membershipDetail: { fontSize: 13, color: colors.mutedText, marginTop: 3 },
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  chipSelected: { backgroundColor: colors.titleTeal },
  chipLabel: { fontSize: 13, fontWeight: "800", color: colors.ink },
  chipLabelSelected: { color: "#FFFFFF" },
  actionButton: { minHeight: 46, margin: 12, paddingHorizontal: 15, borderRadius: 15, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  actionProminent: { backgroundColor: colors.titleTeal, borderColor: colors.titleTeal },
  actionDestructive: { backgroundColor: "#FFF1F0", borderColor: "rgba(180,60,60,0.18)" },
  actionLabel: { fontSize: 15, fontWeight: "900", color: colors.titleTeal },
  actionProminentLabel: { color: "#FFFFFF" },
  dangerButton: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(180,60,60,0.14)" },
  dangerText: { color: "#B43C3C", fontWeight: "800" },
  dangerChevron: { fontSize: 25, color: "#C98D8D" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  editorBackdrop: { flex: 1, backgroundColor: "rgba(28,38,43,0.48)", alignItems: "center", justifyContent: "center", padding: 20 },
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
  editorActions: { flexDirection: "row" },
  editorHint: { textAlign: "center", color: colors.mutedText, fontSize: 12 },
});
