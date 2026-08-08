import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getPublicAppConfig } from "@/config/env";
import { useAuth } from "@/store/auth";
import { confirmAdult } from "@/store/parental-gate";
import { useProfiles } from "@/store/profiles";
import { colors, PATRICK_HAND } from "@/theme";
import { useFonts } from "expo-font";

const ADULT_AVATARS = ["🌻", "🦊", "🐻", "🌈", "⭐️"] as const;
const CHILD_COLORS = ["#FFD65A", "#70D0BD", "#86B8EA", "#FFA7B9", "#A98BE6"] as const;

async function openExternal(url: string) {
  if (!(await confirmAdult("This link opens outside Buki."))) return;
  Alert.alert("Open in your browser?", url, [
    { text: "Cancel", style: "cancel" },
    { text: "Open", onPress: () => void Linking.openURL(url) },
  ]);
}

export function OnboardingScreen() {
  const [brandFontLoaded] = useFonts({ PatrickHand: PATRICK_HAND });
  const status = useAuth((state) => state.status);
  const authBusy = useAuth((state) => state.busy);
  const authError = useAuth((state) => state.error);
  const profile = useAuth((state) => state.profile);
  const otpEmail = useAuth((state) => state.otpEmail);
  const sendEmailOtp = useAuth((state) => state.sendEmailOtp);
  const verifyEmailOtp = useAuth((state) => state.verifyEmailOtp);
  const signInWithApple = useAuth((state) => state.signInWithApple);
  const signInWithGoogle = useAuth((state) => state.signInWithGoogle);
  const refreshProfile = useAuth((state) => state.refreshProfile);
  const signOut = useAuth((state) => state.signOut);
  const children = useProfiles((state) => state.children);
  const profileBusy = useProfiles((state) => state.busy);
  const profileError = useProfiles((state) => state.error);
  const completeOnboarding = useProfiles((state) => state.completeOnboarding);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [adultName, setAdultName] = useState("");
  const [adultAvatar, setAdultAvatar] = useState<(typeof ADULT_AVATARS)[number]>("🌻");
  const [childName, setChildName] = useState("");
  const [childColor, setChildColor] = useState<(typeof CHILD_COLORS)[number]>("#FFD65A");

  useEffect(() => {
    if (status !== "signedIn") return;
    if (!adultName && profile?.displayName) setAdultName(profile.displayName);
    const existingChild = children[0];
    if (!childName && existingChild && existingChild.name !== "My Child") {
      setChildName(existingChild.name);
      setChildColor(existingChild.avatarColor as (typeof CHILD_COLORS)[number]);
    }
  }, [adultName, childName, children, profile?.displayName, status]);

  const config = getPublicAppConfig();
  const busy = authBusy || profileBusy;
  const visibleError = authError ?? profileError;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <Image source={require("@/assets/images/icon.png")} style={styles.logo} contentFit="contain" />
          <Text style={[styles.wordmark, brandFontLoaded && styles.brandFont]}>Buki</Text>
          <Text style={styles.headline}>
            {status === "signedIn" ? "Make it yours" : "Keep every little masterpiece"}
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
              style={styles.input}
              accessibilityLabel="Adult display name"
            />
            <View style={styles.avatarRow}>
              {ADULT_AVATARS.map((avatar) => (
                <Pressable
                  key={avatar}
                  onPress={() => setAdultAvatar(avatar)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Adult avatar ${avatar}`}
                  accessibilityState={{ selected: adultAvatar === avatar }}
                  style={[styles.avatarChoice, adultAvatar === avatar && styles.avatarChoiceSelected]}
                >
                  <Text style={styles.avatarEmoji}>{avatar}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />
            <Text style={styles.eyebrow}>FIRST CHILD</Text>
            <TextInput
              value={childName}
              onChangeText={setChildName}
              placeholder="Nickname or first name"
              placeholderTextColor={colors.mutedText}
              autoCapitalize="words"
              style={styles.input}
              accessibilityLabel="Child profile name"
            />
            <View style={styles.colorRow}>
              {CHILD_COLORS.map((color) => (
                <Pressable
                  key={color}
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
              Birth month and year are optional and can be added later. Buki never creates a login for a child.
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
            <Pressable onPress={() => void signOut()} disabled={busy} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Use a different account</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Adult sign in</Text>
            <Text style={styles.cardCopy}>
              Sign in keeps the library tied to you and prepares secure restore across devices.
            </Text>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={styles.appleButton}
              onPress={() => void signInWithApple()}
            />
            <Pressable
              onPress={() => void signInWithGoogle()}
              disabled={busy}
              style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
            >
              <View style={styles.googleMark}>
                <Text style={styles.googleLetter}>G</Text>
              </View>
              <Text style={styles.googleLabel}>Continue with Google</Text>
            </Pressable>

            {!showEmail ? (
              <Pressable onPress={() => setShowEmail(true)} style={styles.emailReveal}>
                <Text style={styles.emailRevealLabel}>Continue with email code</Text>
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
                  style={styles.input}
                  accessibilityLabel="Email address"
                />
                {otpEmail ? (
                  <>
                    <TextInput
                      value={otp}
                      onChangeText={setOtp}
                      placeholder="6-digit code"
                      placeholderTextColor={colors.mutedText}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      maxLength={8}
                      style={styles.input}
                      accessibilityLabel="Email verification code"
                    />
                    <PrimaryButton
                      title="Verify code"
                      busy={busy}
                      onPress={() => void verifyEmailOtp(otpEmail, otp)}
                    />
                  </>
                ) : (
                  <PrimaryButton
                    title="Email me a code"
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
            Buki stores only the adult account details and the child profile information you choose to add. Artwork is not public.
          </Text>
          <View style={styles.linkRow}>
            <Pressable onPress={() => void openExternal(config.privacyUrl)}>
              <Text style={styles.link}>Privacy</Text>
            </Pressable>
            <Pressable onPress={() => void openExternal(config.termsUrl)}>
              <Text style={styles.link}>Terms</Text>
            </Pressable>
            <Pressable onPress={() => void openExternal(config.supportUrl)}>
              <Text style={styles.link}>Support</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({ title, busy, onPress }: { title: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryLabel}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 22, paddingTop: 34, paddingBottom: 48, gap: 18 },
  hero: { alignItems: "center", gap: 8, paddingHorizontal: 12 },
  logo: { width: 88, height: 88 },
  wordmark: { fontSize: 38, lineHeight: 42, fontWeight: "800", color: colors.titleTeal },
  brandFont: { fontFamily: "PatrickHand", fontWeight: "400", fontSize: 46 },
  headline: { fontSize: 25, lineHeight: 31, fontWeight: "800", color: colors.ink, textAlign: "center" },
  subhead: { fontSize: 16, lineHeight: 23, color: colors.mutedText, textAlign: "center", maxWidth: 420 },
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
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.1, color: colors.titleTeal },
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
  appleButton: { width: "100%", height: 52 },
  googleButton: {
    minHeight: 52,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },
  googleMark: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  googleLetter: { fontSize: 18, fontWeight: "900", color: "#4285F4" },
  googleLabel: { fontSize: 16, fontWeight: "700", color: "#1F1F1F" },
  emailReveal: { alignItems: "center", paddingVertical: 8 },
  emailRevealLabel: { fontSize: 15, fontWeight: "700", color: colors.titleTeal },
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
  avatarChoiceSelected: { borderColor: colors.titleTeal, backgroundColor: "#EAF7F5" },
  avatarEmoji: { fontSize: 25 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorChoice: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: colors.surface },
  colorChoiceSelected: { borderColor: colors.ink, transform: [{ scale: 1.08 }] },
  helper: { fontSize: 13, lineHeight: 19, color: colors.mutedText },
  textButton: { alignItems: "center", paddingVertical: 6 },
  textButtonLabel: { color: colors.mutedText, fontSize: 14, fontWeight: "700" },
  error: { color: "#A93232", fontSize: 14, lineHeight: 20, textAlign: "center", paddingHorizontal: 8 },
  privacyCard: { padding: 18, gap: 8, alignItems: "center" },
  privacyTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  privacyCopy: { fontSize: 13, lineHeight: 19, color: colors.mutedText, textAlign: "center" },
  linkRow: { flexDirection: "row", gap: 20, paddingTop: 3 },
  link: { color: colors.titleTeal, fontWeight: "700", fontSize: 13 },
});
