import { Text, View } from "react-native";

import {
  PublicSiteMeta,
  PublicSiteShell,
  SupportEmailLink,
  usePublicSitePalette,
} from "@/components/public-site";
import { deletionSteps } from "@/marketing/content";

function InformationPanel({ title, children, accent }: { title: string; children: string; accent?: boolean }) {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        padding: 26,
        borderRadius: 22,
        backgroundColor: accent ? palette.backgroundDeep : palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
        gap: 10,
      }}
    >
      <Text style={{ color: accent ? palette.coral : palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "900" }}>
        {title}
      </Text>
      <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 26 }}>{children}</Text>
    </View>
  );
}

export function DeleteAccountPage() {
  const palette = usePublicSitePalette();
  return (
    <PublicSiteShell>
      <PublicSiteMeta
        title="Delete your Buki account"
        description="How an adult account owner can permanently delete a Buki account and associated cloud content."
        path="/delete-account"
      />
      <View style={{ maxWidth: 790, paddingTop: 66, gap: 18 }}>
        <Text style={{ color: palette.coral, fontSize: 13, fontWeight: "900", letterSpacing: 0.7 }}>
          Effective August 8, 2026
        </Text>
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
          Delete your Buki account
        </Text>
        <Text style={{ color: palette.muted, fontSize: 18, lineHeight: 29 }}>
          Account deletion is initiated inside the Buki app so the adult account owner can review what will be removed and confirm the action.
        </Text>
      </View>

      <View style={{ maxWidth: 790, marginTop: 42, gap: 18 }}>
        <View
          style={{
            padding: 26,
            borderRadius: 24,
            backgroundColor: palette.teal,
            gap: 20,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900" }}>Delete inside Buki</Text>
          <View style={{ gap: 13 }}>
            {deletionSteps.map((step, index) => (
              <View key={step} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.16)",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>{index + 1}</Text>
                </View>
                <Text style={{ flex: 1, color: "rgba(255,255,255,0.9)", fontSize: 16, lineHeight: 25 }}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <InformationPanel title="What deletion removes">
          Deletion removes the adult Buki account, child profiles, sketchpads, artwork metadata, tags, cloud media, sync records, and other cloud content owned by that account. You can choose to remove cloud copies without deleting the full account. Local files on devices that are offline, signed out, restored from a device backup, or otherwise unavailable to the service may need to be removed directly from those devices. Limited security, transaction, and deletion records may be retained where required by law or needed to prevent fraud and prove completion of the request.
        </InformationPanel>
        <InformationPanel title="Important: Apple subscriptions are separate" accent>
          Deleting Buki does not automatically cancel an App Store subscription. To prevent a future renewal, open Apple Settings → your name → Subscriptions → Buki and cancel the subscription there. Apple controls billing and refund requests.
        </InformationPanel>
        <InformationPanel title="Before deleting">
          If you have active Pro access and want to keep a copy, create the exports or Buki archive you need before deletion. Account deletion is permanent after applicable recovery and legal-retention periods, and deleted cloud artwork may not be recoverable.
        </InformationPanel>
        <View
          style={{
            padding: 28,
            borderRadius: 24,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            gap: 12,
          }}
        >
          <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "900" }}>Can’t access the app?</Text>
          <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 26 }}>
            Email us from the address connected to your Buki account. Use the subject “Buki account deletion request.” We may ask for limited information to verify account ownership before deleting data.
          </Text>
          <SupportEmailLink />
        </View>
      </View>
    </PublicSiteShell>
  );
}
