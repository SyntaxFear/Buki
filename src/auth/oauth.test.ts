import { parseOAuthCallback } from "./oauth";

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
});
