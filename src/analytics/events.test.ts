import { buildAnalyticsEvent, remoteAnalyticsEvent } from "./events";

describe("privacy-safe analytics events", () => {
  it("keeps only enumerated funnel fields", () => {
    const event = buildAnalyticsEvent(
      "adult-1",
      {
        name: "purchase_completed",
        source: "Artwork Limit / Retry",
        feature: "artworks",
        plan: "yearly",
        result: "success",
      },
      {
        id: "event-1",
        now: Date.parse("2026-08-09T00:00:00.000Z"),
        appVersion: "1.0.1",
        buildNumber: "7",
      },
    );

    expect(event).toEqual({
      id: "event-1",
      ownerId: "adult-1",
      eventName: "purchase_completed",
      source: "artwork_limit_retry",
      feature: "artworks",
      plan: "yearly",
      result: "success",
      exportKind: null,
      appVersion: "1.0.1",
      buildNumber: "7",
      occurredAt: Date.parse("2026-08-09T00:00:00.000Z"),
    });
    expect(remoteAnalyticsEvent(event)).not.toHaveProperty("owner_id");
    expect(remoteAnalyticsEvent(event)).not.toHaveProperty("metadata");
  });

  it("normalizes internal sources and drops unsupported optional values", () => {
    const event = buildAnalyticsEvent(
      "adult-1",
      {
        name: "export_used",
        source: "Save to Photos",
        exportKind: "png",
        plan: "unexpected" as "monthly",
      },
      { id: "event-2", now: 1 },
    );

    expect(event.source).toBe("save_to_photos");
    expect(event.plan).toBeNull();
    expect(event.exportKind).toBe("png");
  });
});
