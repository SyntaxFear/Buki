import Head from "expo-router/head";
import { Link, type Href } from "expo-router";
import type {
  ComponentProps,
  ComponentType,
  PropsWithChildren,
  ReactNode,
} from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { BukiWordmark } from "@/components/buki-wordmark";
import { SUPPORT_EMAIL } from "@/marketing/content";
import { colors } from "@/theme";

type WebPressableProps = ComponentProps<typeof Pressable> & {
  dataSet?: Record<string, string>;
  onKeyDown?: (event: {
    nativeEvent: { key: string };
    preventDefault: () => void;
  }) => void;
};

type WebViewProps = ComponentProps<typeof View> & {
  dataSet?: Record<string, string>;
  tabIndex?: number;
};

type WebTextProps = ComponentProps<typeof Text> & {
  dataSet?: Record<string, string>;
};

const WebPressable = Pressable as unknown as ComponentType<WebPressableProps>;
const WebView = View as unknown as ComponentType<WebViewProps>;
const WebText = Text as unknown as ComponentType<WebTextProps>;

export interface PublicSitePalette {
  background: string;
  backgroundDeep: string;
  surface: string;
  surfaceStrong: string;
  ink: string;
  muted: string;
  border: string;
  teal: string;
  tealStrong: string;
  coral: string;
  coralText: string;
  yellow: string;
  blue: string;
  blueStrong: string;
  green: string;
  shadow: string;
}

const PUBLIC_PALETTE: PublicSitePalette = {
  background: colors.background,
  backgroundDeep: colors.backgroundDeep,
  surface: colors.surface,
  surfaceStrong: "#FFFFFF",
  ink: colors.ink,
  muted: colors.mutedText,
  border: colors.border,
  teal: colors.titleTeal,
  tealStrong: "#0E6266",
  coral: colors.titleCoral,
  coralText: "#B84636",
  yellow: colors.titleYellow,
  blue: colors.bookBorder,
  blueStrong: "#3B68C2",
  green: colors.bloomGreen,
  shadow: "rgba(73, 62, 43, 0.12)",
};

export const PUBLIC_SITE_MAX_WIDTH = 1180;
const PUBLIC_SITE_ORIGIN = "https://buki.expo.app";
const PUBLIC_SITE_SOCIAL_IMAGE = `${PUBLIC_SITE_ORIGIN}/marketing/buki-og-v2.png`;

export function usePublicSitePalette(): PublicSitePalette {
  return PUBLIC_PALETTE;
}

