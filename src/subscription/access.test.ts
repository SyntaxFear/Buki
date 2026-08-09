import {
  canCreateContent,
  EMPTY_ENTITLEMENT,
  entitlementAtTime,
  FREE_LIMITS,
  remainingContentAllowance,
  resolveCapabilities,
  tierForEntitlement,
  type ContentCounts,
} from "./access";

const counts = (artworks: number, sketchpads = 1, children = 1): ContentCounts => ({
  artworks,
  sketchpads,
  children,
});

describe("Buki access capabilities", () => {
  it("defaults an unknown entitlement to Free", () => {
    expect(tierForEntitlement(EMPTY_ENTITLEMENT.status)).toBe("free");
  });

  it.each(["active", "grace"] as const)("treats %s Pro access as active", (status) => {
    expect(tierForEntitlement(status)).toBe("pro");
  });

  it("enforces the Free artwork boundary at 0, 19, and 20", () => {
    const free = resolveCapabilities("free");
    expect(canCreateContent("artworks", counts(0), free)).toBe(true);
    expect(canCreateContent("artworks", counts(19), free)).toBe(true);
    expect(canCreateContent("artworks", counts(20), free)).toBe(false);
    expect(remainingContentAllowance("artworks", counts(19), free)).toBe(1);
    expect(remainingContentAllowance("artworks", counts(20), free)).toBe(0);
  });

  it("preserves but does not extend an over-limit Free library", () => {
    const free = resolveCapabilities("free");
    expect(canCreateContent("artworks", counts(27), free)).toBe(false);
    expect(canCreateContent("sketchpads", counts(0, 3), free)).toBe(false);
    expect(canCreateContent("children", counts(0, 1, 2), free)).toBe(false);
  });

  it("gives Pro unlimited local content and every Pro capability", () => {
    const pro = resolveCapabilities("pro");
    expect(canCreateContent("artworks", counts(1_000_000, 200, 50), pro)).toBe(true);
    expect(pro.cloudBackup).toBe(true);
    expect(pro.exportData).toBe(true);
    expect(pro.advancedOrganization).toBe(true);
    expect(pro.premiumVisuals).toBe(true);
    expect(pro.maxArtworks).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps the documented Free limits in one canonical place", () => {
    expect(FREE_LIMITS).toEqual({ children: 1, sketchpads: 1, artworks: 20 });
  });

  it("expires a cached subscription after its store expiration time", () => {
    expect(
      entitlementAtTime(
        {
          product: "monthly",
          status: "active",
          expiresAt: "2026-08-01T00:00:00Z",
          willRenew: true,
          checkedAt: "2026-07-30T00:00:00Z",
        },
        Date.parse("2026-08-08T00:00:00Z"),
      ),
    ).toMatchObject({ status: "expired", willRenew: false });
  });

  it("keeps a recently verified grace entitlement active after its renewal timestamp", () => {
    expect(
      entitlementAtTime(
        {
          product: "monthly",
          status: "grace",
          expiresAt: "2026-08-09T11:59:59Z",
          willRenew: false,
          checkedAt: "2026-08-09T11:58:00Z",
        },
        Date.parse("2026-08-09T12:00:00Z"),
      ),
    ).toMatchObject({ status: "grace", willRenew: false });
  });

  it("fails a stale offline grace snapshot closed", () => {
    expect(
      entitlementAtTime(
        {
          product: "yearly",
          status: "grace",
          expiresAt: "2026-08-08T11:59:59Z",
          willRenew: false,
          checkedAt: "2026-08-08T12:00:00Z",
        },
        Date.parse("2026-08-09T12:00:01Z"),
      ),
    ).toMatchObject({ status: "unknown", willRenew: false });
  });

  it.each(["monthly", "yearly"] as const)(
    "fails a cached %s subscription closed when its expiration is missing",
    (product) => {
      expect(
        entitlementAtTime({
          product,
          status: "active",
          expiresAt: null,
          willRenew: true,
          checkedAt: "2026-08-08T00:00:00Z",
        }),
      ).toMatchObject({ status: "unknown", willRenew: false });
    },
  );

  it.each(["monthly", "yearly", "lifetime"] as const)(
    "fails a cached %s entitlement closed when its expiration is malformed",
    (product) => {
      expect(
        entitlementAtTime({
          product,
          status: "active",
          expiresAt: "not-a-store-date",
          willRenew: true,
          checkedAt: "2026-08-08T00:00:00Z",
        }),
      ).toMatchObject({ status: "unknown", willRenew: false });
    },
  );

  it("keeps lifetime access active without an expiration date", () => {
    expect(
      entitlementAtTime(
        {
          product: "lifetime",
          status: "active",
          expiresAt: null,
          willRenew: false,
          checkedAt: "2026-08-08T00:00:00Z",
        },
        Date.parse("2036-08-08T00:00:00Z"),
      ).status,
    ).toBe("active");
  });
});
