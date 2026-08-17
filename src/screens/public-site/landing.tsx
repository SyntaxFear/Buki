import type { ComponentProps, ComponentType } from "react";
import { Image, Text, View } from "react-native";

import {
  PUBLIC_SITE_MAX_WIDTH,
  PublicSectionHeading,
  PublicSiteLink,
  PublicSiteMeta,
  PublicSiteShell,
  scrollToPublicSection,
  usePublicSitePalette,
} from "@/components/public-site";

type LandingWebViewProps = ComponentProps<typeof View> & {
  dataSet?: Record<string, string>;
};

type LandingWebTextProps = ComponentProps<typeof Text> & {
  dataSet?: Record<string, string>;
};

type LandingWebImageProps = ComponentProps<typeof Image> & {
  fetchPriority?: "high" | "low" | "auto";
  loading?: "eager" | "lazy";
};

const LandingWebView = View as unknown as ComponentType<LandingWebViewProps>;
const LandingWebText = Text as unknown as ComponentType<LandingWebTextProps>;
const LandingWebImage = Image as unknown as ComponentType<LandingWebImageProps>;

const SAMPLE_ART = [
  "/marketing/sample-cat.webp",
  "/marketing/sample-house.webp",
  "/marketing/sample-boat.webp",
] as const;

const APP_SCREENSHOTS = {
  house: "/marketing/screens/sketchpad-house-iphone.webp",
  sailboat: "/marketing/screens/sketchpad-sailboat-iphone.webp",
  cat: "/marketing/screens/sketchpad-cat-iphone.webp",
} as const;

function FloatingBear() {
  return (
    <LandingWebImage
      loading="lazy"
      source={{ uri: "/marketing/buki-bear.webp" }}
      resizeMode="contain"
      style={{
        position: "absolute",
        width: "31%",
        height: "35%",
        right: "2%",
        bottom: "-3%",
        transform: [{ rotate: "1.5deg" }],
      }}
    />
  );
}

function BindingRings({ vertical = false }: { vertical?: boolean }) {
  const palette = usePublicSitePalette();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        zIndex: 2,
        flexDirection: vertical ? "column" : "row",
        justifyContent: "space-around",
        left: vertical ? -8 : 16,
        right: vertical ? undefined : 16,
        top: vertical ? 16 : -7,
        bottom: vertical ? 16 : undefined,
        width: vertical ? 17 : undefined,
        height: vertical ? undefined : 17,
      }}
    >
      {Array.from({ length: vertical ? 6 : 7 }, (_, index) => (
        <View
          key={index}
          style={{
            width: 9,
            height: vertical ? 18 : 16,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: palette.coral,
            backgroundColor: "rgba(255,255,255,0.58)",
          }}
        />
      ))}
    </View>
  );
}

function ArtworkTile({
  uri,
  rotate = "0deg",
}: {
  uri: string;
  rotate?: string;
}) {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        flex: 1,
        padding: 5,
        borderRadius: 10,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: palette.border,
        shadowColor: palette.shadow,
        shadowOpacity: 0.8,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        transform: [{ rotate }],
      }}
    >
      <LandingWebImage
        loading="lazy"
        source={{ uri }}
        resizeMode="cover"
        style={{ width: "100%", aspectRatio: 0.76, borderRadius: 6 }}
      />
    </View>
  );
}

