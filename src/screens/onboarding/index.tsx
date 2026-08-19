import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { BukiBear } from "@/components/buki-bear";
import { BukiWordmark } from "@/components/buki-wordmark";
import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { getPublicAppConfig } from "@/config/env";
import {
  SOCIAL_AUTH_BUTTON_HEIGHT,
  SOCIAL_AUTH_BUTTON_RADIUS,
  SOCIAL_AUTH_CONTENT_GAP,
  SOCIAL_AUTH_ICON_SIZE,
  SOCIAL_AUTH_LABEL_FONT_SIZE,
} from "@/layouts/social-auth-layout";
import { shouldHydrateOnboardingField } from "@/screens/onboarding/form-hydration";
import { useAuth } from "@/store/auth";
import { confirmAdult } from "@/store/parental-gate";
import { useProfiles } from "@/store/profiles";
import { colors } from "@/theme";
import { Haptics, impactHaptic } from "@/utils/haptics";
import {
  dismissKeyboard,
  keyboardDismissMode,
  keyboardInputBottomOffset,
} from "@/utils/keyboard";

const ADULT_AVATARS = ["🌻", "🦊", "🐻", "🌈", "⭐️"] as const;
const CHILD_COLORS = [
  "#FFD65A",
  "#70D0BD",
  "#86B8EA",
  "#FFA7B9",
  "#A98BE6",
] as const;

async function openExternal(url: string) {
  if (!(await confirmAdult("This link opens outside Buki."))) return;
  Alert.alert("Open in your browser?", url, [
    { text: "Cancel", style: "cancel" },
    { text: "Open", onPress: () => void Linking.openURL(url) },
  ]);
}

