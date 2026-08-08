import Head from "expo-router/head";
import { Link, type Href } from "expo-router";
import type { PropsWithChildren, ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { SUPPORT_EMAIL } from "@/marketing/content";

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
  yellow: string;
  blue: string;
  shadow: string;
}

const LIGHT_PALETTE: PublicSitePalette = {
  background: "#FFF7E9",
  backgroundDeep: "#F7E8CD",
  surface: "#FFFDF8",
  surfaceStrong: "#FFFFFF",
  ink: "#28435A",
  muted: "#75685A",
  border: "rgba(40,67,90,0.14)",
  teal: "#167D82",
  tealStrong: "#0E6266",
  coral: "#C4473A",
  yellow: "#E9AE2C",
  blue: "#4A79D8",
  shadow: "rgba(61,54,45,0.12)",
};

const DARK_PALETTE: PublicSitePalette = {
  background: "#122733",
  backgroundDeep: "#0C1D27",
  surface: "#193541",
  surfaceStrong: "#20424F",
  ink: "#FFF7E9",
  muted: "#D3C5B3",
  border: "rgba(255,247,233,0.15)",
  teal: "#62D2C5",
  tealStrong: "#8DE6DB",
  coral: "#FF8B73",
  yellow: "#FFD65A",
  blue: "#8CB7F0",
  shadow: "rgba(0,0,0,0.28)",
};

export const PUBLIC_SITE_MAX_WIDTH = 1120;

export function usePublicSitePalette(): PublicSitePalette {
  return useColorScheme() === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}

export function PublicSiteMeta({
  title,
  description,
  path,
  preloadImage,
}: {
  title: string;
  description: string;
  path: string;
  preloadImage?: string;
}) {
  const url = `https://buki.expo.app${path}`;
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="theme-color" content="#167D82" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Buki" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <link rel="canonical" href={url} />
      {preloadImage ? <link rel="preload" as="image" href={preloadImage} fetchPriority="high" /> : null}
    </Head>
  );
}

function SiteNavLink({ href, children }: PropsWithChildren<{ href: Href }>) {
  const palette = usePublicSitePalette();
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: palette.ink, fontSize: 14, fontWeight: "700" }}>{children}</Text>
      </Pressable>
    </Link>
  );
}

export function PublicSiteLink({
  href,
  label,
  variant = "primary",
}: {
  href: Href;
  label: string;
  variant?: "primary" | "secondary" | "text";
}) {
  const palette = usePublicSitePalette();
  const backgroundColor =
    variant === "primary" ? palette.teal : variant === "secondary" ? palette.surfaceStrong : "transparent";
  const textColor = variant === "primary" ? "#FFFFFF" : variant === "secondary" ? palette.ink : palette.teal;
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        style={{
          alignSelf: "flex-start",
          minHeight: 46,
          justifyContent: "center",
          paddingHorizontal: variant === "text" ? 0 : 20,
          borderRadius: variant === "text" ? 0 : 14,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: palette.border,
          backgroundColor,
        }}
      >
        <Text style={{ color: textColor, fontSize: 15, fontWeight: "800" }}>{label}</Text>
      </Pressable>
    </Link>
  );
}

export function SupportEmailLink({ label = SUPPORT_EMAIL }: { label?: string }) {
  const palette = usePublicSitePalette();
  return (
    <Link href={`mailto:${SUPPORT_EMAIL}` as Href} asChild>
      <Pressable accessibilityRole="link" style={{ alignSelf: "flex-start" }}>
        <Text style={{ color: palette.teal, fontSize: 16, fontWeight: "800" }}>{label}</Text>
      </Pressable>
    </Link>
  );
}

export function PublicSiteShell({ children }: { children: ReactNode }) {
  const palette = usePublicSitePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ minHeight: "100%" }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: PUBLIC_SITE_MAX_WIDTH,
          alignSelf: "center",
          boxSizing: "border-box",
          paddingHorizontal: 22,
        }}
      >
        <View
          role="banner"
          style={{
            minHeight: 72,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            paddingVertical: 12,
            gap: 10,
          }}
        >
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Buki home"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  backgroundColor: palette.surfaceStrong,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: palette.border,
                }}
              >
                <Image
                  source={{ uri: "/marketing/buki-bear.webp" }}
                  style={{ width: 42, height: 42 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={{ color: palette.teal, fontSize: 28, fontWeight: "900", letterSpacing: -1 }}>Buki</Text>
            </Pressable>
          </Link>
          <View
            role="navigation"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            <SiteNavLink href="/privacy">Privacy</SiteNavLink>
            <SiteNavLink href="/terms">Terms</SiteNavLink>
            <SiteNavLink href="/support">Support</SiteNavLink>
          </View>
        </View>
        <View role="main">{children}</View>
        <View
          role="contentinfo"
          style={{
            marginTop: 72,
            paddingVertical: 34,
            borderTopWidth: 1,
            borderTopColor: palette.border,
            gap: 18,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.teal, fontSize: 24, fontWeight: "900" }}>Buki</Text>
              <Text style={{ color: palette.muted, fontSize: 14 }}>A private home for children&apos;s art.</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
              <SiteNavLink href="/privacy">Privacy</SiteNavLink>
              <SiteNavLink href="/terms">Terms</SiteNavLink>
              <SiteNavLink href="/support">Support</SiteNavLink>
              <SiteNavLink href="/delete-account">Delete account</SiteNavLink>
            </View>
          </View>
          <Text style={{ color: palette.muted, fontSize: 13 }}>© 2026 Buki</Text>
        </View>
      </View>
    </ScrollView>
  );
}

export function PublicSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const palette = usePublicSitePalette();
  return (
    <View style={{ gap: 12, maxWidth: 720 }}>
      <Text style={{ color: palette.ink, fontSize: 36, lineHeight: 42, fontWeight: "900", letterSpacing: -1.2 }}>
        {title}
      </Text>
      {description ? (
        <Text style={{ color: palette.muted, fontSize: 17, lineHeight: 27 }}>{description}</Text>
      ) : null}
    </View>
  );
}