function SketchpadExperience({ compact = false }: { compact?: boolean }) {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        width: "100%",
        maxWidth: compact ? 430 : 540,
        alignSelf: "center",
        aspectRatio: compact ? 0.96 : 1.08,
        position: "relative",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: "87%",
          height: "76%",
          left: "6%",
          top: "8%",
          borderRadius: compact ? 26 : 34,
          backgroundColor: palette.blue,
          padding: compact ? 13 : 17,
          shadowColor: palette.blue,
          shadowOpacity: 0.22,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 18 },
          transform: [{ rotate: "-2deg" }],
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 7,
            height: 12,
            borderRadius: 10,
            backgroundColor: "#315CA8",
          }}
        />
        <View
          style={{
            flex: 1,
            borderRadius: compact ? 19 : 25,
            backgroundColor: "#FFFDF4",
            borderWidth: 1,
            borderColor: "rgba(49,92,168,0.28)",
            padding: compact ? 17 : 23,
            gap: 12,
          }}
        >
          <BindingRings />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 5,
            }}
          >
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  color: palette.teal,
                  fontFamily: "PatrickHand",
                  fontSize: compact ? 23 : 29,
                  lineHeight: compact ? 25 : 31,
                }}
              >
                Garden adventures
              </Text>
              <Text
                style={{ color: palette.muted, fontSize: compact ? 9 : 11 }}
              >
                Mina’s sketchpad · 7 artworks
              </Text>
            </View>
            <View
              style={{
                width: compact ? 29 : 34,
                height: compact ? 29 : 34,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,118,94,0.12)",
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderWidth: 2,
                  borderColor: palette.coral,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>

          <View
            style={{ flex: 1, flexDirection: "row", gap: compact ? 8 : 12 }}
          >
            <ArtworkTile uri={SAMPLE_ART[1]} rotate="-1deg" />
            <ArtworkTile uri={SAMPLE_ART[0]} rotate="1.5deg" />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", gap: 5 }}>
              {[palette.coral, palette.yellow, palette.teal].map((color) => (
                <View
                  key={color}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: color,
                  }}
                />
              ))}
            </View>
            <Text
              style={{
                color: palette.muted,
                fontFamily: "PatrickHand",
                fontSize: 13,
              }}
            >
              3 / 5
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          position: "absolute",
          width: "30%",
          left: 0,
          bottom: "1%",
          padding: compact ? 7 : 9,
          borderRadius: 15,
          backgroundColor: palette.surfaceStrong,
          borderWidth: 1,
          borderColor: palette.border,
          shadowColor: palette.shadow,
          shadowOpacity: 1,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: 8 },
          transform: [{ rotate: "-7deg" }],
        }}
      >
        <LandingWebImage
          loading="lazy"
          source={{ uri: SAMPLE_ART[2] }}
          resizeMode="cover"
          style={{ width: "100%", aspectRatio: 0.75, borderRadius: 9 }}
        />
      </View>
      <FloatingBear />
    </View>
  );
}

function DeviceScreenshot({
  uri,
  label,
  eager = false,
}: {
  uri: string;
  label: string;
  eager?: boolean;
}) {
  return (
    <LandingWebImage
      accessible
      accessibilityLabel={label}
      fetchPriority={eager ? "high" : "auto"}
      loading={eager ? "eager" : "lazy"}
      source={{ uri }}
      resizeMode="contain"
      style={{ width: "100%", aspectRatio: 720 / 1470 }}
    />
  );
}

function HeroDeviceStack() {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        width: "100%",
        maxWidth: 610,
        alignSelf: "center",
        aspectRatio: 1.04,
        position: "relative",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: "76%",
          aspectRatio: 1,
          borderRadius: 999,
          left: "12%",
          top: "10%",
          backgroundColor: "rgba(255,214,90,0.18)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: "42%",
          aspectRatio: 1,
          borderRadius: 999,
          right: "1%",
          bottom: "8%",
          backgroundColor: "rgba(22,125,130,0.10)",
        }}
      />
      <View
        style={{
          position: "absolute",
          zIndex: 1,
          width: "34%",
          left: "2%",
          top: "19%",
          opacity: 0.94,
          transform: [{ rotate: "-7deg" }],
        }}
      >
        <DeviceScreenshot
          eager
          uri={APP_SCREENSHOTS.sailboat}
          label="Buki sketchpad showing a child’s sailboat drawing"
        />
      </View>
      <View
        style={{
          position: "absolute",
          zIndex: 3,
          width: "43%",
          left: "28.5%",
          top: 0,
        }}
      >
        <DeviceScreenshot
          eager
          uri={APP_SCREENSHOTS.house}
          label="Buki sketchpad showing a child’s house drawing"
        />
      </View>
      <View
        style={{
          position: "absolute",
          zIndex: 2,
          width: "34%",
          right: "2%",
          top: "21%",
          opacity: 0.94,
          transform: [{ rotate: "7deg" }],
        }}
      >
        <DeviceScreenshot
          eager
          uri={APP_SCREENSHOTS.cat}
          label="Buki sketchpad showing a child’s cat drawing"
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          zIndex: 4,
          width: 44,
          height: 8,
          borderRadius: 8,
          left: "9%",
          bottom: "8%",
          backgroundColor: palette.coral,
          transform: [{ rotate: "-7deg" }],
        }}
      />
    </View>
  );
}

