import { Text, View } from "react-native";

import {
  PublicSiteLink,
  PublicSiteMeta,
  PublicSiteShell,
  SupportEmailLink,
  usePublicSitePalette,
} from "@/components/public-site";
import { supportQuestions } from "@/marketing/content";

export function PublicSupportScreen() {
  const palette = usePublicSitePalette();
  return (
    <PublicSiteShell>
      <PublicSiteMeta
        title="Buki Support"
        description="Help with Buki accounts, purchases, backup, restoration, privacy, and account deletion."
        path="/support"
      />
      <View style={{ paddingTop: 66, maxWidth: 780, gap: 18 }}>
        <Text style={{ color: palette.coral, fontSize: 13, fontWeight: "900", letterSpacing: 0.7 }}>Buki support</Text>
        <Text
          accessibilityRole="header"
          style={{
            color: palette.ink,
            fontSize: 48,
            lineHeight: 54,
            fontWeight: "900",
            letterSpacing: -1.7,
          }}
        >
          Help for the family archive.
        </Text>
        <Text style={{ color: palette.muted, fontSize: 18, lineHeight: 29 }}>
          Tell us what happened, which iPhone or iPad you use, your Buki app version, and any message shown on screen. Please do not email artwork or child information unless it is necessary for your request.
        </Text>
        <SupportEmailLink />
        <PublicSiteLink href="/delete-account" label="Account deletion help" variant="secondary" />
      </View>

      <View style={{ paddingTop: 78, gap: 28 }}>
        <View style={{ gap: 10, maxWidth: 700 }}>
          <Text style={{ color: palette.ink, fontSize: 34, lineHeight: 40, fontWeight: "900", letterSpacing: -1 }}>
            Common questions
          </Text>
          <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 25 }}>
            Most account, purchase, and backup issues can be resolved from Account Center in the app.
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {supportQuestions.map((item, index) => (
            <View
              key={item.question}
              style={{
                flexGrow: 1,
                flexBasis: index === 0 || index === 5 ? 500 : 330,
                flexShrink: 1,
                minWidth: 0,
                padding: 25,
                borderRadius: 22,
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                gap: 10,
              }}
            >
              <Text style={{ color: palette.ink, fontSize: 19, lineHeight: 25, fontWeight: "900" }}>{item.question}</Text>
              <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 24 }}>{item.answer}</Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={{
          marginTop: 72,
          padding: 26,
          borderRadius: 24,
          backgroundColor: palette.backgroundDeep,
          gap: 22,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ color: palette.ink, fontSize: 24, fontWeight: "900" }}>Contact support</Text>
          <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 25 }}>
            Email is currently the fastest way to reach Buki support. Include your account email, app version, iOS version, and steps that reproduce the issue. Never send your Apple password, verification code, or complete payment details.
          </Text>
        </View>
        <SupportEmailLink label="Email Buki support" />
        <Text style={{ color: palette.muted, fontSize: 14 }}>Typical response target: within 2 business days.</Text>
        <View style={{ height: 1, backgroundColor: palette.border }} />
        <View style={{ gap: 9 }}>
          <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "900" }}>Need access, correction, or deletion?</Text>
          <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 24 }}>
            Use the same support email with the subject “Buki privacy request.” We may verify account ownership before acting on a request.
          </Text>
          <PublicSiteLink href="/privacy" label="Read privacy policy" variant="text" />
        </View>
      </View>
    </PublicSiteShell>
  );
}
