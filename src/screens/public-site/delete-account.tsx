import { Text, View } from "react-native";

import {
  PublicPageHero,
  PublicSiteMeta,
  PublicSiteShell,
  SupportEmailLink,
  usePublicSitePalette,
} from "@/components/public-site";
import { deletionSteps } from "@/marketing/content";

function InformationPanel({
  title,
  children,
  accent = "teal",
}: {
  title: string;
  children: string;
  accent?: "teal" | "coral" | "blue";
}) {
  const palette = usePublicSitePalette();
  const accentColor =
    accent === "coral"
      ? palette.coral
      : accent === "blue"
        ? palette.blue
        : palette.teal;

  return (
    <View
      style={{
        paddingVertical: 25,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        flexDirection: "row",
        gap: 16,
      }}
    >
      <View
        style={{
          width: 9,
          height: 9,
          marginTop: 8,
          borderRadius: 5,
          backgroundColor: accentColor,
        }}
      />
      <View style={{ flex: 1, gap: 8 }}>
        <Text
          style={{
            color: palette.ink,
            fontSize: 20,
            lineHeight: 26,
            fontWeight: "900",
          }}
        >
          {title}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 25 }}>
          {children}
        </Text>
      </View>
    </View>
  );
}

export function DeleteAccountPage() {
  const palette = usePublicSitePalette();
  const compact = true;

  return (
    <PublicSiteShell>
      <PublicSiteMeta
        title="Delete your Buki account"
        description="How an adult account owner can permanently delete a Buki account and associated cloud content."
        path="/delete-account"
        keywords={["delete Buki account", "delete Buki cloud data"]}
      />
      <PublicPageHero
        eyebrow="Account control"
        title="Delete your Buki account"
        summary="Deletion starts inside Buki so the adult account owner can review what will be removed and confirm the permanent action."
      />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: compact ? 28 : 42,
        }}
      >
        <View
          style={{
            flexGrow: 1.05,
            flexShrink: 1,
            flexBasis: 500,
            minWidth: 0,
            width: "100%",
            padding: compact ? 24 : 34,
            borderRadius: 30,
            backgroundColor: palette.teal,
            shadowColor: palette.tealStrong,
            shadowOpacity: 0.17,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 13 },
            gap: 24,
          }}
        >
          <View style={{ gap: 7 }}>
            <Text
              style={{
                color: "rgba(255,255,255,0.72)",
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 1,
              }}
            >
              COMPLETE THESE STEPS IN BUKI
            </Text>
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "PatrickHand",
                fontSize: compact ? 34 : 40,
              }}
            >
              Delete inside the app
            </Text>
          </View>
          <View>
            {deletionSteps.map((step, index) => (
              <View
                key={step}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 14,
                  paddingVertical: 14,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "rgba(255,255,255,0.13)",
                }}
              >
                <View
                  style={{
                    width: 31,
                    height: 31,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.14)",
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontFamily: "PatrickHand",
                      fontSize: 17,
                    }}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text
                  style={{
                    flex: 1,
                    color: "rgba(255,255,255,0.9)",
                    fontSize: 16,
                    lineHeight: 25,
                  }}
                >
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View
          style={{
            flexGrow: 0.95,
            flexShrink: 1,
            flexBasis: 420,
            minWidth: 0,
            width: "100%",
            gap: 4,
          }}
        >
          <Text
            style={{
              color: palette.coral,
              fontSize: 13,
              fontWeight: "900",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Before you confirm
          </Text>
          <Text
            style={{
              color: palette.ink,
              fontFamily: "PatrickHand",
              fontSize: compact ? 35 : 42,
              lineHeight: compact ? 39 : 45,
              marginBottom: 9,
            }}
          >
            Know exactly what happens next.
          </Text>
          <InformationPanel title="What deletion removes">
            Deletion removes the adult account, child profiles, sketchpads,
            artwork metadata, tags, cloud media, sync records, and other cloud
            content owned by that account. Offline local files may need to be
            removed directly from those devices. Limited security, transaction,
            and deletion records may be retained where required.
          </InformationPanel>
          <InformationPanel
            title="Apple subscriptions are separate"
            accent="coral"
          >
            Deleting Buki does not automatically cancel an App Store
            subscription. To prevent a future renewal, open Apple Settings,
            choose your name, open Subscriptions, select Buki, and cancel there.
            Apple controls billing and refund requests.
          </InformationPanel>
          <InformationPanel title="Save a copy first" accent="blue">
            If you have active Pro access and want to keep a copy, create the
            exports or Buki archive you need before deletion. Account deletion
            is permanent after applicable recovery and legal-retention periods.
          </InformationPanel>
        </View>
      </View>

      <View
        style={{
          marginTop: compact ? 58 : 78,
          padding: compact ? 24 : 34,
          borderRadius: 28,
          backgroundColor: palette.backgroundDeep,
          borderWidth: 1,
          borderColor: palette.border,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
        }}
      >
        <View style={{ flex: 1, maxWidth: 760, gap: 8 }}>
          <Text
            style={{
              color: palette.ink,
              fontFamily: "PatrickHand",
              fontSize: 29,
            }}
          >
            Can’t access the app?
          </Text>
          <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 24 }}>
            Email us from the address connected to your Buki account with the
            subject “Buki account deletion request.” We may ask for limited
            information to verify account ownership.
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 18,
            paddingVertical: 13,
            borderRadius: 15,
            backgroundColor: palette.surfaceStrong,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <SupportEmailLink label="Contact Buki support" />
        </View>
      </View>
    </PublicSiteShell>
  );
}
