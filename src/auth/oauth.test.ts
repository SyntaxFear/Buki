import { oauthCallbackUrlFromRouteParams, parseOAuthCallback } from "./oauth";

describe("OAuth callback parsing", () => {
  it("parses a PKCE authorization code", () => {
    expect(parseOAuthCallback("buki://auth/callback?code=abc123")).toMatchObject({
      code: "abc123",
      error: null,
    });
  });

  it("rejects raw session credentials from unsolicited deep links", () => {
    expect(() =>
      parseOAuthCallback("buki://auth/callback#access_token=access&refresh_token=refresh"),
    ).toThrow("Unsolicited authentication credentials are not accepted");
  });

  it("surfaces provider errors", () => {
    expect(parseOAuthCallback("buki://auth/callback?error=access_denied").error).toBe(
      "access_denied",
    );
  });

  it("rejects token hashes that are not bound to the local OTP flow", () => {
    expect(() =>
      parseOAuthCallback("buki://auth/callback?token_hash=hashed&type=magiclink"),
    ).toThrow("Unsolicited authentication credentials are not accepted");
  });

  it("rejects callbacks outside the exact Buki route", () => {
    expect(() => parseOAuthCallback("https://example.com/auth/callback?code=abc123")).toThrow(
      "not valid for Buki",
    );
    expect(() => parseOAuthCallback("buki://other/callback?code=abc123")).toThrow(
      "not valid for Buki",
    );
    expect(() => parseOAuthCallback("buki://auth/other?code=abc123")).toThrow(
      "not valid for Buki",
    );
  });

  it("reconstructs Expo Router callback params when Linking has no URL", () => {
    const url = oauthCallbackUrlFromRouteParams({ code: "abc123" });
    expect(url).not.toBeNull();
    expect(parseOAuthCallback(url!)).toEqual({ code: "abc123", error: null });
  });

  it("preserves provider errors from Expo Router callback params", () => {
    const url = oauthCallbackUrlFromRouteParams({
      error: "access_denied",
      error_code: "otp_expired",
      error_description: "Email link is invalid or has expired",
    });
    expect(parseOAuthCallback(url!).error).toBe(
      "Email link is invalid or has expired",
    );
  });

  it("preserves unsafe route credentials so the strict parser rejects them", () => {
    const url = oauthCallbackUrlFromRouteParams({
      access_token: "access",
      refresh_token: "refresh",
    });
    expect(() => parseOAuthCallback(url!)).toThrow(
      "Unsolicited authentication credentials are not accepted",
    );
  });

  it("preserves duplicate route codes so the strict parser rejects ambiguity", () => {
    const url = oauthCallbackUrlFromRouteParams({ code: ["first", "second"] });
    expect(() => parseOAuthCallback(url!)).toThrow(
      "authentication callback is ambiguous",
    );
  });

  it("returns null when route params contain no callback data", () => {
    expect(oauthCallbackUrlFromRouteParams({ screen: "callback" })).toBeNull();
  });
});
