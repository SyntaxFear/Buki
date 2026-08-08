import { parseServerEntitlement } from "./server-entitlement";

describe("server entitlement response", () => {
  it("parses read-only retention details", () => {
    expect(parseServerEntitlement({
      active: false,
      hadPro: true,
      cloudAccess: false,
      expiresAt: "2026-08-08T00:00:00.000Z",
      checkedAt: "2026-08-09T00:00:00.000Z",
      retention: {
        status: "read_only",
        readOnlySince: "2026-08-09T00:00:00.000Z",
        deleteAfter: "2026-11-07T00:00:00.000Z",
        uploadsEnabled: true,
      },
    })).toEqual(expect.objectContaining({
      active: false,
      hadPro: true,
      cloudAccess: false,
      retention: expect.objectContaining({ status: "read_only", uploadsEnabled: true }),
    }));
  });

  it("rejects missing privacy-hold state", () => {
    expect(() => parseServerEntitlement({
      active: true,
      hadPro: true,
      cloudAccess: true,
      checkedAt: "2026-08-09T00:00:00.000Z",
      retention: { status: "active" },
    })).toThrow("invalid entitlement response");
  });

  it("distinguishes a never-subscribed Free account", () => {
    expect(parseServerEntitlement({
      active: false,
      hadPro: false,
      cloudAccess: false,
      expiresAt: null,
      checkedAt: "2026-08-09T00:00:00.000Z",
      retention: {
        status: "inactive",
        readOnlySince: null,
        deleteAfter: null,
        uploadsEnabled: true,
      },
    })).toEqual(expect.objectContaining({
      active: false,
      hadPro: false,
      retention: expect.objectContaining({ status: "inactive" }),
    }));
  });

  it("rejects malformed retention timestamps", () => {
    expect(() => parseServerEntitlement({
      active: false,
      hadPro: true,
      cloudAccess: false,
      expiresAt: null,
      checkedAt: "2026-08-09T00:00:00.000Z",
      retention: {
        status: "read_only",
        readOnlySince: 123,
        deleteAfter: null,
        uploadsEnabled: true,
      },
    })).toThrow("invalid entitlement response");
  });
});