export function OnboardingScreen() {
  const status = useAuth((state) => state.status);
  const authBusy = useAuth((state) => state.busy);
  const authError = useAuth((state) => state.error);
  const profile = useAuth((state) => state.profile);
  const otpEmail = useAuth((state) => state.otpEmail);
  const sendEmailOtp = useAuth((state) => state.sendEmailOtp);
  const resetEmailOtp = useAuth((state) => state.resetEmailOtp);
  const signInWithApple = useAuth((state) => state.signInWithApple);
  const signInWithGoogle = useAuth((state) => state.signInWithGoogle);
  const refreshProfile = useAuth((state) => state.refreshProfile);
  const signOut = useAuth((state) => state.signOut);
  const children = useProfiles((state) => state.children);
  const profileBusy = useProfiles((state) => state.busy);
  const profileError = useProfiles((state) => state.error);
  const completeOnboarding = useProfiles((state) => state.completeOnboarding);

  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [adultName, setAdultName] = useState("");
  const [adultAvatar, setAdultAvatar] =
    useState<(typeof ADULT_AVATARS)[number]>("🌻");
  const [childName, setChildName] = useState("");
  const [childColor, setChildColor] =
    useState<(typeof CHILD_COLORS)[number]>("#FFD65A");
  const adultNameHydratedFor = useRef<string | null>(null);
  const childHydratedFor = useRef<string | null>(null);
  const childNameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const accountId = profile?.id;
    if (
      shouldHydrateOnboardingField(
        status,
        accountId,
        adultNameHydratedFor.current,
        Boolean(profile?.displayName),
      )
    ) {
      adultNameHydratedFor.current = accountId ?? null;
      setAdultName(profile?.displayName ?? "");
    }

    const existingChild = children[0];
    if (
      shouldHydrateOnboardingField(
        status,
        accountId,
        childHydratedFor.current,
        Boolean(existingChild),
      )
    ) {
      childHydratedFor.current = accountId ?? null;
      if (existingChild && existingChild.name !== "My Child") {
        setChildName(existingChild.name);
        setChildColor(
          existingChild.avatarColor as (typeof CHILD_COLORS)[number],
        );
      }
    }
  }, [children, profile?.displayName, profile?.id, status]);

  const config = getPublicAppConfig();
  const busy = authBusy || profileBusy;
  const visibleError = authError ?? profileError;

  return (
    <View style={styles.flex}>
      <KeyboardAwareScrollView
        style={styles.flex}
        bottomOffset={keyboardInputBottomOffset}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <BukiBear style={styles.mascot} />
          <BukiWordmark
            fontSize={48}
            accessibilityRole="header"
            style={styles.wordmark}
          />
          <Text style={styles.headline}>
            {status === "signedIn"
              ? "Make it yours"
              : "Keep every little masterpiece"}
          </Text>
          <Text style={styles.subhead}>
            {status === "signedIn"
              ? "Your account owns the library. Children are simple profiles—never separate logins."
              : "A private, parent-managed home for children’s art. Start free and experience Buki before deciding about Pro."}
          </Text>
        </View>

        {status === "signedIn" ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>ADULT PROFILE</Text>
            <TextInput
              value={adultName}
              onChangeText={setAdultName}
              placeholder="Your display name"
              placeholderTextColor={colors.mutedText}
              autoCapitalize="words"
              textContentType="name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => childNameInputRef.current?.focus()}
              style={styles.input}
              accessibilityLabel="Adult display name"
            />
            <View style={styles.avatarRow}>
              {ADULT_AVATARS.map((avatar) => (
                <Pressable
                  key={avatar}
                  haptic={adultAvatar === avatar ? false : "selection"}
                  onPress={() => setAdultAvatar(avatar)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Adult avatar ${avatar}`}
                  accessibilityState={{ selected: adultAvatar === avatar }}
                  style={[
                    styles.avatarChoice,
                    adultAvatar === avatar && styles.avatarChoiceSelected,
                  ]}
                >
                  <Text style={styles.avatarEmoji}>{avatar}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />
            <Text style={styles.eyebrow}>FIRST CHILD</Text>
            <TextInput
              ref={childNameInputRef}
              value={childName}
              onChangeText={setChildName}
              placeholder="Nickname or first name"
              placeholderTextColor={colors.mutedText}
              autoCapitalize="words"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={dismissKeyboard}
              style={styles.input}
              accessibilityLabel="Child profile name"
            />
            <View style={styles.colorRow}>
              {CHILD_COLORS.map((color) => (
                <Pressable
                  key={color}
                  haptic={childColor === color ? false : "selection"}
                  onPress={() => setChildColor(color)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Child color ${color}`}
                  accessibilityState={{ selected: childColor === color }}
                  style={[
                    styles.colorChoice,
                    { backgroundColor: color },
                    childColor === color && styles.colorChoiceSelected,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.helper}>
              Birth month and year are optional and can be added later. Buki
              never creates a login for a child.
            </Text>
            <PrimaryButton
              title="Create my Buki"
              busy={busy}
              onPress={() => {
                void (async () => {
                  const completed = await completeOnboarding({
                    adultName,
                    adultAvatarUri: `emoji:${adultAvatar}`,
                    childName,
                    childAvatarColor: childColor,
                  });
                  if (completed) await refreshProfile();
                })();
              }}
            />
            <Pressable
              onPress={() => void signOut()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Use a different account"
              style={styles.textButton}
            >
              <Text style={styles.textButtonLabel}>
                Use a different account
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Adult sign in</Text>
            <Text style={styles.cardCopy}>
              Sign in keeps the library tied to you and prepares secure restore
              across devices.
            </Text>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={SOCIAL_AUTH_BUTTON_RADIUS}
              pointerEvents={busy ? "none" : "auto"}
              style={[styles.appleButton, busy && styles.disabled]}
              onPress={() => {
                if (busy) return;
                impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
                void signInWithApple();
              }}
            />

            <Pressable
              haptic="medium"
              onPress={() => void signInWithGoogle()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
              accessibilityState={{ disabled: busy }}
              style={({ pressed }) => [
                styles.googleButton,
                pressed && styles.socialAuthPressed,
                busy && styles.disabled,
              ]}
            >
              <View style={styles.socialAuthContent}>
                <Image
                  source={require("../../../assets/images/google-g.png")}
                  contentFit="contain"
                  accessibilityElementsHidden
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonLabel}>
                  Sign in with Google
                </Text>
              </View>
            </Pressable>

            <View style={styles.authDivider} accessibilityElementsHidden>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerLabel}>or</Text>
              <View style={styles.authDividerLine} />
            </View>

            {!showEmail ? (
              <Pressable
                onPress={() => setShowEmail(true)}
                accessibilityRole="button"
                accessibilityLabel="Continue with email sign-in link"
                style={styles.emailReveal}
              >
                <Text style={styles.emailRevealLabel}>
                  Continue with email link
                </Text>
              </Pressable>
            ) : (
              <View style={styles.emailForm}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  submitBehavior="blurAndSubmit"
                  onSubmitEditing={() => {
                    dismissKeyboard();
                    if (!busy) void sendEmailOtp(email);
                  }}
                  style={styles.input}
                  accessibilityLabel="Email address"
                />
                {otpEmail ? (
                  <>
                    <Text style={styles.cardCopy} accessibilityRole="alert">
                      We sent a one-time sign-in link to {otpEmail}. Open it on
                      this iPhone to continue.
                    </Text>
                    <PrimaryButton
                      title="Send link again"
                      busy={busy}
                      onPress={() => void sendEmailOtp(otpEmail)}
                    />
                    <Pressable
                      onPress={() => {
                        resetEmailOtp();
                      }}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Use a different email"
                      style={styles.textButton}
                    >
                      <Text style={styles.textButtonLabel}>
                        Use a different email
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <PrimaryButton
                    title="Email me a sign-in link"
                    busy={busy}
                    onPress={() => void sendEmailOtp(email)}
                  />
                )}
              </View>
            )}
          </View>
        )}

        {visibleError ? (
          <Text selectable accessibilityRole="alert" style={styles.error}>
            {visibleError}
          </Text>
        ) : null}

        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Private by design</Text>
          <Text style={styles.privacyCopy}>
            Buki stores only the adult account details and the child profile
            information you choose to add. Artwork is not public.
          </Text>
          <View style={styles.linkRow}>
            <Pressable
              onPress={() => void openExternal(config.privacyUrl)}
              accessibilityRole="link"
              accessibilityLabel="Privacy policy"
              style={styles.linkTouch}
            >
              <Text style={styles.link}>Privacy</Text>
            </Pressable>
            <Pressable
              onPress={() => void openExternal(config.termsUrl)}
              accessibilityRole="link"
              accessibilityLabel="Terms of service"
              style={styles.linkTouch}
            >
              <Text style={styles.link}>Terms</Text>
            </Pressable>
            <Pressable
              onPress={() => void openExternal(config.supportUrl)}
              accessibilityRole="link"
              accessibilityLabel="Support"
              style={styles.linkTouch}
            >
              <Text style={styles.link}>Support</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function PrimaryButton({
  title,
  busy,
  onPress,
}: {
  title: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.pressed,
        busy && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.primaryLabel}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 22, paddingTop: 34, paddingBottom: 48, gap: 18 },
  hero: { alignItems: "center", gap: 8, paddingHorizontal: 12 },
  mascot: { width: 132, height: 151, marginBottom: -8 },
  wordmark: { maxWidth: "100%", textAlign: "center", marginVertical: -3 },
  headline: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
  },
  subhead: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.mutedText,
    textAlign: "center",
    maxWidth: 420,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: "0 12px 30px rgba(40,67,90,0.10)",
  },
  cardTitle: { fontSize: 22, fontWeight: "800", color: colors.ink },
  cardCopy: { fontSize: 15, lineHeight: 21, color: colors.mutedText },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: colors.titleTeal,
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.page,
    paddingHorizontal: 15,
    fontSize: 17,
    color: colors.ink,
  },
  appleButton: { width: "100%", height: SOCIAL_AUTH_BUTTON_HEIGHT },
  googleButton: {
    height: SOCIAL_AUTH_BUTTON_HEIGHT,
    borderRadius: SOCIAL_AUTH_BUTTON_RADIUS,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#8E918F",
    backgroundColor: "#131314",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  socialAuthContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SOCIAL_AUTH_CONTENT_GAP,
  },
  googleIcon: {
    width: SOCIAL_AUTH_ICON_SIZE,
    height: SOCIAL_AUTH_ICON_SIZE,
  },
  googleButtonLabel: {
    color: "#E3E3E3",
    fontSize: SOCIAL_AUTH_LABEL_FONT_SIZE,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  socialAuthPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  authDivider: { flexDirection: "row", alignItems: "center", gap: 10 },
  authDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  authDividerLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  emailReveal: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  emailRevealLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.titleTeal,
  },
  emailForm: { gap: 12 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 15,
    borderCurve: "continuous",
    backgroundColor: colors.titleTeal,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryLabel: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  avatarRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  avatarChoice: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.page,
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarChoiceSelected: {
    borderColor: colors.titleTeal,
    backgroundColor: "#EAF7F5",
  },
  avatarEmoji: { fontSize: 25 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorChoice: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  colorChoiceSelected: {
    borderColor: colors.ink,
    transform: [{ scale: 1.08 }],
  },
  helper: { fontSize: 13, lineHeight: 19, color: colors.mutedText },
  textButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  textButtonLabel: { color: colors.mutedText, fontSize: 14, fontWeight: "700" },
  error: {
    color: "#A93232",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  privacyCard: { padding: 18, gap: 8, alignItems: "center" },
  privacyTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  privacyCopy: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
    textAlign: "center",
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    paddingTop: 3,
  },
  linkTouch: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  link: { color: colors.titleTeal, fontWeight: "700", fontSize: 13 },
});
