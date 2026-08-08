import { Image, Text, View } from "react-native";

import {
  PUBLIC_SITE_MAX_WIDTH,
  PublicSectionHeading,
  PublicSiteLink,
  PublicSiteMeta,
  PublicSiteShell,
  usePublicSitePalette,
} from "@/components/public-site";

const SAMPLE_ART = [
  { uri: "/marketing/sample-cat.webp" },
  { uri: "/marketing/sample-house.webp" },
  { uri: "/marketing/sample-boat.webp" },
];

function HeroArtwork() {
  const palette = usePublicSitePalette();
  const widths = ["44.6%", "50%", "44.6%"] as const;
  const left = ["1%", "25%", "52%"] as const;
  const top = ["19%", "4%", "24%"] as const;
  return (
    <View
      style={{
        width: "100%",
        maxWidth: 460,
        aspectRatio: 460 / 430,
        alignSelf: "center",
        position: "relative",
      }}
    >
      {SAMPLE_ART.map((source, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            width: widths[index],
            left: left[index],
            top: top[index],
            borderRadius: 22,
            padding: 10,
            backgroundColor: palette.surfaceStrong,
            borderWidth: 1,
            borderColor: palette.border,
            shadowColor: palette.shadow,
            shadowOpacity: 1,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 14 },
            transform: [{ rotate: index === 0 ? "-7deg" : index === 2 ? "8deg" : "1deg" }],
          }}
        >
          <Image source={source} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 14 }} resizeMode="cover" />
        </View>
      ))}
      <Image
        source={{ uri: "/marketing/buki-bear.webp" }}
        style={{
          position: "absolute",
          width: "41.3%",
          height: "44.2%",
          right: "27.8%",
          bottom: -4,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

function FeatureBlock({
  title,
  description,
  accent,
  wide = false,
}: {
  title: string;
  description: string;
  accent: string;
  wide?: boolean;
}) {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: wide ? "100%" : 330,
        flexShrink: 1,
        minWidth: 0,
        minHeight: wide ? 190 : 220,
        padding: 28,
        borderRadius: 24,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
        justifyContent: "space-between",
        gap: 28,
      }}
    >
      <View style={{ width: 42, height: 6, borderRadius: 99, backgroundColor: accent }} />
      <View style={{ gap: 10, maxWidth: wide ? 700 : 440 }}>
        <Text style={{ color: palette.ink, fontSize: 23, fontWeight: "900", letterSpacing: -0.5 }}>{title}</Text>
        <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 25 }}>{description}</Text>
      </View>
    </View>
  );
}

function PricingCard({
  name,
  summary,
  price,
  detail,
  pro = false,
}: {
  name: string;
  summary: string;
  price: string;
  detail: string;
  pro?: boolean;
}) {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 360,
        flexShrink: 1,
        minWidth: 280,
        minHeight: 330,
        padding: 30,
        borderRadius: 26,
        backgroundColor: pro ? palette.teal : palette.surfaceStrong,
        borderWidth: 1,
        borderColor: pro ? palette.teal : palette.border,
        gap: 18,
      }}
    >
      <Text style={{ color: pro ? "#FFFFFF" : palette.teal, fontSize: 18, fontWeight: "900" }}>{name}</Text>
      <Text style={{ color: pro ? "rgba(255,255,255,0.84)" : palette.muted, fontSize: 16, lineHeight: 25 }}>
        {summary}
      </Text>
      <View style={{ marginTop: "auto", gap: 9 }}>
        <Text style={{ color: pro ? "#FFFFFF" : palette.ink, fontSize: 42, lineHeight: 48, fontWeight: "900", letterSpacing: -1.6 }}>
          {price}
        </Text>
        <Text style={{ color: pro ? "rgba(255,255,255,0.8)" : palette.muted, fontSize: 14, lineHeight: 21 }}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

