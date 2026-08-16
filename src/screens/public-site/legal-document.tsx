import { Text, View } from "react-native";

import {
  PublicPageHero,
  PublicSiteMeta,
  PublicSiteShell,
  SupportEmailLink,
  usePublicSitePalette,
} from "@/components/public-site";
import type { LegalDocument } from "@/marketing/content";

function DocumentSummary({ document }: { document: LegalDocument }) {
  const palette = usePublicSitePalette();
  return (
    <View
      style={{
        width: 220,
        padding: 22,
        borderRadius: 24,
        backgroundColor: "rgba(22,125,130,0.08)",
        borderWidth: 1,
        borderColor: "rgba(22,125,130,0.13)",
        gap: 12,
      }}
    >
      <Text
        style={{ color: palette.teal, fontFamily: "PatrickHand", fontSize: 22 }}
      >
        At a glance
      </Text>
      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 20 }}>
        {document.sections.length} clear sections covering the app, account,
        family content, and your choices.
      </Text>
      <View style={{ height: 1, backgroundColor: palette.border }} />
      <Text style={{ color: palette.ink, fontSize: 12, fontWeight: "800" }}>
        {document.effectiveDate}
      </Text>
    </View>
  );
}

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
  const compact = true;

  return (
    <PublicSiteShell>
      <PublicSiteMeta
        title={`${document.title} - Buki`}
        description={metaDescription}
        path={path}
        keywords={
          path === "/privacy"
            ? ["Buki privacy policy", "children's artwork privacy"]
            : ["Buki terms of use", "Buki Pro terms"]
        }
      />
      <PublicPageHero
        eyebrow={document.effectiveDate}
        title={document.title}
        summary={document.summary}
        aside={<DocumentSummary document={document} />}
      />

      <View
        style={{
          maxWidth: 880,
          padding: compact ? 22 : 38,
          borderRadius: compact ? 26 : 34,
          backgroundColor: palette.surfaceStrong,
          borderWidth: 1,
          borderColor: palette.border,
          shadowColor: palette.shadow,
          shadowOpacity: 0.7,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: 14 },
        }}
      >
        {document.sections.map((section, index) => (
          <View
            key={section.title}
            style={{
              paddingTop: index === 0 ? 0 : compact ? 30 : 38,
              paddingBottom: compact ? 30 : 38,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: palette.border,
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 13,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 11,
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
                    fontSize: 17,
                  }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  color: palette.ink,
                  fontSize: compact ? 20 : 22,
                  lineHeight: compact ? 27 : 29,
                  fontWeight: "900",
                }}
              >
                {section.title.replace(/^\d+\.\s*/, "")}
              </Text>
            </View>
            {section.paragraphs?.map((paragraph) => (
              <Text
                key={paragraph}
                style={{ color: palette.muted, fontSize: 16, lineHeight: 27 }}
              >
                {paragraph}
              </Text>
            ))}
            {section.bullets?.length ? (
              <View style={{ gap: 12, paddingTop: 2 }}>
                {section.bullets.map((bullet) => (
                  <View
                    key={bullet}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        marginTop: 10,
                        borderRadius: 4,
                        backgroundColor: palette.coral,
                      }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        color: palette.muted,
                        fontSize: 16,
                        lineHeight: 27,
                      }}
                    >
                      {bullet}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        <View
          style={{
            padding: compact ? 22 : 28,
            borderRadius: 22,
            backgroundColor: palette.backgroundDeep,
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
            Questions are welcome.
          </Text>
          <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 24 }}>
            {document.contactLead}
          </Text>
          <SupportEmailLink />
        </View>
      </View>
    </PublicSiteShell>
  );
}
