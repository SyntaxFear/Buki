import { Text, View } from "react-native";

import {
  PublicPageHero,
  PublicSiteLink,
  PublicSiteMeta,
  PublicSiteShell,
  SupportEmailLink,
  usePublicSitePalette,
} from "@/components/public-site";
import { supportQuestions } from "@/marketing/content";

function SupportNote() {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        width: 220,
        padding: 22,
        borderRadius: 24,
        backgroundColor: "rgba(255,118,94,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,118,94,0.16)",
        gap: 9,
        transform: [{ rotate: "1.5deg" }],
      }}
    >
      <Text
        style={{
          color: palette.coral,
          fontFamily: "PatrickHand",
          fontSize: 23,
        }}
      >
        Helpful details
      </Text>
      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 20 }}>
        Include your Buki version, iOS version, and the steps that led to the
        issue.
      </Text>
    </View>
  );
}

export function PublicSupportScreen() {
  const palette = usePublicSitePalette();
  const compact = true;

  return (
    <PublicSiteShell>
      <PublicSiteMeta
        title="Buki Support"
        description="Help with Buki accounts, purchases, backup, restoration, privacy, and account deletion."
        path="/support"
        pageType="ContactPage"
        keywords={["Buki support", "restore Buki Pro", "Buki cloud backup"]}
      />
      <PublicPageHero
        eyebrow="Buki support"
        title="Help for the family archive."
        summary="Tell us what happened and we’ll help you find a calm next step. Please do not email artwork or child information unless it is necessary for your request."
        aside={<SupportNote />}
      />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 18,
          marginBottom: compact ? 68 : 92,
        }}
      >
        <View
          style={{
            flexGrow: 1.25,
            flexShrink: 1,
            flexBasis: 500,
            minWidth: 0,
            minHeight: 260,
            padding: compact ? 24 : 32,
            borderRadius: 30,
            backgroundColor: palette.teal,
            overflow: "hidden",
            justifyContent: "space-between",
            gap: 30,
          }}
        >
          <View
            style={{
              position: "absolute",
              width: 180,
              height: 180,
              borderRadius: 90,
              right: -50,
              top: -70,
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          />
          <View style={{ gap: 10, maxWidth: 600 }}>
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "PatrickHand",
                fontSize: 34,
              }}
            >
              Email Buki support
            </Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.82)",
                fontSize: 16,
                lineHeight: 25,
              }}
            >
              Email is currently the fastest way to reach us. Never send your
              Apple password, verification code, or complete payment details.
            </Text>
          </View>
          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 18,
              paddingVertical: 13,
              borderRadius: 15,
              backgroundColor: "#FFFFFF",
            }}
          >
            <SupportEmailLink label="Write to Buki support" />
          </View>
        </View>

        <View
          style={{
            flexGrow: 0.75,
            flexShrink: 1,
            flexBasis: 280,
            minWidth: 0,
            gap: 18,
          }}
        >
          <View
            style={{
              flex: 1,
              minHeight: 120,
              padding: 24,
              borderRadius: 26,
              backgroundColor: palette.surfaceStrong,
              borderWidth: 1,
              borderColor: palette.border,
              gap: 10,
            }}
          >
            <Text
              style={{
                color: palette.ink,
                fontFamily: "PatrickHand",
                fontSize: 25,
              }}
            >
              Typical response target
            </Text>
            <Text
              style={{ color: palette.teal, fontSize: 24, fontWeight: "900" }}
            >
              Within 2 business days
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              minHeight: 120,
              padding: 24,
              borderRadius: 26,
              backgroundColor: palette.backgroundDeep,
              borderWidth: 1,
              borderColor: palette.border,
              gap: 10,
            }}
          >
            <Text
              style={{
                color: palette.ink,
                fontFamily: "PatrickHand",
                fontSize: 25,
              }}
            >
              Need to remove an account?
            </Text>
            <PublicSiteLink
              href="/delete-account"
              label="Account deletion help"
              variant="text"
            />
          </View>
        </View>
      </View>

      <View style={{ gap: 32 }}>
        <View style={{ gap: 10, maxWidth: 720 }}>
          <Text
            style={{
              color: palette.coral,
              fontSize: 13,
              fontWeight: "900",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Common questions
          </Text>
          <Text
            style={{
              color: palette.ink,
              fontFamily: "PatrickHand",
              fontSize: compact ? 39 : 48,
              lineHeight: compact ? 43 : 51,
            }}
          >
            A quick answer may already be here.
          </Text>
          <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 25 }}>
            Most account, purchase, and backup issues can be resolved from Adult
            Account inside the app.
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {supportQuestions.map((item, index) => (
            <View
              key={item.question}
              style={{
                flexGrow: 1,
                flexBasis: index === 0 || index === 5 ? 520 : 340,
                flexShrink: 1,
                minWidth: 0,
                minHeight: index === 0 || index === 5 ? 180 : 210,
                padding: compact ? 22 : 26,
                borderRadius: 26,
                backgroundColor: palette.surfaceStrong,
                borderWidth: 1,
                borderColor: palette.border,
                shadowColor: palette.shadow,
                shadowOpacity: 0.45,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 9 },
                gap: 13,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    index % 3 === 0
                      ? "rgba(255,118,94,0.11)"
                      : index % 3 === 1
                        ? "rgba(74,121,216,0.10)"
                        : "rgba(22,125,130,0.09)",
                }}
              >
                <Text
                  style={{
                    color:
                      index % 3 === 0
                        ? palette.coral
                        : index % 3 === 1
                          ? palette.blue
                          : palette.teal,
                    fontFamily: "PatrickHand",
                    fontSize: 18,
                  }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={{
                  color: palette.ink,
                  fontSize: 19,
                  lineHeight: 25,
                  fontWeight: "900",
                }}
              >
                {item.question}
              </Text>
              <Text
                style={{ color: palette.muted, fontSize: 15, lineHeight: 24 }}
              >
                {item.answer}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={{
          marginTop: compact ? 68 : 92,
          padding: compact ? 24 : 34,
          borderRadius: 28,
          backgroundColor: "rgba(74,121,216,0.08)",
          borderWidth: 1,
          borderColor: "rgba(74,121,216,0.12)",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <View style={{ flex: 1, gap: 8, maxWidth: 760 }}>
          <Text
            style={{
              color: palette.ink,
              fontFamily: "PatrickHand",
              fontSize: 28,
            }}
          >
            Access, correction, privacy, or deletion request?
          </Text>
          <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 24 }}>
            Use the support email with the subject “Buki privacy request.” We
            may verify account ownership before acting on a request.
          </Text>
        </View>
        <PublicSiteLink
          href="/privacy"
          label="Read privacy policy"
          variant="secondary"
        />
      </View>
    </PublicSiteShell>
  );
}