function ScreenshotSpotlight() {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        paddingHorizontal: 28,
        paddingVertical: 38,
        borderRadius: 40,
        backgroundColor: "rgba(22,125,130,0.08)",
        overflow: "hidden",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 46,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: 150,
          left: -90,
          bottom: -110,
          backgroundColor: "rgba(255,255,255,0.52)",
        }}
      />
      <View
        style={{
          flexGrow: 0.8,
          flexShrink: 1,
          flexBasis: 280,
          minWidth: 0,
          maxWidth: 330,
          alignSelf: "center",
          transform: [{ rotate: "-2deg" }],
        }}
      >
        <DeviceScreenshot
          uri={APP_SCREENSHOTS.house}
          label="A real Buki app screen with a house drawing saved on page one"
        />
      </View>
      <View
        style={{
          flexGrow: 1.2,
          flexShrink: 1,
          flexBasis: 390,
          minWidth: 0,
          maxWidth: 590,
          gap: 18,
        }}
      >
        <Text
          style={{
            color: palette.teal,
            fontSize: 12,
            fontWeight: "900",
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          A real Buki sketchpad
        </Text>
        <LandingWebText
          accessibilityRole="header"
          aria-level={3}
          dataSet={{ landing: "spotlight-title" }}
          style={{
            color: palette.ink,
            fontSize: 38,
            lineHeight: 42,
            fontWeight: "900",
            letterSpacing: -1.7,
          }}
        >
          The artwork stays the hero.
        </LandingWebText>
        <Text
          style={{
            color: palette.muted,
            fontSize: 17,
            lineHeight: 27,
            maxWidth: 560,
          }}
        >
          Buki keeps the interface quiet, the page familiar, and the drawing
          large enough to enjoy together. Every screen shown here comes from
          the working app.
        </Text>
        <View role="list" style={{ gap: 12, paddingTop: 6 }}>
          {[
            "A page-by-page book instead of an endless camera roll",
            "Fast page jumping without losing your place",
            "A camera button that is always ready for the next drawing",
          ].map((item) => (
            <View
              key={item}
              role="listitem"
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  marginTop: 3,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: palette.teal,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>
                  ✓
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  color: palette.ink,
                  fontSize: 15,
                  lineHeight: 23,
                  fontWeight: "700",
                }}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function ScreenshotDetail({
  uri,
  label,
  eyebrow,
  title,
  body,
  tint,
  rotate,
}: {
  uri: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  tint: string;
  rotate: string;
}) {
  const palette = usePublicSitePalette();
  return (
    <LandingWebView
      dataSet={{ landing: "screenshot-detail" }}
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 430,
        minWidth: 0,
        minHeight: 440,
        padding: 28,
        borderRadius: 34,
        backgroundColor: tint,
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 24,
      }}
    >
      <LandingWebView
        dataSet={{ landing: "screenshot-detail-copy" }}
        style={{ flex: 1, minWidth: 0, gap: 12, zIndex: 2 }}
      >
        <Text
          style={{
            color: palette.coralText,
            fontSize: 12,
            fontWeight: "900",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Text>
        <Text
          accessibilityRole="header"
          aria-level={3}
          style={{
            color: palette.ink,
            fontSize: 28,
            lineHeight: 32,
            fontWeight: "900",
            letterSpacing: -0.9,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 23 }}>
          {body}
        </Text>
      </LandingWebView>
      <LandingWebView
        dataSet={{ landing: "screenshot-detail-device" }}
        style={{
          width: "39%",
          maxWidth: 190,
          minWidth: 118,
          alignSelf: "flex-end",
          marginBottom: -86,
          transform: [{ rotate }],
        }}
      >
        <DeviceScreenshot uri={uri} label={label} />
      </LandingWebView>
    </LandingWebView>
  );
}

function StoryRow({
  number,
  title,
  body,
  accent,
}: {
  number: string;
  title: string;
  body: string;
  accent: string;
}) {
  const palette = usePublicSitePalette();
  return (
    <View
      role="listitem"
      style={{
        paddingVertical: 22,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        flexDirection: "row",
        gap: 18,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: accent,
        }}
      >
        <Text
          style={{ color: "#FFFFFF", fontFamily: "PatrickHand", fontSize: 19 }}
        >
          {number}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text
          accessibilityRole="header"
          aria-level={3}
          style={{ color: palette.ink, fontSize: 19, fontWeight: "900" }}
        >
          {title}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 23 }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

function PricingPanel({
  title,
  price,
  body,
  detail,
  pro = false,
}: {
  title: string;
  price: string;
  body: string;
  detail: string;
  pro?: boolean;
}) {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: pro ? 500 : 330,
        minWidth: 0,
        minHeight: 310,
        padding: 28,
        borderRadius: 28,
        backgroundColor: pro ? palette.teal : palette.surfaceStrong,
        borderWidth: 1,
        borderColor: pro ? palette.teal : palette.border,
        shadowColor: pro ? palette.tealStrong : palette.shadow,
        shadowOpacity: pro ? 0.17 : 0.75,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
        gap: 17,
      }}
    >
      <Text
        accessibilityRole="header"
        aria-level={3}
        style={{
          color: pro ? "#FFFFFF" : palette.teal,
          fontSize: 28,
          lineHeight: 32,
          fontWeight: "900",
          letterSpacing: -0.7,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: pro ? "#FFFFFF" : palette.muted,
          fontSize: 16,
          lineHeight: 25,
        }}
      >
        {body}
      </Text>
      <View style={{ marginTop: "auto", gap: 8 }}>
        <Text
          style={{
            color: pro ? "#FFFFFF" : palette.ink,
            fontSize: 38,
            lineHeight: 43,
            fontWeight: "900",
            letterSpacing: -1.4,
          }}
        >
          {price}
        </Text>
        <Text
          style={{
            color: pro ? "#FFFFFF" : palette.muted,
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

export function PublicLandingScreen() {
  const palette = usePublicSitePalette();
  const compact = true;

  return (
    <PublicSiteShell>
      <PublicSiteMeta
        title="Buki — A Private Home for Children’s Art"
        description="Turn children’s drawings into beautiful private sketchpads, keep the stories around them, and revisit every little masterpiece together."
        path="/"
        preloadImage={APP_SCREENSHOTS.house}
        pageType="SoftwareApplication"
        keywords={[
          "children's artwork organizer",
          "kids art archive",
          "digital sketchpad",
          "family art memories",
          "private artwork backup",
        ]}
      />

      <LandingWebView
        dataSet={{ landing: "hero" }}
        style={{
          minHeight: compact ? 680 : 650,
          paddingTop: compact ? 42 : 68,
          paddingBottom: compact ? 66 : 92,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: compact ? 38 : 58,
        }}
      >
        <View
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 440,
            minWidth: 0,
            maxWidth: 560,
            gap: 23,
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              paddingBottom: 2,
            }}
          >
            <Text
              style={{
                color: palette.coralText,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 1.25,
              }}
            >
              A PRIVATE ART LIBRARY FOR FAMILIES
            </Text>
          </View>
          <LandingWebText
            accessibilityRole="header"
            aria-level={1}
            dataSet={{ landing: "hero-title" }}
            style={{
              color: palette.ink,
              fontSize: compact ? 58 : 74,
              lineHeight: compact ? 59 : 73,
              fontWeight: "900",
              letterSpacing: -2.5,
              maxWidth: 600,
            }}
          >
            Childhood art deserves more than a camera roll.
          </LandingWebText>
          <Text
            style={{
              color: palette.muted,
              fontSize: compact ? 17 : 19,
              lineHeight: compact ? 27 : 30,
              maxWidth: 540,
            }}
          >
            Buki turns loose drawings into private, page-by-page sketchpads your
            family can browse together now and come back to years from now.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <PublicSiteLink
              href="/#experience"
              label="See Buki in action"
              onPress={() => scrollToPublicSection("experience")}
            />
            <PublicSiteLink
              href="/privacy"
              label="Our privacy promise"
              variant="secondary"
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 15,
              paddingTop: 4,
            }}
          >
            {["Saved locally first", "No child accounts", "No public gallery"].map(
              (label, index) => (
                <View
                  key={label}
                  style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: [
                        palette.teal,
                        palette.coral,
                        palette.yellow,
                      ][index],
                    }}
                  />
                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {label}
                  </Text>
                </View>
              ),
            )}
          </View>
        </View>
        <View
          style={{
            flexGrow: 1.08,
            flexShrink: 1,
            flexBasis: 480,
            minWidth: 0,
          }}
        >
          <HeroDeviceStack />
        </View>
      </LandingWebView>

      <View
        nativeID="experience"
        style={{
          paddingVertical: compact ? 68 : 104,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          gap: compact ? 42 : 60,
        }}
      >
        <PublicSectionHeading
          eyebrow="Inside the real app"
          title="A digital sketchpad that still feels made by hand."
          description="Authentic Buki app screens, presented inside a clean iPhone frame. The warm paper, page tabs, drawings, and navigation are all from the working product."
        />
        <ScreenshotSpotlight />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
          <ScreenshotDetail
            uri={APP_SCREENSHOTS.sailboat}
            label="Buki sketchpad with a sailboat drawing selected on page thirteen"
            eyebrow="Turn the page"
            title="Browse memories like a book."
            body="Move between filled pages, jump to a page number, and keep the current drawing in context instead of burying it in a photo grid."
            tint="rgba(111,169,232,0.12)"
            rotate="-3deg"
          />
          <ScreenshotDetail
            uri={APP_SCREENSHOTS.cat}
            label="Buki sketchpad with a cat drawing selected on page fourteen"
            eyebrow="Keep adding"
            title="The sketchpad grows with them."
            body="One familiar camera action is always ready for the next drawing, while every saved page stays easy to revisit."
            tint="rgba(255,118,94,0.09)"
            rotate="3deg"
          />
        </View>
      </View>

      <View
        style={{
          marginHorizontal: compact ? -4 : 0,
          paddingHorizontal: compact ? 20 : 54,
          paddingVertical: compact ? 56 : 76,
          borderRadius: compact ? 28 : 40,
          backgroundColor: palette.backgroundDeep,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: compact ? 40 : 70,
        }}
      >
        <View
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 430,
            minWidth: 0,
          }}
        >
          <SketchpadExperience compact />
        </View>
        <View
          style={{
            flexGrow: 0.9,
            flexShrink: 1,
            flexBasis: 420,
            minWidth: 0,
          }}
        >
          <PublicSectionHeading
            eyebrow="The sketchpad experience"
            title="It should feel like opening their favorite book."
            description="Buki gives every collection a cover, paper color, binding, layout, border, and small decorative details—without letting the interface compete with the art."
          />
          <View role="list" style={{ marginTop: 24 }}>
            <StoryRow
              number="1"
              title="Choose a personality"
              body="Build each sketchpad from the same color and paper system used throughout the app."
              accent={palette.blueStrong}
            />
            <StoryRow
              number="2"
              title="Browse with your hands"
              body="Turn pages, jump between folios, and open artwork without losing your place."
              accent={palette.coralText}
            />
            <StoryRow
              number="3"
              title="Keep the story attached"
              body="Save a title, date, note, tag, and favorite alongside the picture itself."
              accent={palette.teal}
            />
          </View>
        </View>
      </View>

      <View style={{ paddingVertical: compact ? 76 : 112, gap: 42 }}>
        <PublicSectionHeading
          eyebrow="Built around childhood"
          title="Playful for children. Responsible for adults."
          description="The interface can feel joyful without turning a child’s work into content. Adults remain in control of accounts, purchases, backup, export, and deletion."
        />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          <View
            style={{
              flexGrow: 1.25,
              flexShrink: 1,
              flexBasis: 420,
              minWidth: 0,
              minHeight: 290,
              padding: compact ? 24 : 34,
              borderRadius: 30,
              backgroundColor: palette.teal,
              overflow: "hidden",
              justifyContent: "space-between",
              gap: 34,
            }}
          >
            <View
              style={{
                position: "absolute",
                width: 190,
                height: 190,
                borderRadius: 95,
                right: -65,
                top: -70,
                backgroundColor: "rgba(255,255,255,0.08)",
              }}
            />
            <Text
              accessibilityRole="header"
              aria-level={3}
              style={{
                color: "#FFFFFF",
                fontSize: compact ? 34 : 42,
                lineHeight: compact ? 38 : 45,
                fontWeight: "900",
                letterSpacing: -1.1,
                maxWidth: 560,
              }}
            >
              Children are profiles, never separate accounts.
            </Text>
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                lineHeight: 25,
                maxWidth: 620,
              }}
            >
              A parent or guardian owns the library and decides what is
              captured, synchronized, exported, restored, or removed.
            </Text>
          </View>
          <View
            style={{
              flexGrow: 0.75,
              flexShrink: 1,
              flexBasis: 320,
              minWidth: 0,
              gap: 18,
            }}
          >
            {[
              [
                "Private by default",
                "No public gallery, follower count, comments, or advertising profile.",
                palette.coral,
              ],
              [
                "Local-first",
                "Artwork saves on the device first, so creating can continue offline.",
                palette.yellow,
              ],
            ].map(([title, body, accent]) => (
              <View
                key={title}
                style={{
                  flex: 1,
                  minHeight: 135,
                  padding: 24,
                  borderRadius: 26,
                  backgroundColor: palette.surfaceStrong,
                  borderWidth: 1,
                  borderColor: palette.border,
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 5,
                    borderRadius: 4,
                    backgroundColor: accent,
                  }}
                />
                <Text
                  accessibilityRole="header"
                  aria-level={3}
                  style={{
                    color: palette.ink,
                    fontSize: 19,
                    fontWeight: "900",
                  }}
                >
                  {title}
                </Text>
                <Text
                  style={{ color: palette.muted, fontSize: 14, lineHeight: 21 }}
                >
                  {body}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: compact ? 20 : 42,
          paddingVertical: compact ? 54 : 70,
          borderRadius: 34,
          backgroundColor: "rgba(111,169,232,0.10)",
          borderWidth: 1,
          borderColor: "rgba(74,121,216,0.12)",
          gap: 34,
        }}
      >
        <PublicSectionHeading
          eyebrow="Free and Pro"
          title="Start with the art you already have."
          description="Free includes the complete core experience for one child and one sketchpad. Pro grows with larger family archives and adds premium preservation tools."
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
          <PricingPanel
            title="Buki Free"
            body="One child profile, one sketchpad, up to 20 artworks, and the core capture and viewing experience."
            price="$0"
            detail="No purchase required"
          />
          <PricingPanel
            pro
            title="Buki Pro"
            body="Unlimited local profiles, sketchpads, and artworks, plus premium organization, protected exports, and up to 2 GB of private cloud backup."
            price="$19.99 / year"
            detail="$2.99 monthly or $39.99 lifetime. Apple shows the final localized price. Eligible yearly users may receive a 7-day trial."
          />
        </View>
      </View>

      <View
        style={{
          paddingTop: compact ? 80 : 116,
          maxWidth: PUBLIC_SITE_MAX_WIDTH,
          gap: 34,
        }}
      >
        <PublicSectionHeading
          eyebrow="Plain-language policies"
          title="Family trust deserves more than fine print."
          description="Buki does not sell personal information or use children’s artwork for advertising. The details are written for adults who need clear answers."
        />
        <View role="list">
          {[
            [
              "Privacy policy",
              "See what Buki stores, why it is needed, and which choices stay with the adult account owner.",
              "/privacy",
            ],
            [
              "Terms of use",
              "Review Free and Pro access, purchases, cloud retention, exports, and account responsibilities.",
              "/terms",
            ],
            [
              "Support",
              "Get help with access, purchases, restoration, backup, privacy, or account deletion.",
              "/support",
            ],
          ].map(([title, description, href], index) => (
            <LandingWebView
              key={href}
              role="listitem"
              dataSet={{ landing: "policy-row" }}
              style={{
                paddingVertical: 24,
                borderTopWidth: 1,
                borderTopColor: palette.border,
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
              }}
            >
              <LandingWebView
                dataSet={{ landing: "policy-copy" }}
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 520,
                  minWidth: 260,
                  maxWidth: 720,
                  flexDirection: "row",
                  gap: 16,
                }}
              >
                <Text
                  style={{
                    color: [
                      palette.coralText,
                      palette.blueStrong,
                      palette.teal,
                    ][index],
                    fontFamily: "PatrickHand",
                    fontSize: 22,
                  }}
                >
                  0{index + 1}
                </Text>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text
                    accessibilityRole="header"
                    aria-level={3}
                    style={{
                      color: palette.ink,
                      fontSize: 20,
                      fontWeight: "900",
                    }}
                  >
                    {title}
                  </Text>
                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 15,
                      lineHeight: 23,
                    }}
                  >
                    {description}
                  </Text>
                </View>
              </LandingWebView>
              <PublicSiteLink
                href={href as "/privacy" | "/terms" | "/support"}
                label={`Read ${title.toLowerCase()}`}
                variant="text"
              />
            </LandingWebView>
          ))}
        </View>
      </View>
    </PublicSiteShell>
  );
}