export function PublicLandingScreen() {
  const palette = usePublicSitePalette();
  return (
    <PublicSiteShell>
      <PublicSiteMeta
        title="Buki - A private home for children’s art"
        description="Capture, organize, and privately preserve children’s artwork in parent-controlled sketchpads."
        path="/"
        preloadImage="/marketing/sample-house.webp"
      />
      <View
        style={{
          minHeight: 610,
          paddingTop: 72,
          paddingBottom: 86,
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 54,
        }}
      >
        <View
          style={{
            maxWidth: "100%",
            minWidth: 320,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 450,
            gap: 24,
          }}
        >
          <Text style={{ color: palette.coral, fontSize: 14, fontWeight: "900", letterSpacing: 0.8 }}>Made for parents</Text>
          <Text
            accessibilityRole="header"
            style={{
              maxWidth: 610,
              color: palette.ink,
              fontSize: 50,
              lineHeight: 55,
              fontWeight: "900",
              letterSpacing: -2,
            }}
          >
            Keep every little masterpiece.
          </Text>
          <Text style={{ maxWidth: 570, color: palette.muted, fontSize: 18, lineHeight: 29 }}>
            Buki helps families capture, organize, and privately preserve children’s artwork without turning childhood into a public feed.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <PublicSiteLink href="/privacy" label="Read our privacy promise" />
            <PublicSiteLink href="/support" label="Get support" variant="secondary" />
          </View>
        </View>
        <View
          style={{
            maxWidth: "100%",
            minWidth: 320,
            flexGrow: 0.85,
            flexShrink: 1,
            flexBasis: 390,
          }}
        >
          <HeroArtwork />
        </View>
      </View>

      <View style={{ paddingVertical: 78, gap: 34 }}>
        <PublicSectionHeading
          title="A calmer way to remember their creative years."
          description="Photograph artwork, group it into sketchpads, add context, and keep the originals safely organized for the future."
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
          <FeatureBlock
            wide
            title="Artwork, not camera roll clutter"
            description="Save a clean image, title, date, and memory while the story is still fresh."
            accent={palette.coral}
          />
          <FeatureBlock
            title="Sketchpads that grow with them"
            description="Keep each child’s work in private collections with layouts made for browsing together."
            accent={palette.blue}
          />
          <FeatureBlock
            title="Parent-controlled by design"
            description="Children do not create accounts. Parents decide what is stored, exported, restored, or deleted."
            accent={palette.teal}
          />
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 32,
          paddingVertical: 72,
          borderRadius: 32,
          backgroundColor: palette.backgroundDeep,
          gap: 34,
        }}
      >
        <PublicSectionHeading
          title="Start free. Upgrade when the family archive grows."
          description="Monthly, yearly, and lifetime purchases unlock the same Pro experience. Apple displays the final localized price."
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
          <PricingCard
            name="Free"
            summary="One child profile, one sketchpad, up to 20 artworks, and all core capture tools."
            price="$0"
            detail="No purchase required"
          />
          <PricingCard
            pro
            name="Buki Pro"
            summary="Unlimited local profiles, sketchpads, and artworks, plus premium organization, exports, and up to 2 GB of cloud backup."
            price="$19.99 / year"
            detail="$2.99 monthly or $39.99 lifetime. Eligible yearly users receive a 7-day trial."
          />
        </View>
        <Text style={{ maxWidth: 760, color: palette.muted, fontSize: 14, lineHeight: 22 }}>
          Existing artwork and applied styling are preserved if a subscription ends. Cloud uploads and Pro-only tools pause until access resumes.
        </Text>
      </View>

      <View style={{ paddingTop: 90, gap: 34, maxWidth: PUBLIC_SITE_MAX_WIDTH }}>
        <PublicSectionHeading
          title="Clear policies, written for real families."
          description="Buki does not sell personal information or use children’s artwork for advertising. Read the details or contact us with any question."
        />
        <View style={{ gap: 16 }}>
          {[
            ["Privacy policy", "What Buki stores, why it is needed, and the choices available to parents.", "/privacy"],
            ["Terms of use", "Account responsibilities, subscriptions, cloud retention, and acceptable use.", "/terms"],
            ["Support", "Get help with purchases, restoration, account access, privacy, or data deletion.", "/support"],
          ].map(([title, description, href]) => (
            <View
              key={href}
              style={{
                paddingVertical: 22,
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
              }}
            >
              <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 600, minWidth: 250, gap: 7, maxWidth: 700 }}>
                <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "900" }}>{title}</Text>
                <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 23 }}>{description}</Text>
              </View>
              <PublicSiteLink href={href as "/privacy" | "/terms" | "/support"} label={`Read ${title.toLowerCase()}`} variant="text" />
            </View>
          ))}
        </View>
      </View>
    </PublicSiteShell>
  );
}