export function PublicSiteMeta({
  title,
  description,
  path,
  preloadImage,
  keywords = [],
  pageType = "WebPage",
}: {
  title: string;
  description: string;
  path: string;
  preloadImage?: string;
  keywords?: readonly string[];
  pageType?: "WebPage" | "ContactPage" | "SoftwareApplication";
}) {
  const url = `${PUBLIC_SITE_ORIGIN}${path}`;
  const webPageSchema = {
    "@type": pageType === "SoftwareApplication" ? "WebPage" : pageType,
    "@id": `${url}#page`,
    url,
    name: title,
    description,
    inLanguage: "en",
    isPartOf: {
      "@id": `${PUBLIC_SITE_ORIGIN}/#website`,
    },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: PUBLIC_SITE_SOCIAL_IMAGE,
      width: 1200,
      height: 630,
    },
  };
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${PUBLIC_SITE_ORIGIN}/#website`,
        url: `${PUBLIC_SITE_ORIGIN}/`,
        name: "Buki",
        description:
          "A private family art archive for preserving children’s drawings in beautiful digital sketchpads.",
        inLanguage: "en",
      },
      webPageSchema,
      ...(pageType === "SoftwareApplication"
        ? [
            {
              "@type": "SoftwareApplication",
              "@id": `${PUBLIC_SITE_ORIGIN}/#app`,
              name: "Buki",
              url: `${PUBLIC_SITE_ORIGIN}/`,
              image: PUBLIC_SITE_SOCIAL_IMAGE,
              description,
              applicationCategory: "LifestyleApplication",
              operatingSystem: "iOS",
              offers: [
                {
                  "@type": "Offer",
                  name: "Buki Free",
                  price: "0",
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "Buki Pro Yearly",
                  price: "19.99",
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "Buki Pro Monthly",
                  price: "2.99",
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "Buki Pro Lifetime",
                  price: "39.99",
                  priceCurrency: "USD",
                },
              ],
            },
          ]
        : []),
    ],
  };
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords.length > 0 ? (
        <meta name="keywords" content={keywords.join(", ")} />
      ) : null}
      <meta name="application-name" content="Buki" />
      <meta name="apple-mobile-web-app-title" content="Buki" />
      <meta name="format-detection" content="telephone=no" />
      <meta name="color-scheme" content="light" />
      <meta
        name="robots"
        content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      />
      <meta name="theme-color" content={colors.background} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Buki" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={PUBLIC_SITE_SOCIAL_IMAGE} />
      <meta property="og:image:secure_url" content={PUBLIC_SITE_SOCIAL_IMAGE} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content="Buki app icon and colorful wordmark beside two orange iPhone frames showing family sketchpads"
      />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={PUBLIC_SITE_SOCIAL_IMAGE} />
      <meta
        name="twitter:image:alt"
        content="Buki app icon and colorful wordmark beside two orange iPhone frames showing family sketchpads"
      />
      <link rel="canonical" href={url} />
      <link rel="alternate" hrefLang="en" href={url} />
      <link rel="alternate" hrefLang="x-default" href={url} />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/site.webmanifest" />
      <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
      <link rel="describedby" type="text/markdown" href="/llms.txt" />
      {preloadImage ? (
        <link
          rel="preload"
          as="image"
          href={preloadImage}
          fetchPriority="high"
        />
      ) : null}
      <script type="application/ld+json">
        {JSON.stringify(structuredData).replace(/</g, "\\u003c")}
      </script>
      <style>{`
        html {
          background: ${colors.background};
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }

        [data-public-chrome="nav"] {
          -webkit-backdrop-filter: blur(24px) saturate(150%);
          backdrop-filter: blur(24px) saturate(150%);
        }

        [data-public-link] {
          outline: none;
          transition: transform 180ms cubic-bezier(.2,.8,.2,1), background-color 180ms ease, box-shadow 180ms ease;
        }

        [data-public-heading] {
          text-wrap: balance;
        }

        [data-public-skip] {
          left: 14px !important;
          position: fixed !important;
          top: 12px !important;
          transform: translateY(-160%);
          z-index: 50;
        }

        [data-public-skip]:focus-visible {
          transform: translateY(0);
        }

        [data-public-link="button"]:hover {
          transform: translateY(-2px);
        }

        [data-public-link="button"]:active {
          opacity: 0.9;
          transform: scale(0.98);
        }

        [data-public-link="nav"]:hover {
          background: rgba(22, 125, 130, 0.08) !important;
        }

        [data-public-link="nav"]:active {
          background: rgba(22, 125, 130, 0.12) !important;
          transform: scale(0.98);
        }

        [data-public-link="text"]:hover {
          opacity: 0.72;
        }

        [data-public-link]:focus-visible {
          box-shadow: 0 0 0 3px ${colors.background}, 0 0 0 6px rgba(22, 125, 130, 0.72) !important;
        }

        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          [data-public-link] { transition: none; }
          [data-public-link="button"]:hover { transform: none; }
        }

        @media (prefers-reduced-transparency: reduce) {
          [data-public-chrome="nav"] {
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
            background: rgba(255, 253, 247, 0.98) !important;
          }
        }

        @media (prefers-contrast: more) {
          [data-public-chrome="nav"] {
            background: #fffdf7 !important;
            border-color: rgba(40, 67, 90, 0.42) !important;
          }
        }

        @media (max-width: 480px) {
          [data-public-chrome="nav"] {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          [data-public-header-nav] {
            column-gap: 2px !important;
            justify-content: space-between !important;
            width: 100% !important;
          }

          [data-public-link="nav"] {
            padding-left: 6px !important;
            padding-right: 6px !important;
          }

          [data-public-nav-label] {
            font-size: 13px !important;
          }

          [data-public-heading="section"] {
            font-size: 36px !important;
            letter-spacing: -1.1px !important;
            line-height: 40px !important;
          }

          [data-public-heading="page"] {
            font-size: 44px !important;
            letter-spacing: -1.4px !important;
            line-height: 48px !important;
          }

          [data-landing="hero"] {
            min-height: 0 !important;
            padding-bottom: 52px !important;
            padding-top: 34px !important;
            row-gap: 24px !important;
          }

          [data-landing="hero-title"] {
            font-size: 46px !important;
            letter-spacing: -1.8px !important;
            line-height: 48px !important;
          }

          [data-landing="spotlight-title"] {
            font-size: 36px !important;
            letter-spacing: -1.1px !important;
            line-height: 40px !important;
          }

          [data-landing="screenshot-detail"] {
            align-items: stretch !important;
            flex-direction: column !important;
            min-height: 0 !important;
          }

          [data-landing="screenshot-detail-copy"] {
            width: 100% !important;
          }

          [data-landing="screenshot-detail-device"] {
            align-self: center !important;
            margin-bottom: -72px !important;
            max-width: 180px !important;
            min-width: 0 !important;
            width: 66% !important;
          }

          [data-landing="policy-row"] {
            align-items: flex-start !important;
            flex-direction: column !important;
          }

          [data-landing="policy-copy"] {
            flex-basis: auto !important;
            max-width: 100% !important;
            min-width: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
    </Head>
  );
}

export function scrollToPublicSection(id: string) {
  if (typeof window === "undefined") return;

  const section = document.getElementById(id);
  if (!section) return;

  const hash = `#${id}`;
  if (window.location.hash !== hash) {
    window.history.pushState(null, "", hash);
  }

  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  section.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });

  if (id === "main-content") {
    section.focus({ preventScroll: true });
  }
}

