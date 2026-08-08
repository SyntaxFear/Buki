import { Text, View } from "react-native";

import {
  PublicSiteMeta,
  PublicSiteShell,
  SupportEmailLink,
  usePublicSitePalette,
} from "@/components/public-site";
import type { LegalDocument } from "@/marketing/content";

export function LegalDocumentScreen({
  document,
  path,
  metaDescription,
}: {
  document: LegalDocument;
  path: "/privacy" | "/terms";
  metaDescription: string;
}) {
  const palette = usePublicSitePalette();
  return (
    <PublicSiteShell>
      <PublicSiteMeta title={`${document.title} - Buki`} description={metaDescription} path={path} />
      <View style={{ maxWidth: 790, paddingTop: 66, paddingBottom: 24, gap: 18 }}>
        <Text style={{ color: palette.coral, fontSize: 13, fontWeight: "900", letterSpacing: 0.7 }}>
          {document.effectiveDate}
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
          {document.title}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 18, lineHeight: 29 }}>{document.summary}</Text>
      </View>

      <View
        style={{
          maxWidth: 790,
          marginTop: 30,
          padding: 26,
          borderRadius: 24,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
          gap: 34,
        }}
      >
        {document.sections.map((section) => (
          <View key={section.title} style={{ gap: 13 }}>
            <Text style={{ color: palette.ink, fontSize: 21, lineHeight: 28, fontWeight: "900" }}>{section.title}</Text>
            {section.paragraphs?.map((paragraph) => (
              <Text key={paragraph} style={{ color: palette.muted, fontSize: 16, lineHeight: 26 }}>
                {paragraph}
              </Text>
            ))}
            {section.bullets?.length ? (
              <View style={{ gap: 10 }}>
                {section.bullets.map((bullet) => (
                  <View key={bullet} style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
                    <View
                      style={{ width: 6, height: 6, marginTop: 10, borderRadius: 99, backgroundColor: palette.coral }}
                    />
                    <Text style={{ flex: 1, color: palette.muted, fontSize: 16, lineHeight: 26 }}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
        <View
          style={{
            paddingTop: 26,
            borderTopWidth: 1,
            borderTopColor: palette.border,
            gap: 10,
          }}
        >
          <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 25 }}>{document.contactLead}</Text>
          <SupportEmailLink />
        </View>
      </View>
    </PublicSiteShell>
  );
}
