import { parseOAuthCallback } from "./oauth";

describe("OAuth callback parsing", () => {
  it("parses a PKCE authorization code", () => {
    expect(parseOAuthCallback("buki://auth/callback?code=abc123")).toMatchObject({
      code: "abc123",
      error: null,
    });
  });

  it("parses legacy fragment tokens", () => {
    expect(
      parseOAuthCallback("buki://auth/callback#access_token=access&refresh_token=refresh"),
    ).toMatchObject({ accessToken: "access", refreshToken: "refresh" });
  });

  it("surfaces provider errors", () => {
    expect(parseOAuthCallback("buki://auth/callback?error=access_denied").error).toBe(
      "access_denied",
    );
  });

  it("parses an email-link token hash", () => {
    expect(
      parseOAuthCallback("buki://auth/callback?token_hash=hashed&type=magiclink"),
    ).toMatchObject({ tokenHash: "hashed", type: "magiclink" });
  });
});