function SiteNavLink({
  href,
  children,
  onPress,
}: PropsWithChildren<{ href: Href; onPress?: () => void }>) {
  const palette = usePublicSitePalette();
  return (
    <Link href={href} onPress={onPress} asChild>
      <WebPressable
        accessibilityRole="link"
        dataSet={{ publicLink: "nav" }}
        onKeyDown={(event) => {
          if (!onPress) return;
          if (event.nativeEvent.key !== "Enter" && event.nativeEvent.key !== " ") {
            return;
          }
          event.preventDefault();
          onPress();
        }}
        style={{
          minHeight: 44,
          justifyContent: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: "transparent",
        }}
      >
        <WebText
          dataSet={{ publicNavLabel: "true" }}
          style={{ color: palette.ink, fontSize: 14, fontWeight: "700" }}
        >
          {children}
        </WebText>
      </WebPressable>
    </Link>
  );
}

export function PublicSiteLink({
  href,
  label,
  variant = "primary",
  onPress,
}: {
  href: Href;
  label: string;
  variant?: "primary" | "secondary" | "text";
  onPress?: () => void;
}) {
  const palette = usePublicSitePalette();
  const backgroundColor =
    variant === "primary"
      ? palette.teal
      : variant === "secondary"
        ? palette.surfaceStrong
        : "transparent";
  const textColor =
    variant === "primary"
      ? "#FFFFFF"
      : variant === "secondary"
        ? palette.ink
        : palette.teal;

  return (
    <Link href={href} onPress={onPress} asChild>
      <WebPressable
        accessibilityRole="link"
        dataSet={{ publicLink: variant === "text" ? "text" : "button" }}
        onKeyDown={(event) => {
          if (!onPress) return;
          if (event.nativeEvent.key !== "Enter" && event.nativeEvent.key !== " ") {
            return;
          }
          event.preventDefault();
          onPress();
        }}
        style={{
          alignSelf: "flex-start",
          minHeight: 48,
          justifyContent: "center",
          paddingHorizontal: variant === "text" ? 0 : 21,
          borderRadius: variant === "text" ? 0 : 16,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: palette.border,
          backgroundColor,
          shadowColor:
            variant === "primary" ? palette.tealStrong : palette.shadow,
          shadowOpacity: variant === "text" ? 0 : 0.13,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 7 },
        }}
      >
        <Text style={{ color: textColor, fontSize: 15, fontWeight: "800" }}>
          {label}
        </Text>
      </WebPressable>
    </Link>
  );
}

export function SupportEmailLink({
  label = SUPPORT_EMAIL,
}: {
  label?: string;
}) {
  const palette = usePublicSitePalette();
  return (
    <Link href={`mailto:${SUPPORT_EMAIL}` as Href} asChild>
      <WebPressable
        accessibilityRole="link"
        accessibilityLabel={`${label}. Opens your email app.`}
        dataSet={{ publicLink: "text" }}
        style={{
          alignSelf: "flex-start",
          minHeight: 44,
          justifyContent: "center",
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: palette.teal, fontSize: 16, fontWeight: "800" }}>
          {label}
        </Text>
      </WebPressable>
    </Link>
  );
}

function PaperDot({ color, size }: { color: string; size: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}

export function PublicSiteShell({ children }: { children: ReactNode }) {
  const palette = usePublicSitePalette();
  const compact = true;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ minHeight: "100%" }}
    >
      <View style={{ width: "100%", overflow: "hidden" }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 340,
            height: 340,
            borderRadius: 170,
            right: -170,
            top: 110,
            backgroundColor: "rgba(255,214,90,0.16)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 250,
            height: 250,
            borderRadius: 125,
            left: -145,
            top: 560,
            backgroundColor: "rgba(72,198,183,0.10)",
          }}
        />
        <PaperDot color="rgba(255,118,94,0.15)" size={18} />

        <Link href="/#main-content" asChild>
          <WebPressable
            accessibilityRole="link"
            dataSet={{ publicSkip: "true" }}
            onPress={() => scrollToPublicSection("main-content")}
            style={{
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: palette.ink,
              shadowColor: palette.shadow,
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>
              Skip to main content
            </Text>
          </WebPressable>
        </Link>

        <WebView
          role="banner"
          dataSet={{ publicChrome: "nav" }}
          style={{
            width: "96%",
            maxWidth: PUBLIC_SITE_MAX_WIDTH - 32,
            alignSelf: "center",
            minHeight: 84,
            marginTop: 16,
            paddingHorizontal: compact ? 18 : 28,
            paddingVertical: 10,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.74)",
            backgroundColor: "rgba(255,253,247,0.76)",
            shadowColor: palette.shadow,
            shadowOpacity: 0.75,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 10 },
            flexDirection: "row",
            alignItems: "center",
            alignContent: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <Link href="/" asChild>
            <WebPressable
              accessibilityRole="link"
              accessibilityLabel="Buki home"
              dataSet={{ publicLink: "text" }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                minHeight: 48,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 15,
                  backgroundColor: palette.surfaceStrong,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: palette.border,
                  shadowColor: palette.shadow,
                  shadowOpacity: 0.8,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 5 },
                }}
              >
                <Image
                  source={{ uri: "/marketing/buki-bear.webp" }}
                  style={{ width: 44, height: 48, marginTop: 1 }}
                  resizeMode="contain"
                />
              </View>
              <BukiWordmark fontSize={35} />
            </WebPressable>
          </Link>

          <WebView
            role="navigation"
            accessibilityLabel="Primary navigation"
            dataSet={{ publicHeaderNav: "true" }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              columnGap: 4,
              rowGap: 2,
            }}
          >
            <SiteNavLink
              href="/#experience"
              onPress={() => scrollToPublicSection("experience")}
            >
              How it works
            </SiteNavLink>
            <SiteNavLink href="/privacy">Privacy</SiteNavLink>
            <SiteNavLink href="/terms">Terms</SiteNavLink>
            <SiteNavLink href="/support">Support</SiteNavLink>
          </WebView>
        </WebView>

        <WebView
          role="main"
          nativeID="main-content"
          tabIndex={-1}
          style={{
            width: "100%",
            maxWidth: PUBLIC_SITE_MAX_WIDTH,
            alignSelf: "center",
            paddingHorizontal: compact ? 18 : 28,
          }}
        >
          {children}
        </WebView>

        <View
          role="contentinfo"
          style={{
            width: "100%",
            maxWidth: PUBLIC_SITE_MAX_WIDTH,
            alignSelf: "center",
            marginTop: compact ? 72 : 110,
            paddingHorizontal: compact ? 18 : 28,
            paddingBottom: 38,
          }}
        >
          <View
            style={{
              paddingTop: 30,
              borderTopWidth: 1,
              borderTopColor: palette.border,
              gap: 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 24,
              }}
            >
              <View
                style={{
                  flexBasis: 280,
                  flexShrink: 1,
                  minWidth: 0,
                  gap: 5,
                  maxWidth: 340,
                }}
              >
                <BukiWordmark fontSize={32} />
                <Text
                  style={{ color: palette.muted, fontSize: 14, lineHeight: 21 }}
                >
                  A warm, private home for the art childhood leaves behind.
                </Text>
              </View>
              <View
                role="navigation"
                accessibilityLabel="Footer navigation"
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  flexShrink: 1,
                  maxWidth: "100%",
                  columnGap: 4,
                  rowGap: 2,
                }}
              >
                <SiteNavLink href="/privacy">Privacy</SiteNavLink>
                <SiteNavLink href="/terms">Terms</SiteNavLink>
                <SiteNavLink href="/support">Support</SiteNavLink>
                <SiteNavLink href="/delete-account">Delete account</SiteNavLink>
              </View>
            </View>
            <Text style={{ color: palette.muted, fontSize: 13 }}>
              © 2026 Buki
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export function PublicSectionHeading({
  eyebrow,
  title,
  description,
  centered = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
}) {
  const palette = usePublicSitePalette();
  const compact = true;

  return (
    <View
      style={{
        gap: 10,
        maxWidth: 840,
        alignSelf: centered ? "center" : "flex-start",
        alignItems: centered ? "center" : "flex-start",
      }}
    >
      {eyebrow ? (
        <Text
          style={{
            color: palette.coralText,
            fontSize: 13,
            fontWeight: "900",
            letterSpacing: 1.1,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Text>
      ) : null}
      <WebText
        accessibilityRole="header"
        aria-level={2}
        dataSet={{ publicHeading: "section" }}
        style={{
          color: palette.ink,
          fontSize: compact ? 44 : 50,
          lineHeight: compact ? 48 : 53,
          fontWeight: "900",
          letterSpacing: -1.4,
          textAlign: centered ? "center" : "left",
        }}
      >
        {title}
      </WebText>
      {description ? (
        <Text
          style={{
            color: palette.muted,
            fontSize: compact ? 16 : 17,
            lineHeight: compact ? 25 : 27,
            textAlign: centered ? "center" : "left",
          }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

export function PublicPageHero({
  eyebrow,
  title,
  summary,
  aside,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  aside?: ReactNode;
}) {
  const palette = usePublicSitePalette();
  const compact = true;

  return (
    <View
      style={{
        paddingTop: compact ? 48 : 76,
        paddingBottom: compact ? 44 : 68,
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 34,
      }}
    >
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 580,
          minWidth: 0,
          maxWidth: 760,
          gap: 15,
        }}
      >
        <Text
          style={{
            color: palette.coralText,
            fontSize: 13,
            fontWeight: "900",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Text>
        <WebText
          accessibilityRole="header"
          aria-level={1}
          dataSet={{ publicHeading: "page" }}
          style={{
            color: palette.ink,
            fontSize: compact ? 50 : 64,
            lineHeight: compact ? 53 : 66,
            fontWeight: "900",
            letterSpacing: -1.8,
          }}
        >
          {title}
        </WebText>
        <Text
          style={{
            color: palette.muted,
            fontSize: compact ? 17 : 19,
            lineHeight: compact ? 27 : 30,
            maxWidth: 720,
          }}
        >
          {summary}
        </Text>
      </View>
      {aside ? <View style={{ flexShrink: 0 }}>{aside}</View> : null}
    </View>
  );
}
